import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

const decodeFailure = () => new Error("Encoded video decode failed");

// One fixed synthetic E2E clip, not a general media reader or a process sandbox.
async function decodeProcess(
  command: "ffprobe" | "ffmpeg",
  args: string[],
  input: Buffer,
  maxOutput: number,
  deadline: number,
): Promise<Buffer> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw decodeFailure();
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "FFREPORT"),
    );
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
    } catch {
      reject(decodeFailure());
      return;
    }
    const chunks: Buffer[] = [];
    let length = 0;
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      chunks.length = 0;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(fail, remaining);
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.stdout.on("error", fail);
    child.stderr.on("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      if (failed) return;
      if (chunk.length > maxOutput - length) {
        fail();
        return;
      }
      length += chunk.length;
      chunks.push(chunk);
    });
    // At -v error any diagnostic rejects, even on exit0. Retain none of its text.
    child.stderr.on("data", (chunk: Buffer) => {
      if (chunk.length > 0) fail();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failed || code !== 0 || signal || performance.now() >= deadline) {
        reject(decodeFailure());
      } else {
        // close includes stdio completion; three frames arriving is not success.
        resolve(Buffer.concat(chunks, length));
      }
    });
    child.stdin.end(input);
  });
}

export async function decodeThreeVideoFrames(
  input: Buffer,
  dimensions: { width: number; height: number; scale: number },
): Promise<number[][][]> {
  const deadline = performance.now() + 10_000;
  const { width, height, scale } = dimensions;
  const frameBytes = width * height * 3;
  const maxOutput = frameBytes * 4;
  const points = [8, 32].map((x) => [Math.floor(x * scale), Math.floor(20 * scale)]);
  if (
    !Buffer.isBuffer(input) ||
    input.length === 0 ||
    input.length > 8 * 1024 * 1024 ||
    ![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 4096) ||
    !Number.isSafeInteger(maxOutput) ||
    maxOutput > 192 * 1024 * 1024 ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    points.some(([x, y]) => x! < 0 || y! < 0 || x! >= width || y! >= height)
  )
    throw decodeFailure();

  const inputArgs = ["-protocol_whitelist", "pipe", "-f", "matroska", "-i", "pipe:0"];
  const metadata = await decodeProcess(
    "ffprobe",
    [
      "-v",
      "error",
      ...inputArgs,
      "-select_streams",
      "v:0",
      "-show_frames",
      "-show_entries",
      "frame=width,height:stream=width,height",
      "-of",
      "json",
    ],
    input,
    64 * 1024,
    deadline,
  );
  let info: { streams?: unknown; frames?: unknown };
  try {
    info = JSON.parse(metadata.toString("utf8"));
  } catch {
    throw decodeFailure();
  }
  const exactSize = (value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const frame = value as { width?: unknown; height?: unknown };
    return frame.width === width && frame.height === height;
  };
  if (
    !info ||
    !Array.isArray(info.streams) ||
    info.streams.length !== 1 ||
    !info.streams.every(exactSize) ||
    !Array.isArray(info.frames) ||
    info.frames.length !== 3 ||
    !info.frames.every(exactSize)
  )
    throw new Error(
      `Encoded video metadata mismatch: ${JSON.stringify({
        streamCount: Array.isArray(info?.streams) ? info.streams.length : null,
        frameCount: Array.isArray(info?.frames) ? info.frames.length : null,
        streamSizesMatch: Array.isArray(info?.streams) && info.streams.every(exactSize),
        frameSizesMatch: Array.isArray(info?.frames) && info.frames.every(exactSize),
      })}`,
    );

  const rgb = await decodeProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-xerror",
      "-err_detect",
      "explode",
      ...inputArgs,
      "-map",
      "0:v:0",
      "-an",
      "-sn",
      "-dn",
      "-noautoscale",
      "-fps_mode",
      "passthrough",
      "-frames:v",
      "4",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    input,
    maxOutput,
    deadline,
  );
  if (rgb.length !== frameBytes * 3) throw decodeFailure();
  return Array.from({ length: 3 }, (_, frame) =>
    points.map(([x, y]) => {
      const offset = frame * frameBytes + (y! * width + x!) * 3;
      return [rgb[offset]!, rgb[offset + 1]!, rgb[offset + 2]!];
    }),
  );
}
