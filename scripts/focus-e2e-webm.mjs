import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

function printUsage() {
  console.log(`Usage: node scripts/focus-e2e-webm.mjs --input <webm> --output <webm> [options]

Options:
  --start=<seconds>       Start time in seconds. Defaults to 0.
  --from-end=<seconds>    Start this many seconds before the source ends.
  --duration=<seconds>    Output duration in seconds. Defaults to 5.
  --width=<px>            Output canvas width. Defaults to 1280.
  --height=<px>           Output canvas height. Defaults to 720.

Examples:
  npm run video:focus -- --input test-results/electron-videos/page.webm --output tmp/focused.webm --from-end=5 --duration=4.5`);
}

function parseArgs(argv) {
  const options = {
    duration: 5,
    height: 720,
    input: "",
    output: "",
    start: 0,
    width: 1280,
  };
  let fromEnd = null;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    const [key, rawValue = ""] = arg.split("=");
    const value = rawValue.trim();
    switch (key) {
      case "--input":
        options.input = value;
        break;
      case "--output":
        options.output = value;
        break;
      case "--start":
        options.start = Number(value);
        break;
      case "--from-end":
        fromEnd = Number(value);
        break;
      case "--duration":
        options.duration = Number(value);
        break;
      case "--width":
        options.width = Number(value);
        break;
      case "--height":
        options.height = Number(value);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input || !options.output) {
    printUsage();
    throw new Error("--input and --output are required");
  }
  if (!Number.isFinite(options.start) || options.start < 0) {
    throw new Error("--start must be a non-negative number");
  }
  if (fromEnd !== null && (!Number.isFinite(fromEnd) || fromEnd <= 0)) {
    throw new Error("--from-end must be a positive number");
  }
  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    throw new Error("--duration must be a positive number");
  }
  if (!Number.isInteger(options.width) || options.width <= 0) {
    throw new Error("--width must be a positive integer");
  }
  if (!Number.isInteger(options.height) || options.height <= 0) {
    throw new Error("--height must be a positive integer");
  }

  return {
    ...options,
    fromEnd,
    input: path.resolve(options.input),
    output: path.resolve(options.output),
  };
}

function createVideoServer(inputPath) {
  return http.createServer((request, response) => {
    if (request.url !== "/source.webm") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><video id=\"source\" src=\"/source.webm\" muted playsinline></video><canvas id=\"target\"></canvas>");
      return;
    }

    const stat = fs.statSync(inputPath);
    const range = request.headers.range;
    if (range) {
      const [startText, endText] = range.replace(/^bytes=/, "").split("-");
      const start = Number(startText);
      const end = endText ? Number(endText) : stat.size - 1;
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Type": "video/webm",
      });
      fs.createReadStream(inputPath, { end, start }).pipe(response);
      return;
    }

    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": stat.size,
      "Content-Type": "video/webm",
    });
    fs.createReadStream(inputPath).pipe(response);
  });
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start local video server");
  }
  return address.port;
}

async function renderFocusedVideo(options) {
  if (!fs.existsSync(options.input)) {
    throw new Error(`Input video does not exist: ${options.input}`);
  }

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  const server = createVideoServer(options.input);
  const port = await listen(server);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      viewport: { height: options.height, width: options.width },
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    const base64 = await page.evaluate(
      async ({ durationSeconds, fromEnd, height, startSeconds, width }) => {
        const video = document.querySelector("#source");
        const canvas = document.querySelector("#target");
        if (!(video instanceof HTMLVideoElement)) {
          throw new Error("Source video element is missing");
        }
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("Target canvas element is missing");
        }

        canvas.width = width;
        canvas.height = height;

        await new Promise((resolve, reject) => {
          if (Number.isFinite(video.duration)) {
            resolve(true);
            return;
          }
          video.addEventListener("loadedmetadata", () => resolve(true), { once: true });
          video.addEventListener(
            "error",
            () => reject(new Error("Source video failed to load")),
            { once: true },
          );
        });

        const sourceDuration = Number.isFinite(video.duration) ? video.duration : 0;
        const resolvedStart =
          fromEnd === null
            ? startSeconds
            : Math.max(0, sourceDuration - fromEnd);
        const resolvedDuration = Math.min(
          durationSeconds,
          Math.max(0.1, sourceDuration - resolvedStart),
        );

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context is unavailable");

        await new Promise((resolve) => {
          video.currentTime = Math.min(resolvedStart, Math.max(0, sourceDuration - 0.1));
          video.addEventListener("seeked", () => resolve(true), { once: true });
        });

        const stream = canvas.captureStream(30);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks = [];
        let shouldDraw = true;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        const draw = () => {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (shouldDraw) requestAnimationFrame(draw);
        };
        draw();

        recorder.start();
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, resolvedDuration * 1000));
        shouldDraw = false;
        video.pause();

        await new Promise((resolve) => {
          recorder.onstop = () => resolve(true);
          recorder.stop();
        });

        const blob = new Blob(chunks, { type: "video/webm" });
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        return {
          base64: btoa(binary),
          sourceDuration,
          start: resolvedStart,
          duration: resolvedDuration,
        };
      },
      {
        durationSeconds: options.duration,
        fromEnd: options.fromEnd,
        height: options.height,
        startSeconds: options.start,
        width: options.width,
      },
    );

    fs.writeFileSync(options.output, Buffer.from(base64.base64, "base64"));
    console.log(
      JSON.stringify(
        {
          duration: base64.duration,
          input: options.input,
          output: options.output,
          sourceDuration: base64.sourceDuration,
          start: base64.start,
          writtenBytes: fs.statSync(options.output).size,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

renderFocusedVideo(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
