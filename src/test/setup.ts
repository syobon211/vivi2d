import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";

beforeEach(() => {
  useI18nStore.getState().setLocale("ja");
});

if (typeof globalThis.ImageData === "undefined") {
  class ImageDataShim {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace: PredefinedColorSpace = "srgb";
    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      height?: number,
    ) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? dataOrWidth.length / 4 / widthOrHeight;
      }
    }
  }
  (globalThis as unknown as { ImageData: typeof ImageData }).ImageData =
    ImageDataShim as unknown as typeof ImageData;
}

vi.mock("ag-psd", () => ({
  readPsd: vi.fn().mockReturnValue({
    width: 800,
    height: 600,
    children: [{ name: "背景", left: 0, top: 0, right: 800, bottom: 600 }],
  }),
  initializeCanvas: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, "electronAPI", {
  value: {
    openPsdFile: vi.fn(),
    saveFile: vi.fn(),
    openViviFile: vi.fn(),
    saveVividFile: vi.fn(),
    openVividFile: vi.fn(),
    openImageFile: vi.fn(),
    openPngFile: vi.fn(),
    openPngFiles: vi.fn(),
    openPngFolder: vi.fn(),
    openAudioFile: vi.fn(),
    readAudioFile: vi.fn(),
    readImageFile: vi.fn(),
  },
  writable: true,
});

function createMockAnalyserNode() {
  return {
    fftSize: 2048,
    frequencyBinCount: 1024,
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      arr.fill(0);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockAudioContext() {
  return {
    createAnalyser: vi.fn(createMockAnalyserNode),
    createMediaStreamSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    decodeAudioData: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
    state: "running",
  };
}

(globalThis as any).AudioContext = vi.fn().mockImplementation(createMockAudioContext);

if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {},
    writable: true,
  });
}
Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
  value: vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  }),
  writable: true,
  configurable: true,
});

vi.mock("pixi.js", () => {
  function mockContainer() {
    const children: any[] = [];
    return {
      label: "",
      addChild: vi.fn((...args: any[]) => children.push(...args)),
      removeChild: vi.fn(),
      destroy: vi.fn(() => {
        children.length = 0;
      }),
      scale: { set: vi.fn() },
      x: 0,
      y: 0,
      children,
      sortableChildren: false,
    };
  }

  function mockGraphics() {
    return {
      label: "",
      clear: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      circle: vi.fn(),
      destroy: vi.fn(),
    };
  }

  const appFactory = vi.fn().mockImplementation(function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn(),
      stage: mockContainer(),
      canvas: document.createElement("canvas"),
      screen: { width: 1600, height: 900 },
    };
  });

  return {
    Application: appFactory,
    Container: vi.fn().mockImplementation(mockContainer),
    Graphics: vi.fn().mockImplementation(mockGraphics),
    Sprite: vi.fn().mockImplementation(function () {
      return {
        label: "",
        x: 0,
        y: 0,
        alpha: 1,
        visible: true,
        blendMode: "normal",
        destroy: vi.fn(),
      };
    }),
    MeshSimple: vi.fn().mockImplementation(function (opts: any) {
      return {
        label: "",
        x: 0,
        y: 0,
        alpha: 1,
        visible: true,
        blendMode: "normal",
        tint: 0xffffff,
        zIndex: 0,
        filters: [] as any[],
        mask: null as any,
        autoUpdate: true,
        vertices: opts?.vertices ?? new Float32Array(),
        destroy: vi.fn(),
      };
    }),
    Texture: {
      from: vi.fn().mockReturnValue({ width: 100, height: 100 }),
    },
    Filter: vi.fn().mockImplementation(function (opts: any) {
      const filter: any = { destroy: vi.fn() };
      if (opts?.resources) {
        filter.resources = {};
        for (const [groupName, groupDef] of Object.entries<any>(opts.resources)) {
          const uniforms: Record<string, any> = {};
          for (const [name, def] of Object.entries<any>(groupDef)) {
            uniforms[name] = def.value;
          }
          filter.resources[groupName] = { ...groupDef, uniforms };
        }
      }
      return filter;
    }),
    GlProgram: {
      from: vi.fn().mockReturnValue({}),
    },
  };
});
