// Test-only composition: the real component owns EDH, WASM and Pixi. This page
// grants no capability and replaces no renderer port or native implementation.

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RuntimePreviewPanel } from "../../src/components/RuntimePreviewPanel";

const root = createRoot(document.getElementById("root")!);
let mount = 0;
Object.defineProperty(window, "__runtimePreviewFixture", {
  value: Object.freeze({
    mount(cellId: string) {
      if (!/^[a-f0-9]{64}$/.test(cellId)) throw new Error("Invalid test cell");
      flushSync(() => root.render(<RuntimePreviewPanel key={++mount} cellId={cellId} />));
      document.querySelector("details")!.open = true;
    },
    unmount() {
      flushSync(() => root.render(null));
    },
  }),
});
