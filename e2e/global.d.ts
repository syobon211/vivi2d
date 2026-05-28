declare global {
  interface Window {
    __vivi2d?: Record<string, unknown>;
  }
}

declare module "playwright" {
  interface Page {
    __vivi2d?: Record<string, unknown>;
  }
}

export {};
