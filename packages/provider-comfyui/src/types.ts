export interface ComfyUIClientOptions {
  baseUrl?: string;

  timeout?: number;

  transport?: import("./transport").ComfyUITransport;

  clientId?: string;
}

export interface ComfyUINode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type ComfyUIWorkflow = Record<string, ComfyUINode>;

export interface QueueResponse {
  prompt_id: string;
  number: number;
}

export interface ProgressMessage {
  type: "progress" | "executing" | "executed" | "execution_error";
  data: {
    value?: number;
    max?: number;
    node?: string;
    prompt_id?: string;
  };
}

export interface HistoryOutput {
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
  text?: string[];
}

export interface HistoryEntry {
  outputs: Record<string, HistoryOutput>;

  prompt?: unknown;

  status: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown[];
  };
}

export interface GenerateProgress {
  step: number;

  total: number;

  phase:
    | "uploading"
    | "decomposing"
    | "depth"
    | "postprocess"
    | "downloading"
    | "assembling";

  phaseLabel: string;
}

export interface SeethroughLayer {
  name: string;

  psdLeafToken?: string;

  imageData: ArrayBuffer;

  order: number;
}

export interface PositionedSeethroughLayer extends SeethroughLayer {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DecomposeOptions {
  seed?: number;

  resolution?: number;

  numSteps?: number;

  tblrSplit?: boolean;

  useLama?: boolean;

  quantMode?: "none" | "nf4";

  groupOffload?: boolean;

  filenamePrefix?: string;
}

export interface PromptGenerateOptions extends DecomposeOptions {
  prompt: string;

  negativePrompt?: string;

  imageSteps?: number;

  cfg?: number;
}
