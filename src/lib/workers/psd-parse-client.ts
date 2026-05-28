import type { ProjectData } from "@vivi2d/core/types";
import { parsePsd } from "@/lib/psd-loader";
import { assertPsdBufferWithinLimit } from "@/lib/psd-security";
import { clearTextures, setTextureFromImageData } from "@/lib/texture-store";
import { runWorker } from "@/lib/workers/worker-runner";
import type { PsdParseRequest, PsdParseResult } from "@/workers/psd-parse.worker";
import PsdParseWorker from "@/workers/psd-parse.worker?worker";

export interface ParsedPsdResult {
  project: ProjectData;

  commitTextures: () => void;
}

export interface ParsePsdOptions {
  signal?: AbortSignal;

  transferInput?: boolean;
}

function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

export function parsePsdAsync(
  buffer: ArrayBuffer,
  fileName: string,
  options?: ParsePsdOptions,
): Promise<ParsedPsdResult> {
  assertPsdBufferWithinLimit(buffer);
  if (!isWorkerSupported()) {
    return Promise.resolve().then(() => {
      const project = parsePsd(buffer, fileName);
      return { project, commitTextures: () => {} };
    });
  }

  const bufferToSend = options?.transferInput === true ? buffer : buffer.slice(0);
  const request: PsdParseRequest = { buffer: bufferToSend, fileName };

  return runWorker<PsdParseRequest, PsdParseResult>({
    createWorker: () => new PsdParseWorker(),
    request,
    transfer: [bufferToSend],
    signal: options?.signal,
    errorLabel: "PSD parse worker error",
  }).then((result) => ({
    project: result.project,
    commitTextures: () => {
      clearTextures();
      for (const tex of result.textures) {
        const data = new Uint8ClampedArray(tex.buffer);
        const imageData = new ImageData(data, tex.width, tex.height);
        setTextureFromImageData(tex.layerId, imageData);
      }
    },
  }));
}
