export type WorkerMessage<TResult, TProgress = number> =
  | { type: "progress"; progress: TProgress }
  | { type: "result"; result: TResult }
  | { type: "error"; message: string };
