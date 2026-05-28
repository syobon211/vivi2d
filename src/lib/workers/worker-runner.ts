import type { WorkerMessage } from "@/workers/worker-protocol";

export interface RunWorkerOptions<TRequest> {
  createWorker: () => Worker;

  request: TRequest;

  transfer?: Transferable[];

  signal?: AbortSignal;

  errorLabel: string;
}

export function runWorker<TRequest, TResult>(
  options: RunWorkerOptions<TRequest>,
): Promise<TResult> {
  const { createWorker, request, transfer, signal, errorLabel } = options;

  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<TResult>((resolve, reject) => {
    const worker = createWorker();
    let done = false;

    const cleanup = (): void => {
      if (done) return;
      done = true;
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    worker.addEventListener("message", (event: MessageEvent<WorkerMessage<TResult>>) => {
      const msg = event.data;
      if (msg.type === "result") {
        if (done) return;
        cleanup();
        resolve(msg.result);
      } else if (msg.type === "error") {
        if (done) return;
        cleanup();
        reject(new Error(msg.message));
      }
    });
    worker.addEventListener("error", (event) => {
      if (done) return;
      cleanup();
      reject(new Error(event.message || errorLabel));
    });

    signal?.addEventListener("abort", onAbort);

    if (transfer && transfer.length > 0) {
      worker.postMessage(request, transfer);
    } else {
      worker.postMessage(request);
    }
  });
}
