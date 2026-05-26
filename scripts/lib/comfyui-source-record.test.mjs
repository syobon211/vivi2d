import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  comfyUiSourceRecordRequiredReasons,
  comfyUiTrackedSourceRecordReasons,
  hashComfyUiCompatPluginSourceTree,
  validateComfyUiSourceRecord,
  validateComfyUiTrackedSourceRecord,
} from "./comfyui-source-record.mjs";

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-comfyui-record-"));
  tempRoots.push(root);
  return root;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeCompleteRecord(root, overrides = {}) {
  writeFile(
    root,
    "docs/developer/quality/comfyui-plugin-source-record.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "reviewed",
        compatPlugin: {
          installDirectory: "vivi2d_compat_plugin",
          sourceLocation: "https://example.invalid/vivi2d_compat_plugin-0.1.0.zip",
          version: "0.1.0",
          sha256:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          signature: null,
          licenseSpdx: "MIT",
          supportedVivi2DBuildRange: ">=0.0.0 <1.0.0",
          reviewed: true,
          ...(overrides.compatPlugin ?? {}),
        },
        seeThrough: {
          upstreamRepo: "jtydhr88/ComfyUI-See-through",
          testedTagOrCommit: "v1.0.0",
          thirdPartyNotice:
            "ComfyUI-See-through is a third-party ComfyUI custom-node plugin.",
          reviewed: true,
          ...(overrides.seeThrough ?? {}),
        },
      },
      null,
      2,
    )}\n`,
  );
}

function writeTrackedSourceRecord(root, overrides = {}) {
  const sha256 =
    overrides.compatPlugin?.sha256 ??
    hashComfyUiCompatPluginSourceTree(root) ??
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  writeFile(
    root,
    "docs/developer/quality/comfyui-plugin-source-record.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "internalSourceTracked",
        compatPlugin: {
          installDirectory: "vivi2d_compat_plugin",
          sourceLocation: "repo:integrations/comfyui/vivi2d_compat_plugin",
          version: "0.1.0",
          sha256,
          signature: null,
          licenseSpdx: "NOASSERTION",
          supportedVivi2DBuildRange: "internal-only; public support range pending",
          reviewed: false,
          ...(overrides.compatPlugin ?? {}),
        },
        seeThrough: {
          upstreamRepo: "jtydhr88/ComfyUI-See-through",
          testedTagOrCommit: null,
          thirdPartyNotice:
            "ComfyUI-See-through is installed separately from its upstream repository.",
          reviewed: false,
          ...(overrides.seeThrough ?? {}),
        },
      },
      null,
      2,
    )}\n`,
  );
}

describe("comfyui-source-record", () => {
  it("requires the record when the ComfyUI user route is published", () => {
    const root = makeTempRoot();
    const reasons = comfyUiSourceRecordRequiredReasons(root, {
      publicationRoutes: new Map([
        ["integrations/comfyui", { slug: "integrations/comfyui", published: true }],
      ]),
      releaseCandidate: true,
    });

    expect(reasons).toContain("published integrations/comfyui route");
    expect(validateComfyUiSourceRecord(root, reasons).join("\n")).toContain(
      "complete ComfyUI compat plugin source record is required",
    );
  });

  it("requires the record when release notes include ComfyUI install guidance", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "CHANGELOG.md",
      "Install ComfyUI custom_nodes with vivi2d_compat_plugin for local testing.\n",
    );

    const reasons = comfyUiSourceRecordRequiredReasons(root);

    expect(reasons.join("\n")).toContain("CHANGELOG.md install guidance");
  });

  it("does not require the record for unrelated ComfyUI and install notes", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "CHANGELOG.md",
      [
        "Improved ComfyUI connection diagnostics.",
        "",
        "Install packages from the normal release archive.",
      ].join("\n"),
    );

    expect(comfyUiSourceRecordRequiredReasons(root)).toEqual([]);
  });

  it("requires a source record when compat plugin source is added", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );

    const reasons = comfyUiTrackedSourceRecordReasons(root);

    expect(reasons.join("\n")).toContain(
      "integrations/comfyui/vivi2d_compat_plugin source",
    );
    expect(validateComfyUiTrackedSourceRecord(root, reasons).join("\n")).toContain(
      "ComfyUI compat plugin source record is required",
    );
  });

  it("accepts an internal tracked-source record without release approval", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );
    writeTrackedSourceRecord(root);

    expect(
      validateComfyUiTrackedSourceRecord(
        root,
        comfyUiTrackedSourceRecordReasons(root),
      ),
    ).toEqual([]);
  });

  it("rejects an internal tracked-source record with a stale source hash", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );
    writeTrackedSourceRecord(root);
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# changed\n",
    );

    expect(
      validateComfyUiTrackedSourceRecord(
        root,
        comfyUiTrackedSourceRecordReasons(root),
      ).join("\n"),
    ).toContain("compatPlugin.sha256 does not match");
  });

  it("ignores transient Python cache files when hashing tracked source", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );
    writeTrackedSourceRecord(root);
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__pycache__/module.pyc",
      "cache",
    );

    expect(
      validateComfyUiTrackedSourceRecord(
        root,
        comfyUiTrackedSourceRecordReasons(root),
      ),
    ).toEqual([]);
  });

  it("rejects symlink entries in tracked compat plugin source", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );
    writeFile(root, "outside.py", "# outside\n");
    const linkPath = path.join(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/link.py",
    );
    try {
      fs.symlinkSync(path.join(root, "outside.py"), linkPath);
    } catch {
      return;
    }
    writeTrackedSourceRecord(root);

    expect(
      validateComfyUiTrackedSourceRecord(
        root,
        comfyUiTrackedSourceRecordReasons(root),
      ).join("\n"),
    ).toContain("symlinks are not allowed");
  });

  it("rejects non-regular entries in tracked compat plugin source", () => {
    if (process.platform === "win32") return;
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );
    const fifoPath = path.join(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/source.fifo",
    );
    const mkfifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    if (mkfifo.status !== 0) return;
    writeTrackedSourceRecord(root);

    expect(
      validateComfyUiTrackedSourceRecord(
        root,
        comfyUiTrackedSourceRecordReasons(root),
      ).join("\n"),
    ).toContain("non-regular source entry is not allowed");
  });

  it("does not make tracked source a published install-doc record by itself", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );

    expect(comfyUiSourceRecordRequiredReasons(root)).toEqual([]);
  });

  it("accepts a complete reviewed source record", () => {
    const root = makeTempRoot();
    writeCompleteRecord(root);

    expect(validateComfyUiSourceRecord(root, ["published route"])).toEqual([]);
  });

  it("rejects a record without checksum or signature", () => {
    const root = makeTempRoot();
    writeCompleteRecord(root, { compatPlugin: { sha256: null, signature: null } });

    expect(validateComfyUiSourceRecord(root, ["published route"]).join("\n")).toContain(
      "compatPlugin.sha256 or compatPlugin.signature is required",
    );
  });

  it("rejects release publication when license review is still pending", () => {
    const root = makeTempRoot();
    writeTrackedSourceRecord(root, {
      compatPlugin: {
        reviewed: true,
      },
      seeThrough: {
        testedTagOrCommit: "v1.0.0",
        reviewed: true,
      },
    });

    expect(validateComfyUiSourceRecord(root, ["published route"]).join("\n")).toContain(
      "compatPlugin.licenseSpdx must be release-reviewed",
    );
  });

  it("rejects public OSS source publication for an internal-only source record", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "integrations/comfyui/vivi2d_compat_plugin/__init__.py",
      "# placeholder\n",
    );
    writeTrackedSourceRecord(root);

    expect(
      validateComfyUiSourceRecord(root, [
        "public repository publication",
        "source archive publication",
      ]).join("\n"),
    ).toContain("compatPlugin.licenseSpdx must be release-reviewed");
  });
});
