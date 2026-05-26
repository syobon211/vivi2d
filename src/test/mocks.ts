import { vi } from "vitest";

export function mockCanvasContext() {
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string, options?: ElementCreationOptions) => {
      const el = original(tag, options);
      if (tag === "canvas") {
        const canvas = el as HTMLCanvasElement;
        const origGetContext = canvas.getContext.bind(canvas);
        canvas.getContext = ((id: string, opts?: unknown) => {
          if (id === "2d") {
            return {
              drawImage: vi.fn(),
              clearRect: vi.fn(),
              fillRect: vi.fn(),
            } as unknown as CanvasRenderingContext2D;
          }
          return origGetContext(id, opts);
        }) as typeof canvas.getContext;
        canvas.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,AAAA");
      }
      return el;
    },
  );
}

export function mockImageLoad() {
  vi.spyOn(globalThis, "Image").mockImplementation(function (this: HTMLImageElement) {
    const img = this ?? ({} as HTMLImageElement);
    img.onload = null;
    img.onerror = null;
    Object.defineProperty(img, "src", {
      configurable: true,
      set(_value: string) {
        queueMicrotask(() => {
          if (typeof img.onload === "function") img.onload(new Event("load"));
        });
      },
    });
    return img;
  } as unknown as typeof Image);
}
