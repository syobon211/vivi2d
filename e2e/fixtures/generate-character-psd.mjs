import { writePsdBuffer, initializeCanvas } from "ag-psd";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createMinimalCanvas(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  return {
    width: w,
    height: h,
    getContext() {
      return {
        canvas: { width: w, height: h },
        createImageData: (iw, ih) => ({
          width: iw,
          height: ih,
          data: new Uint8ClampedArray(iw * ih * 4),
        }),
        getImageData: () => ({ width: w, height: h, data }),
        putImageData: (imageData) => {
          data.set(imageData.data.subarray(0, data.length));
        },
        drawImage: () => {},
        clearRect: () => {},
        fillRect: () => {
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
          }
        },
      };
    },
    toDataURL: () => "data:image/png;base64,",
  };
}

initializeCanvas(
  (w, h) => createMinimalCanvas(w, h),
  undefined,
  (imageData) => createMinimalCanvas(imageData.width, imageData.height),
);

function makeEllipse(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2, cy = h / 2;
  const rx = w / 2 - 1, ry = h / 2 - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const i = (y * w + x) * 4;
        data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255;
      }
    }
  }
  return { width: w, height: h, data };
}

function makeRect(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255;
  }
  return { width: w, height: h, data };
}

const W = 256, H = 512;

const psd = {
  width: W,
  height: H,
  // Vivi2D imports PSD children as front-to-back layer stack order.
  children: [
    {
      name: "前髪",
      left: 50, top: 5, right: 206, bottom: 60,
      imageData: makeRect(156, 55, 60, 30, 10),
    },
    {
      name: "左目",
      left: 80, top: 60, right: 115, bottom: 85,
      imageData: makeEllipse(35, 25, 40, 40, 40),
    },
    {
      name: "右目",
      left: 141, top: 60, right: 176, bottom: 85,
      imageData: makeEllipse(35, 25, 40, 40, 40),
    },
    {
      name: "口",
      left: 103, top: 110, right: 153, bottom: 130,
      imageData: makeEllipse(50, 20, 200, 80, 80),
    },
    {
      name: "顔",
      left: 64, top: 20, right: 192, bottom: 150,
      imageData: makeEllipse(128, 130, 255, 220, 200),
    },
    {
      name: "体",
      left: 70, top: 150, right: 186, bottom: 350,
      imageData: makeRect(116, 200, 100, 150, 200),
    },
    {
      name: "左腕",
      left: 20, top: 160, right: 70, bottom: 300,
      imageData: makeRect(50, 140, 255, 220, 200),
    },
    {
      name: "右腕",
      left: 186, top: 160, right: 236, bottom: 300,
      imageData: makeRect(50, 140, 255, 220, 200),
    },
  ],
  imageData: makeRect(W, H, 240, 240, 240),
};

try {
  const buf = writePsdBuffer(psd);
  const out = resolve(__dirname, "character-test.psd");
  writeFileSync(out, buf);
  console.log(`character-test.psd を生成しました (${buf.length} bytes) → ${out}`);
} catch (e) {
  console.error("PSD 生成失敗:", e);
  process.exit(1);
}
