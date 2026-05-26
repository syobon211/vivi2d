import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";


export function useMswServer(options?: {
  onUnhandledRequest?: "bypass" | "warn" | "error";
}) {
  const onUnhandledRequest = options?.onUnhandledRequest ?? "error";
  beforeAll(() => server.listen({ onUnhandledRequest }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

export {
  comfyuiErrorMessage,
  comfyuiExecutedMessage,
  comfyuiHandlers,
  comfyuiHttpHandlers,
  comfyuiProgressMessage,
  comfyuiWsHandlers,
  comfyuiWsLink,
  handlers,
} from "./handlers";
export { server } from "./server";
