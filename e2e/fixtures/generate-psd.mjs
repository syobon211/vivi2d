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

function makeImageData(w, h, r, g, b, a) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width: w, height: h, data };
}

const SIZE = 64;

const psd = {
  width: SIZE,
  height: SIZE,
  children: [
    {
      name: "Background",
      left: 0,
      top: 0,
      right: SIZE,
      bottom: SIZE,
      imageData: makeImageData(SIZE, SIZE, 200, 200, 200, 255),
    },
    {
      name: "Red Circle",
      left: 0,
      top: 0,
      right: SIZE,
      bottom: SIZE,
      imageData: makeImageData(SIZE, SIZE, 255, 0, 0, 180),
    },
  ],
  imageData: makeImageData(SIZE, SIZE, 200, 200, 200, 255),
};

try {
  const buf = writePsdBuffer(psd);
  const out = resolve(__dirname, "test.psd");
  writeFileSync(out, buf);
  console.log(`test.psd を生成しました (${buf.length} bytes) → ${out}`);
} catch (e) {
  console.error("PSD 生成失敗:", e);
  process.exit(1);
}
