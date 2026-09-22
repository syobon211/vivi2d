// Test-only actual Electron main. Test controls stay in the main process;
// the renderer receives only the unchanged production preload and IPC routes.
const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const config = JSON.parse(fs.readFileSync(process.argv.at(-1), "utf8"));
const documentId = "123e4567-e89b-42d3-a456-426614174000";
assert(path.isAbsolute(config.appRoot));
assert(path.isAbsolute(config.userData));
assert(path.isAbsolute(config.seeder));
assert.equal(new URL(config.pageUrl).protocol, "file:");
assert(fs.statSync(fileURLToPath(config.pageUrl)).isFile());
assert(config.projectTemplate && typeof config.projectTemplate === "object");
assert.equal(typeof config.pngBase64, "string");
app.setPath("userData", config.userData);
app.setAppPath(config.appRoot);
const ownsProcessLock = app.requestSingleInstanceLock();
if (!ownsProcessLock) app.exit(1);

const {
  createContentSecurityPolicy,
  isLoopbackNetworkUrl,
  isTrustedNavigationUrl,
  wrapHandler,
} = require(path.join(config.appRoot, "electron/security.cjs"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const metrics = {
  nativeCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
  nativeCalls: [],
  previews: [],
  openDialogs: 0,
  saveDialogs: 0,
  tamperedResponses: 0,
  heldDeliveries: 0,
};
const snapshotMetrics = () => structuredClone(metrics);
const files = Object.fromEntries(
  ["blob", "manifest", "embedded", "copied"].map((kind) => [
    kind,
    path.join(config.userData, `runtime-preview-${kind}.vivi`),
  ]),
);
let stage = "startup";
let mainWindow = null;
let localExchange = null;
let coordinator = null;
let native = null;
let closing = null;
let canQuit = false;
let selection = null;
let dialogRelease = null;
let holdNextDelivery = false;
let deliveryRelease = null;
let tamperNextResponse = false;
const originalOpenDialog = dialog.showOpenDialog;
const originalSaveDialog = dialog.showSaveDialog;

function choose(kind, hold = false) {
  assert(Object.hasOwn(files, kind), "fixed file selection required");
  assert(!closing && !selection && !dialogRelease, "one owned dialog selection");
  selection = { kind, hold };
}

dialog.showOpenDialog = async (window, options) => {
  assert.equal(window, mainWindow);
  assert.deepEqual(options.properties, ["openFile"]);
  assert.deepEqual(options.filters, [{ name: "Vivi2D Project", extensions: ["vivi"] }]);
  assert(selection, "main-only test selection was not queued");
  metrics.openDialogs++;
  const selected = selection;
  selection = null;
  const result = { canceled: false, filePaths: [files[selected.kind]] };
  if (!selected.hold) return result;
  return new Promise((resolve) => {
    assert(!dialogRelease, "one held dialog");
    dialogRelease = (cancelled = false) => {
      dialogRelease = null;
      resolve(cancelled ? { canceled: true, filePaths: [] } : result);
    };
  });
};
dialog.showSaveDialog = async (window, options) => {
  assert.equal(window, mainWindow);
  assert.equal(options.defaultPath, "project-copy.vivi");
  assert.deepEqual(options.filters, [{ name: "Vivi2D Project", extensions: ["vivi"] }]);
  assert.deepEqual(options.properties, ["showOverwriteConfirmation"]);
  metrics.saveDialogs++;
  return { canceled: false, filePath: files.copied };
};

// Wrap the real validated handler's returned response, never its coordinator
// arguments or native result. This is a controlled transport delay/corruption
// witness; it cannot install capabilities through renderer input.
const trustedHandle = wrapHandler(ipcMain, () => mainWindow);
function handle(channel, handler) {
  trustedHandle(channel, async (event, ...args) => {
    const response = await handler(event, ...args);
    if (
      channel === "local-asset-copy" &&
      args[0]?.operation === "preview" &&
      response?.ok === true &&
      response.value?.kind === "runtimePreviewV1"
    ) {
      const value = response.value;
      metrics.previews.push({
        atlasResolutions: structuredClone(value.atlasResolutions),
        objects: value.objects.map((object) => ({
          objectAddress: object.objectAddress,
          byteLength: object.bytes.byteLength,
          sha256: hash(object.bytes),
        })),
      });
      if (tamperNextResponse) {
        tamperNextResponse = false;
        const manifestAddresses = new Set(
          value.atlasResolutions
            .filter(
              (row) =>
                row.status === "ready" &&
                row.verified.asset.storageKind === "chunk_manifest",
            )
            .map((row) => row.verified.asset.objectAddress),
        );
        assert(
          manifestAddresses.size > 0,
          "tamper witness requires an actual manifest capture",
        );
        const chunk = value.objects.find(
          (object) => !manifestAddresses.has(object.objectAddress),
        );
        assert(chunk && chunk.bytes.byteLength > 0, "actual physical chunk required");
        chunk.bytes[0] ^= 1;
        metrics.tamperedResponses++;
      }
      if (holdNextDelivery) {
        holdNextDelivery = false;
        assert(!deliveryRelease, "one held real response");
        metrics.heldDeliveries++;
        await new Promise((resolve) => {
          deliveryRelease = () => {
            deliveryRelease = null;
            resolve();
          };
        });
      }
    }
    return response;
  });
}

async function close() {
  if (closing) return closing;
  closing = (async () => {
    selection = null;
    dialogRelease?.(true);
    deliveryRelease?.();
    try {
      if (coordinator) await coordinator.close();
      else if (native) await native.close();
    } finally {
      localExchange?.close();
      dialog.showOpenDialog = originalOpenDialog;
      dialog.showSaveDialog = originalSaveDialog;
      if (config.report) {
        fs.writeFileSync(
          config.report,
          JSON.stringify({
            closed: true,
            metrics: snapshotMetrics(),
            scope:
              "Main-process real IPC/native observations only; renderer pixel acceptance is reported by the parent checker.",
          }),
          { flag: "wx" },
        );
      }
      canQuit = true;
    }
  })();
  return closing;
}
app.on("before-quit", (event) => {
  if (!canQuit) {
    event.preventDefault();
    void close().then(
      () => app.quit(),
      () => app.exit(1),
    );
  }
});
app.on("window-all-closed", () => {
  void close().then(
    () => app.quit(),
    () => app.exit(1),
  );
});
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

async function run() {
  await app.whenReady();
  stage = "real-local-exchange-register";
  const { LocalExchangeHost } = require(
    path.join(config.appRoot, "electron/generated/local-exchange-host.cjs"),
  );
  localExchange = await require(
    path.join(config.appRoot, "electron/ipc/local-exchange.cjs"),
  ).register({
    handle,
    appData: config.userData,
    ownsProcessLock,
    Host: LocalExchangeHost,
    getMainWindow: () => mainWindow,
  });
  const host = localExchange.host;
  const source = await host.createWorkspace(documentId);
  const receiver = await host.createReplica(source.cellId);
  const { LocalAssetCopyCoordinator, LocalAssetCopyFault } = require(
    path.join(config.appRoot, "electron/generated/local-asset-copy.cjs"),
  );
  const { loadNativeLocalAsset } = require(
    path.join(config.appRoot, "electron/native-local-asset.cjs"),
  );
  native = loadNativeLocalAsset();
  const observedNative = {
    abiVersion: native.abiVersion,
    start(operation, endpoint, destination, reference, png, width, height) {
      metrics.nativeCounts[operation]++;
      const observation = { operation, width, height, status: "pending" };
      metrics.nativeCalls.push(observation);
      const work = native.start(
        operation,
        endpoint,
        destination,
        reference,
        png,
        width,
        height,
      );
      return {
        token: work.token,
        result: work.result.then(
          (result) => {
            observation.status = result.status;
            return result;
          },
          (error) => {
            observation.status = "rejected";
            throw error;
          },
        ),
      };
    },
    cancel: (token) => native.cancel(token),
    close: () => native.close(),
  };
  coordinator = new LocalAssetCopyCoordinator({
    host,
    userData: config.userData,
    native: observedNative,
    // Test-only main composition of the actual consumer. No production main
    // capability installation or renderer-supplied readiness is implied.
    copyCapabilities: () =>
      new Map([
        ["vivi.cap.referencedAssets", 1],
        ["vivi.cap.maskInvert", 1],
      ]),
  });
  require(path.join(config.appRoot, "electron/ipc/local-asset-copy.cjs")).register({
    handle,
    coordinator,
    Fault: LocalAssetCopyFault,
    getMainWindow: () => mainWindow,
  });

  stage = "real-source-blob-materialization";
  const ports = coordinator.createAuthoringPorts(source.cellId);
  let blob;
  try {
    blob = await ports.materializeEmbeddedAtlas({
      kind: "embedded",
      atlasId: "atlas",
      imageBase64: config.pngBase64,
      declaredWidth: 2,
      declaredHeight: 1,
    });
    assert.equal(blob.asset.contentSha256, hash(Buffer.from(config.pngBase64, "base64")));
    assert.deepEqual(blob.png, { profile: "vivi2d.png.rgba8.v1", width: 2, height: 1 });
  } finally {
    ports.dispose();
  }

  stage = "real-principal-bound-manifest-seed";
  const namespace = `${source.scopeId}\0${source.replicaId}`;
  const key = hash(
    Buffer.from(`vivi2d.electron.local-asset-store.path.v1\0${namespace}`),
  );
  const database = path.join(config.userData, "asset-stores-v1", key, "store.sqlite3");
  const principalHex = Buffer.from(
    `vivi2d.electron.local-asset-store.principal.v1\0${namespace}`,
  ).toString("hex");
  const seeded = spawnSync(
    config.seeder,
    ["seed-principal-hex", database, principalHex],
    {
      windowsHide: true,
      shell: false,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    },
  );
  assert(
    !seeded.error && !seeded.signal && seeded.status === 0,
    "fixed real manifest seeder failed",
  );
  const manifest = JSON.parse(seeded.stdout.trim());
  assert.equal(manifest.storageKind, "chunk_manifest");
  const manifestPorts = coordinator.createAuthoringPorts(source.cellId);
  try {
    const resolved = await manifestPorts.resolveReferencedAtlas({
      kind: "referenced",
      atlasId: "atlas",
      reference: manifest,
      declaredWidth: 2,
      declaredHeight: 1,
    });
    assert.equal(resolved.status, "ready");
    assert.deepEqual(resolved.verified.asset, manifest);
    assert.deepEqual(resolved.verified.png, {
      profile: "vivi2d.png.rgba8.v1",
      width: 2,
      height: 1,
    });
  } finally {
    manifestPorts.dispose();
  }

  stage = "owned-selected-project-fixtures";
  for (const kind of ["blob", "manifest", "embedded"]) {
    const project = structuredClone(config.projectTemplate);
    project.documentId = documentId;
    project.assetMode = kind === "embedded" ? "embedded" : "referenced";
    assert.equal(project.version, 11);
    assert(project.atlases.length > 0 && project.atlases.length <= 32);
    for (const atlas of project.atlases) {
      assert.equal(atlas.width, 2);
      assert.equal(atlas.height, 1);
      atlas.image =
        kind === "embedded" ? config.pngBase64 : kind === "blob" ? blob.asset : manifest;
    }
    const requirements = (project.requires ?? []).filter(
      (item) => item.id !== "vivi.cap.referencedAssets",
    );
    if (kind !== "embedded")
      requirements.push({
        id: "vivi.cap.referencedAssets",
        minVersion: 1,
        requiredFor: ["render"],
      });
    project.requires = requirements;
    fs.writeFileSync(files[kind], JSON.stringify(project), { flag: "wx" });
  }

  stage = "sandboxed-real-preload-window";
  const allowedPermissions = new Set(["media", "midi", "midiSysex", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(allowedPermissions.has(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    allowedPermissions.has(permission),
  );
  const csp = createContentSecurityPolicy({ isDev: false });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] },
    }),
  );
  session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: isLoopbackNetworkUrl(details.url) }),
  );
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    title: "Vivi2D Runtime Preview acceptance",
    webPreferences: {
      preload: path.join(config.appRoot, "electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // The test window is intentionally invisible, but owns a real WebGL
      // renderer whose explicit React/animation-frame work must still settle.
      backgroundThrottling: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  for (const event of ["will-navigate", "will-redirect"]) {
    mainWindow.webContents.on(event, (navigation, url) => {
      if (!isTrustedNavigationUrl(url, { appEntryFileUrl: config.pageUrl }))
        navigation.preventDefault();
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  globalThis.__runtimePreviewMain = Object.freeze({
    info: () => ({
      sourceId: source.cellId,
      receiverId: receiver.cellId,
      files: { ...files },
      metrics: snapshotMetrics(),
    }),
    choose: (kind) => choose(kind),
    holdDialog: (kind) => choose(kind, true),
    releaseDialog: () => {
      assert(dialogRelease, "no held dialog");
      dialogRelease();
    },
    dialogPending: () => dialogRelease !== null,
    holdDelivery: () => {
      assert(!holdNextDelivery && !deliveryRelease && !closing);
      holdNextDelivery = true;
    },
    releaseDelivery: () => {
      assert(deliveryRelease, "no held response");
      deliveryRelease();
    },
    deliveryPending: () => deliveryRelease !== null,
    tamperNext: () => {
      assert(!tamperNextResponse && !closing);
      tamperNextResponse = true;
    },
    snapshotMetrics,
    close,
  });
  await mainWindow.loadURL(config.pageUrl);
  stage = "ready";
}

run().catch(() => {
  console.error(`Runtime preview Electron fixture failed at ${stage}`);
  void close().then(
    () => app.exit(1),
    () => app.exit(1),
  );
});
