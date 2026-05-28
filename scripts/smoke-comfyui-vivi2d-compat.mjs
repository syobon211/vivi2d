import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_IMAGE =
  "e2e/specs/__screenshots__/visual-snapshot.spec.ts/win32/dialog-ai-generate-open.png";
const CLIENT_ID = `vivi2d-smoke-${Date.now()}`;
const REQUIRED_CAPABILITY = "vivi2d.seethrough.v1";
const REQUIRED_PLUGIN_VERSION = "0.1.0";
const REQUIRED_SCHEMA_VERSION = "1.0.0";

function staleBackendHint() {
  return (
    " If you recently updated vivi2d-compat-comfyui, fully restart the " +
    "ComfyUI backend Python process. On ComfyUI Desktop, closing the window " +
    "alone may leave the old backend running."
  );
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    image: DEFAULT_IMAGE,
    filenamePrefix: `vivi2d_smoke_${Date.now()}`,
    timeoutMs: 600_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1] ?? options.baseUrl;
      index += 1;
    } else if (arg === "--image") {
      options.image = argv[index + 1] ?? options.image;
      index += 1;
    } else if (arg === "--filename-prefix") {
      options.filenamePrefix = argv[index + 1] ?? options.filenamePrefix;
      index += 1;
    } else if (arg === "--timeout-ms") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.timeoutMs = value;
      }
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-comfyui-vivi2d-compat.mjs [options]

Options:
  --base-url <url>          ComfyUI base URL (default: ${DEFAULT_BASE_URL})
  --image <path>            Input PNG path relative to repo root
  --filename-prefix <text>  Prefix used by compat nodes
  --timeout-ms <number>     History wait timeout in milliseconds
`);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function uploadImage(baseUrl, imageBuffer, filename) {
  const formData = new FormData();
  formData.append("image", new Blob([imageBuffer]), filename);
  formData.append("overwrite", "true");

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }
  const payload = await response.json();
  return payload.name;
}

async function enqueue(baseUrl, workflow) {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: CLIENT_ID }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Workflow enqueue failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function getHistory(baseUrl, promptId) {
  const response = await fetch(`${baseUrl}/history/${promptId}`);
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  return payload[promptId] ?? null;
}

async function waitForCompletion(baseUrl, promptId, timeoutMs) {
  const startedAt = Date.now();
  for (;;) {
    const history = await getHistory(baseUrl, promptId);
    if (history?.status?.completed) {
      const status = history.status.status_str;
      if (status && status !== "success") {
        throw new Error(`ComfyUI execution ${status}`);
      }
      return history;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out while waiting for compat smoke workflow");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

function parseOutputRef(outputRef) {
  const normalized = outputRef.replace(/\\/g, "/");
  const marker = "/output/";
  let relative = normalized;

  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    relative = normalized.slice(markerIndex + marker.length);
  } else if (normalized.startsWith("output/")) {
    relative = normalized.slice("output/".length);
  }

  const parts = relative.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid output ref: ${outputRef}`);
  }

  return {
    filename: parts.at(-1),
    subfolder: parts.slice(0, -1).join("/"),
    type: "output",
  };
}

function findTextOutput(history, extension) {
  for (const output of Object.values(history.outputs ?? {})) {
    for (const value of output?.text ?? []) {
      if (typeof value === "string" && value.endsWith(extension)) {
        return value;
      }
    }
  }
  return null;
}

async function downloadOutput(baseUrl, outputRef) {
  const location = parseOutputRef(outputRef);
  const params = new URLSearchParams({
    filename: location.filename,
    subfolder: location.subfolder,
    type: location.type,
  });
  const response = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${outputRef}: ${response.status}`);
  }
  return response.arrayBuffer();
}

function buildWorkflow(uploadedName, filenamePrefix) {
  return {
    load: {
      class_type: "LoadImage",
      inputs: {
        image: uploadedName,
        upload: "image",
      },
    },
    decompose: {
      class_type: "ViviSeeThroughDecompose",
      inputs: {
        image: ["load", 0],
        seed: 0,
        resolution: 1024,
        num_inference_steps: 30,
        tblr_split: true,
        use_lama: true,
        quant_mode: "none",
        group_offload: false,
        filename_prefix: filenamePrefix,
        schema_version: REQUIRED_SCHEMA_VERSION,
        plugin_version: REQUIRED_PLUGIN_VERSION,
        capability: REQUIRED_CAPABILITY,
      },
    },
    export_psd: {
      class_type: "ViviSeeThroughExportPSD",
      inputs: {
        manifest_path: ["decompose", 1],
        filename_prefix: filenamePrefix,
      },
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const imagePath = path.resolve(process.cwd(), options.image);
  const imageBuffer = await readFile(imagePath);

  const systemStats = await fetchJson(`${options.baseUrl}/system_stats`);
  const [decomposeInfo, exportInfo] = await Promise.all([
    fetchJson(`${options.baseUrl}/object_info/ViviSeeThroughDecompose`),
    fetchJson(`${options.baseUrl}/object_info/ViviSeeThroughExportPSD`),
  ]);

  const uploadedName = await uploadImage(
    options.baseUrl,
    imageBuffer,
    path.basename(imagePath),
  );
  const workflow = buildWorkflow(uploadedName, options.filenamePrefix);
  const queue = await enqueue(options.baseUrl, workflow);
  const history = await waitForCompletion(
    options.baseUrl,
    queue.prompt_id,
    options.timeoutMs,
  );

  const manifestPath = findTextOutput(history, ".json");
  const psdPath = findTextOutput(history, ".psd");

  if (!manifestPath) {
    throw new Error("Compat smoke workflow did not emit manifest_path");
  }
  if (!psdPath) {
    throw new Error("Compat smoke workflow did not emit psd_path");
  }

  const manifestBuffer = await downloadOutput(options.baseUrl, manifestPath);
  const psdBuffer = await downloadOutput(options.baseUrl, psdPath);
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(manifestBuffer)));

  const decomposeRequired = decomposeInfo?.ViviSeeThroughDecompose?.input?.required ?? {};
  const detectedSchema = decomposeRequired?.schema_version?.[1]?.default ?? null;
  const detectedPluginVersion = decomposeRequired?.plugin_version?.[1]?.default ?? null;
  const detectedCapability = decomposeRequired?.capability?.[1]?.default ?? null;

  if (detectedSchema !== REQUIRED_SCHEMA_VERSION) {
    throw new Error(
      `Compat schema mismatch: expected ${REQUIRED_SCHEMA_VERSION}, got ${detectedSchema}.${staleBackendHint()}`,
    );
  }
  if (detectedPluginVersion !== REQUIRED_PLUGIN_VERSION) {
    throw new Error(
      `Compat plugin version mismatch: expected ${REQUIRED_PLUGIN_VERSION}, got ${detectedPluginVersion}.${staleBackendHint()}`,
    );
  }
  if (detectedCapability !== REQUIRED_CAPABILITY) {
    throw new Error(
      `Compat capability mismatch: expected ${REQUIRED_CAPABILITY}, got ${detectedCapability}.${staleBackendHint()}`,
    );
  }

  const summary = {
    baseUrl: options.baseUrl,
    imagePath,
    promptId: queue.prompt_id,
    capability: {
      hasDecompose: Boolean(decomposeInfo?.ViviSeeThroughDecompose),
      hasExportPsd: Boolean(exportInfo?.ViviSeeThroughExportPSD),
      schemaVersion: detectedSchema,
      pluginVersion: detectedPluginVersion,
      capability: detectedCapability,
    },
    systemStats,
    manifestPath,
    psdPath,
    layerCount: manifest.layers?.length ?? 0,
    canvas: manifest.canvas ?? null,
    psdSize: psdBuffer.byteLength,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
