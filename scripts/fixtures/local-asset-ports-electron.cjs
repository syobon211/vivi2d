// Test-only actual Electron entry: real F cells, main adapter and native SQLite.
// No C2 support is invented and no referenced Project copy success is claimed.
const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const config = JSON.parse(fs.readFileSync(process.argv.at(-1), "utf8"));
app.setPath("userData", config.userData);
app.setAppPath(config.appRoot);
const documentId = "123e4567-e89b-42d3-a456-426614174000";
const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,16,50,9,99,0,0,1,149,0,157,77,65,8,223,0,0,0,0,73,69,78,68,174,66,96,130]);
let stage = "startup";
async function run() {
  await app.whenReady();
  const { LocalExchangeHost } = require(path.join(config.appRoot, "electron/generated/local-exchange-host.cjs"));
  const { LocalAssetCopyCoordinator } = require(path.join(config.appRoot, "electron/generated/local-asset-copy.cjs"));
  const { loadNativeLocalAsset } = require(path.join(config.appRoot, "electron/native-local-asset.cjs"));
  const host = await LocalExchangeHost.open({ root: path.join(config.userData, "local-exchange-v1"), ownsProcessLock: true });
  const copy = new LocalAssetCopyCoordinator({ host, userData: config.userData, native: loadNativeLocalAsset() });
  try {
    let source, receiver, asset;
    if (config.phase === "seed") {
      stage = "persisted-cell-and-real-materialize";
      source = await host.createWorkspace(documentId);
      receiver = await host.createReplica(source.cellId);
      const ports = copy.createAuthoringPorts(source.cellId);
      const verified = await ports.materializeEmbeddedAtlas({ kind: "embedded", atlasId: "atlas", imageBase64: PNG.toString("base64"), declaredWidth: 1, declaredHeight: 1 });
      asset = verified.asset;
      assert.equal(asset.contentSha256, createHash("sha256").update(PNG).digest("hex"));
      assert.equal(asset.sizeBytes, PNG.length);
      assert.deepEqual(verified.png, { profile: "vivi2d.png.rgba8.v1", width: 1, height: 1 });
      ports.dispose();
      fs.writeFileSync(config.state, JSON.stringify({ sourceId: source.cellId, receiverId: receiver.cellId, asset }), { flag: "wx" });
    } else {
      stage = "process-reopen-real-resolution";
      const saved = JSON.parse(fs.readFileSync(config.state, "utf8"));
      source = host.query(saved.sourceId);
      receiver = host.query(saved.receiverId);
      asset = saved.asset;
    }
    stage = "principal-isolation-real-resolution";
    const request = { kind: "referenced", atlasId: "atlas", reference: asset, declaredWidth: 1, declaredHeight: 1 };
    const actual = await copy.createAuthoringPorts(source.cellId).resolveReferencedAtlas(request);
    assert.equal(actual.status, "ready");
    assert.deepEqual(actual.verified.asset, asset);
    assert.deepEqual(await copy.createAuthoringPorts(receiver.cellId).resolveReferencedAtlas(request), { status: "missing" });
    assert.throws(() => copy.createAuthoringPorts("0".repeat(64)));
    stage = "capability-fail-closed-before-dialog";
    let selected = false;
    await assert.rejects(copy.prepare({}, source.cellId, receiver.cellId, async () => { selected = true; return null; }), { code: "LOCAL_ASSET_UNAVAILABLE" });
    assert.equal(selected, false);
    fs.writeFileSync(config.report, JSON.stringify({ status: "PASS", phase: config.phase, electron: process.versions.electron, checks: ["real-persisted-F-namespace", "actual-main-port-native-readiness", "distinct-replica-missing", "unknown-cell-rejected", "copy-no-fabricated-C2-capability"], scope: "No Project copy, UI or packaged CRT acceptance" }), { flag: "wx" });
  } finally {
    await copy.close();
    host.close();
  }
}
run().then(() => app.quit(), () => { console.error(`Local Asset ports smoke failed at ${stage}`); app.exit(1); });
