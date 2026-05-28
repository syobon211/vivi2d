import { HttpResponse, http, ws } from "msw";


const DEFAULT_BASE = "http://127.0.0.1:8188";

export const comfyuiHttpHandlers = [
  http.get(`${DEFAULT_BASE}/system_stats`, () =>
    HttpResponse.json({
      system: { os: "test", python_version: "3.12" },
      devices: [{ name: "MockGPU", type: "cuda", index: 0, vram_total: 8192 }],
    }),
  ),

  http.post(`${DEFAULT_BASE}/upload/image`, async ({ request }) => {
    const formData = await request.formData();
    const image = formData.get("image");
    const filename =
      image instanceof File ? image.name : (formData.get("filename") as string | null);
    return HttpResponse.json({
      name: filename ?? "uploaded.png",
      subfolder: "",
      type: "input",
    });
  }),

  http.post(`${DEFAULT_BASE}/prompt`, async ({ request }) => {
    const _body = (await request.json()) as { prompt: unknown; client_id?: string };
    return HttpResponse.json({
      prompt_id: "mock-prompt-id",
      number: 0,
      node_errors: {},
    });
  }),

  // GET /history/:promptId
  http.get(`${DEFAULT_BASE}/history/:promptId`, ({ params }) => {
    const { promptId } = params;
    return HttpResponse.json({
      [String(promptId)]: {
        outputs: {
          "9": {
            images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }],
          },
        },
        status: { status_str: "success", completed: true, messages: [] },
      },
    });
  }),

  http.get(`${DEFAULT_BASE}/view`, ({ request }) => {
    const url = new URL(request.url);
    const filename = url.searchParams.get("filename") ?? "missing.png";
    if (filename === "missing.png") {
      return new HttpResponse(null, { status: 404 });
    }
    const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return new HttpResponse(buffer, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  }),

  http.get(`${DEFAULT_BASE}/object_info/:nodeType`, ({ params }) => {
    const { nodeType } = params;
    return HttpResponse.json({
      [String(nodeType)]: {
        input: { required: { ckpt_name: [["model.safetensors"]] } },
        output: ["MODEL", "CLIP", "VAE"],
        output_name: ["MODEL", "CLIP", "VAE"],
        name: nodeType,
        display_name: String(nodeType),
        category: "loaders",
      },
    });
  }),

  http.get(`${DEFAULT_BASE}/queue`, () =>
    HttpResponse.json({ queue_running: [], queue_pending: [] }),
  ),
];


const wsLink = ws.link("ws://127.0.0.1:8188/ws");

export const comfyuiWsHandlers = [
  wsLink.addEventListener("connection", () => {
  }),
];

export const comfyuiWsLink = wsLink;

export function comfyuiProgressMessage(promptId: string, value: number, max: number) {
  return JSON.stringify({ type: "progress", data: { prompt_id: promptId, value, max } });
}

export function comfyuiExecutedMessage(promptId: string) {
  return JSON.stringify({ type: "executed", data: { prompt_id: promptId } });
}

export function comfyuiErrorMessage(promptId: string, message = "mock error") {
  return JSON.stringify({
    type: "execution_error",
    data: { prompt_id: promptId, exception_message: message },
  });
}

export const comfyuiHandlers = [...comfyuiHttpHandlers, ...comfyuiWsHandlers];
