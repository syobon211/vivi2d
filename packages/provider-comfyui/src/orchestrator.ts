import type { ComfyUIClient } from "./client";
import { assemblePositionedPsd, assemblePsd } from "./psd-assembler";
import type {
  DecomposeOptions,
  GenerateProgress,
  HistoryEntry,
  PositionedSeethroughLayer,
  PromptGenerateOptions,
  SeethroughLayer,
} from "./types";
import type {
  ViviCompatDecomposeOptions,
  ViviCompatExportOptions,
  ViviCompatImportBundle,
  ViviCompatManifestResult,
  ViviCompatNativeImportBundle,
  ViviSeeThroughLayerAsset,
  ViviSeeThroughManifest,
} from "./vivi2d-compat";
import {
  inspectViviCompatSupport,
  parseViviCompatOutputRef,
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "./vivi2d-compat";
import { buildImageToLayersWorkflow } from "./workflows/image-to-layers";
import { buildImageToManifestWorkflow } from "./workflows/image-to-manifest";
import { buildManifestToPsdWorkflow } from "./workflows/manifest-to-psd";
import { buildPromptToLayersWorkflow } from "./workflows/prompt-to-layers";
import { buildPromptToManifestWorkflow } from "./workflows/prompt-to-manifest";

export async function decomposeImageToPsd(
  client: ComfyUIClient,
  imageBuffer: ArrayBuffer,
  options?: DecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  onProgress?.({
    step: 0,
    total: 100,
    phase: "uploading",
    phaseLabel: "Uploading image...",
  });

  const filename = `vivi2d_input_${Date.now()}.png`;
  const uploadedName = await client.uploadImage(imageBuffer, filename);

  onProgress?.({
    step: 10,
    total: 100,
    phase: "decomposing",
    phaseLabel: "Starting layer decomposition...",
  });

  const workflow = buildImageToLayersWorkflow(uploadedName, options);
  const { prompt_id } = await client.enqueue(workflow);

  const history = await client.waitForCompletion(prompt_id, (step, total) => {
    const percent = Math.round(10 + (step / total) * 70);
    onProgress?.({
      step: percent,
      total: 100,
      phase: "decomposing",
      phaseLabel: `Decomposing... ${Math.round((step / total) * 100)}%`,
    });
  });

  onProgress?.({
    step: 85,
    total: 100,
    phase: "downloading",
    phaseLabel: "Downloading results...",
  });

  return downloadPsdFromHistory(client, history);
}

export async function generateFromPromptToPsd(
  client: ComfyUIClient,
  options: PromptGenerateOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  onProgress?.({
    step: 0,
    total: 100,
    phase: "decomposing",
    phaseLabel: "Starting image generation + decomposition...",
  });

  const workflow = buildPromptToLayersWorkflow(options);
  const { prompt_id } = await client.enqueue(workflow);

  const history = await client.waitForCompletion(prompt_id, (step, total) => {
    const percent = Math.round((step / total) * 85);
    onProgress?.({
      step: percent,
      total: 100,
      phase: "decomposing",
      phaseLabel: `Processing... ${Math.round((step / total) * 100)}%`,
    });
  });

  onProgress?.({
    step: 90,
    total: 100,
    phase: "downloading",
    phaseLabel: "Downloading results...",
  });

  return downloadPsdFromHistory(client, history);
}

export async function ensureViviCompatSupport(client: ComfyUIClient): Promise<void> {
  const report = await inspectViviCompatSupport(client);
  if (
    !report.hasDecomposeNode ||
    report.manifestSchema !== VIVI2D_MANIFEST_SCHEMA_VERSION ||
    report.capability !== VIVI2D_COMPAT_CAPABILITY ||
    report.pluginVersion !== VIVI2D_COMPAT_PLUGIN_VERSION
  ) {
    throw new Error(`Vivi2D compat plugin is unavailable: ${report.issues.join("; ")}`);
  }
}

export async function decomposeImageToManifest(
  client: ComfyUIClient,
  imageBuffer: ArrayBuffer,
  options?: ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviCompatManifestResult> {
  await ensureViviCompatSupport(client);

  onProgress?.({
    step: 0,
    total: 100,
    phase: "uploading",
    phaseLabel: "Uploading image...",
  });

  const filename = `vivi2d_input_${Date.now()}.png`;
  const uploadedName = await client.uploadImage(imageBuffer, filename);

  onProgress?.({
    step: 10,
    total: 100,
    phase: "decomposing",
    phaseLabel: "Starting compat decomposition...",
  });

  const workflow = buildImageToManifestWorkflow(uploadedName, options);
  const { prompt_id } = await client.enqueue(workflow);
  const history = await client.waitForCompletion(prompt_id, (step, total) => {
    const percent = Math.round(10 + (step / total) * 75);
    onProgress?.({
      step: percent,
      total: 100,
      phase: "decomposing",
      phaseLabel: `Decomposing... ${Math.round((step / total) * 100)}%`,
    });
  });

  onProgress?.({
    step: 90,
    total: 100,
    phase: "downloading",
    phaseLabel: "Downloading manifest...",
  });

  return downloadManifestFromHistory(client, history);
}

export async function generateFromPromptToManifest(
  client: ComfyUIClient,
  options: PromptGenerateOptions & ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviCompatManifestResult> {
  await ensureViviCompatSupport(client);

  onProgress?.({
    step: 0,
    total: 100,
    phase: "decomposing",
    phaseLabel: "Starting image generation + compat decomposition...",
  });

  const workflow = buildPromptToManifestWorkflow(options);
  const { prompt_id } = await client.enqueue(workflow);
  const history = await client.waitForCompletion(prompt_id, (step, total) => {
    const percent = Math.round((step / total) * 85);
    onProgress?.({
      step: percent,
      total: 100,
      phase: "decomposing",
      phaseLabel: `Processing... ${Math.round((step / total) * 100)}%`,
    });
  });

  onProgress?.({
    step: 90,
    total: 100,
    phase: "downloading",
    phaseLabel: "Downloading manifest...",
  });

  return downloadManifestFromHistory(client, history);
}

export async function exportCompatManifestToPsd(
  client: ComfyUIClient,
  manifestPath: string,
  options?: ViviCompatExportOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  const report = await inspectViviCompatSupport(client);
  if (!report.hasDecomposeNode) {
    throw new Error(`Vivi2D compat plugin is unavailable: ${report.issues.join("; ")}`);
  }

  onProgress?.({
    step: 0,
    total: 100,
    phase: "assembling",
    phaseLabel: "Starting PSD export...",
  });

  if (!report.hasExportNode) {
    onProgress?.({
      step: 20,
      total: 100,
      phase: "downloading",
      phaseLabel: "Compat export node is unavailable. Downloading manifest layers...",
    });

    const manifestBuffer = await downloadManifestPsdFallback(
      client,
      manifestPath,
      onProgress,
    );

    onProgress?.({
      step: 100,
      total: 100,
      phase: "assembling",
      phaseLabel: "PSD assembled locally.",
    });

    return manifestBuffer;
  }

  const workflow = buildManifestToPsdWorkflow(manifestPath, options);
  const { prompt_id } = await client.enqueue(workflow);
  const history = await client.waitForCompletion(prompt_id, (step, total) => {
    const percent = Math.round((step / total) * 80);
    onProgress?.({
      step: percent,
      total: 100,
      phase: "assembling",
      phaseLabel: `Exporting PSD... ${Math.round((step / total) * 100)}%`,
    });
  });

  onProgress?.({
    step: 90,
    total: 100,
    phase: "downloading",
    phaseLabel: "Downloading PSD...",
  });

  return downloadCompatPsdFromHistory(client, history);
}

export async function decomposeImageToPsdCompat(
  client: ComfyUIClient,
  imageBuffer: ArrayBuffer,
  options?: ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  const bundle = await decomposeImageToImportBundleCompat(
    client,
    imageBuffer,
    options,
    onProgress,
  );
  return bundle.psdBuffer;
}

export async function decomposeImageToNativeImportBundleCompat(
  client: ComfyUIClient,
  imageBuffer: ArrayBuffer,
  options?: ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviCompatNativeImportBundle> {
  const manifest = await decomposeImageToManifest(
    client,
    imageBuffer,
    options,
    onProgress,
  );
  const layerAssets = await downloadManifestLayerAssets(
    client,
    manifest.manifestPath,
    manifest.manifest,
    onProgress,
  );

  return {
    ...manifest,
    layerAssets,
  };
}

export async function decomposeImageToImportBundleCompat(
  client: ComfyUIClient,
  imageBuffer: ArrayBuffer,
  options?: ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviCompatImportBundle> {
  const manifest = await decomposeImageToManifest(
    client,
    imageBuffer,
    options,
    onProgress,
  );
  const report = await inspectViviCompatSupport(client);
  const psdBuffer = !report.hasExportNode
    ? await assembleManifestPsdFallback(
        client,
        manifest.manifestPath,
        manifest.manifest,
        onProgress,
      )
    : await exportCompatManifestToPsd(
        client,
        manifest.manifestPath,
        { filenamePrefix: options?.filenamePrefix },
        onProgress,
      );

  return {
    ...manifest,
    psdBuffer,
  };
}

export async function generateFromPromptToNativeImportBundleCompat(
  client: ComfyUIClient,
  options: PromptGenerateOptions & ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviCompatNativeImportBundle> {
  const manifest = await generateFromPromptToManifest(client, options, onProgress);
  const layerAssets = await downloadManifestLayerAssets(
    client,
    manifest.manifestPath,
    manifest.manifest,
    onProgress,
  );

  return {
    ...manifest,
    layerAssets,
  };
}

export async function generateFromPromptToImportBundleCompat(
  client: ComfyUIClient,
  options: PromptGenerateOptions & ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviCompatImportBundle> {
  const manifest = await generateFromPromptToManifest(client, options, onProgress);
  const report = await inspectViviCompatSupport(client);
  const psdBuffer = !report.hasExportNode
    ? await assembleManifestPsdFallback(
        client,
        manifest.manifestPath,
        manifest.manifest,
        onProgress,
      )
    : await exportCompatManifestToPsd(
        client,
        manifest.manifestPath,
        { filenamePrefix: options.filenamePrefix },
        onProgress,
      );

  return {
    ...manifest,
    psdBuffer,
  };
}

export async function generateFromPromptToPsdCompat(
  client: ComfyUIClient,
  options: PromptGenerateOptions & ViviCompatDecomposeOptions,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  const bundle = await generateFromPromptToImportBundleCompat(
    client,
    options,
    onProgress,
  );
  return bundle.psdBuffer;
}

async function assembleManifestPsdFallback(
  client: ComfyUIClient,
  manifestPath: string,
  manifest: ViviSeeThroughManifest,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  const layerAssets = await downloadManifestLayerAssets(
    client,
    manifestPath,
    manifest,
    onProgress,
  );
  const assetByPath = new Map(
    layerAssets.map((asset) => [asset.image_path, asset.imageData] as const),
  );

  const layers: PositionedSeethroughLayer[] = [];
  for (const layer of manifest.layers) {
    const imageData = assetByPath.get(layer.image_path);
    if (!imageData) {
      throw new Error(`Missing manifest layer asset: ${layer.image_path}`);
    }
    const [left, top, right, bottom] = layer.bbox;
    layers.push({
      name: layer.name,
      psdLeafToken: layer.psd_leaf_token,
      imageData,
      order: layer.order,
      left,
      top,
      right,
      bottom,
    });
  }

  onProgress?.({
    step: 85,
    total: 100,
    phase: "assembling",
    phaseLabel: "Assembling PSD locally...",
  });

  return assemblePositionedPsd(layers, manifest.canvas.width, manifest.canvas.height);
}

async function downloadManifestLayerAssets(
  client: ComfyUIClient,
  manifestPath: string,
  manifest: ViviSeeThroughManifest,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ViviSeeThroughLayerAsset[]> {
  const manifestLocation = parseViviCompatOutputRef(manifestPath);
  const totalLayers = Math.max(1, manifest.layers.length);
  const assets: ViviSeeThroughLayerAsset[] = [];

  for (const [index, layer] of manifest.layers.entries()) {
    const layerPath = joinCompatRelativePath(
      manifestLocation.subfolder,
      layer.image_path,
    );
    const location = parseViviCompatOutputRef(layerPath);
    const imageData = await client.downloadOutput(
      location.filename,
      location.subfolder,
      location.type,
    );
    assets.push({
      image_path: layer.image_path,
      imageData,
    });

    const percent = 20 + Math.round(((index + 1) / totalLayers) * 60);
    onProgress?.({
      step: percent,
      total: 100,
      phase: "downloading",
      phaseLabel: `Downloading manifest layers... ${index + 1}/${totalLayers}`,
    });
  }

  return assets;
}

async function downloadManifestFromHistory(
  client: ComfyUIClient,
  history: HistoryEntry,
): Promise<ViviCompatManifestResult> {
  const manifestPath = findTextOutputByExtension(history, ".json");
  if (!manifestPath) {
    throw new Error("No compat manifest output retrieved from ComfyUI");
  }

  const location = parseViviCompatOutputRef(manifestPath);
  const manifestBuffer = await client.downloadOutput(
    location.filename,
    location.subfolder,
    location.type,
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(new Uint8Array(manifestBuffer)),
  ) as ViviSeeThroughManifest;

  return {
    manifestPath,
    manifest,
  };
}

async function downloadCompatPsdFromHistory(
  client: ComfyUIClient,
  history: HistoryEntry,
): Promise<ArrayBuffer> {
  const psdPath =
    findTextOutputByExtension(history, ".psd") ??
    findImageOutputByExtension(history, ".psd");
  if (!psdPath) {
    throw new Error("No compat PSD output retrieved from ComfyUI");
  }

  const location = parseViviCompatOutputRef(psdPath);
  return client.downloadOutput(location.filename, location.subfolder, location.type);
}

async function downloadManifestPsdFallback(
  client: ComfyUIClient,
  manifestPath: string,
  onProgress?: (progress: GenerateProgress) => void,
): Promise<ArrayBuffer> {
  const manifestLocation = parseViviCompatOutputRef(manifestPath);
  const manifestBuffer = await client.downloadOutput(
    manifestLocation.filename,
    manifestLocation.subfolder,
    manifestLocation.type,
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(new Uint8Array(manifestBuffer)),
  ) as ViviSeeThroughManifest;
  return assembleManifestPsdFallback(client, manifestPath, manifest, onProgress);
}

function joinCompatRelativePath(baseSubfolder: string, relativePath: string): string {
  assertCompatRelativePath(relativePath);
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  if (normalizedRelative.startsWith("output/") || normalizedRelative.startsWith("/")) {
    return normalizedRelative.replace(/^\/+/, "");
  }
  const cleanedBase = baseSubfolder.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!cleanedBase) return normalizedRelative;
  return `${cleanedBase}/${normalizedRelative}`;
}

function assertCompatRelativePath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (!normalized) {
    throw new Error("Compat layer asset path is empty");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`Compat layer asset path must be relative: ${relativePath}`);
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(
      `Compat layer asset path contains invalid traversal: ${relativePath}`,
    );
  }
}

async function downloadPsdFromHistory(
  client: ComfyUIClient,
  history: HistoryEntry,
): Promise<ArrayBuffer> {
  for (const output of Object.values(history.outputs)) {
    if (output.text?.length) {
      for (const text of output.text) {
        if (text.endsWith(".psd")) {
          const psdFilename = text.split("/").pop() ?? text;
          return client.downloadOutput(psdFilename, "", "output");
        }
      }
    }
    if (output.images?.length) {
      for (const img of output.images) {
        if (img.filename.endsWith(".psd")) {
          return client.downloadOutput(img.filename, img.subfolder, img.type);
        }
      }
    }
  }

  const layers = await collectLayerImages(client, history);
  if (layers.length === 0) {
    throw new Error("No output retrieved from ComfyUI");
  }

  const firstDecoded = await decodeImageSize(layers[0]!.imageData);

  return assemblePsd(layers, firstDecoded.width, firstDecoded.height);
}

function findTextOutputByExtension(
  history: HistoryEntry,
  extension: string,
): string | null {
  for (const output of Object.values(history.outputs)) {
    if (!output.text?.length) continue;
    for (const text of output.text) {
      if (text.toLowerCase().endsWith(extension.toLowerCase())) {
        return text;
      }
    }
  }
  return null;
}

function findImageOutputByExtension(
  history: HistoryEntry,
  extension: string,
): string | null {
  for (const output of Object.values(history.outputs)) {
    if (!output.images?.length) continue;
    for (const image of output.images) {
      if (image.filename.toLowerCase().endsWith(extension.toLowerCase())) {
        const joined = image.subfolder
          ? `${image.subfolder}/${image.filename}`
          : image.filename;
        return joined;
      }
    }
  }
  return null;
}

async function collectLayerImages(
  client: ComfyUIClient,
  history: HistoryEntry,
): Promise<SeethroughLayer[]> {
  const layers: SeethroughLayer[] = [];
  let order = 0;

  for (const output of Object.values(history.outputs)) {
    if (!output.images?.length) continue;
    for (const img of output.images) {
      if (img.filename.endsWith(".png")) {
        const imageData = await client.downloadOutput(
          img.filename,
          img.subfolder,
          img.type,
        );
        const name = img.filename
          .replace(/\.[^.]+$/, "")
          .replace(/^vivi2d_seethrough_/, "");
        layers.push({ name, imageData, order: order++ });
      }
    }
  }

  return layers;
}

async function decodeImageSize(
  buffer: ArrayBuffer,
): Promise<{ width: number; height: number }> {
  const view = new DataView(buffer);
  if (view.byteLength >= 24) {
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width > 0 && width < 16384 && height > 0 && height < 16384) {
      return { width, height };
    }
  }
  return { width: 1280, height: 1280 };
}
