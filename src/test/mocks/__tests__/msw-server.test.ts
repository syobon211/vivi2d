import { describe, expect, it } from "vitest";
import { useMswServer } from "../useMswServer";


// biome-ignore lint/correctness/useHookAtTopLevel: useMswServer is a Vitest setup helper, not a React hook.
useMswServer();

describe("msw server", () => {
  it("ComfyUI /system_stats が 200 を返す", async () => {
    const res = await fetch("http://127.0.0.1:8188/system_stats");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.system).toBeDefined();
    expect(Array.isArray(data.devices)).toBe(true);
  });

  it("ComfyUI /prompt が prompt_id を返す", async () => {
    const res = await fetch("http://127.0.0.1:8188/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: { "1": { class_type: "Mock" } } }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.prompt_id).toBe("mock-prompt-id");
  });

  it("ComfyUI /history/:id が success を返す", async () => {
    const res = await fetch("http://127.0.0.1:8188/history/abc-123");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data["abc-123"].status.status_str).toBe("success");
    expect(data["abc-123"].status.completed).toBe(true);
  });

  it("ComfyUI /view が 404 を再現できる", async () => {
    const res = await fetch("http://127.0.0.1:8188/view?filename=missing.png");
    expect(res.status).toBe(404);
  });

  it("ComfyUI /view が PNG マジックバイトを返す", async () => {
    const res = await fetch("http://127.0.0.1:8188/view?filename=ok.png");
    expect(res.ok).toBe(true);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it("ComfyUI /object_info/:type が node 情報を返す", async () => {
    const res = await fetch("http://127.0.0.1:8188/object_info/CheckpointLoaderSimple");
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.CheckpointLoaderSimple).toBeDefined();
    expect(data.CheckpointLoaderSimple.input.required.ckpt_name).toBeDefined();
  });
});
