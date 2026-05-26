import type { ParameterId } from "./parameter";

export type LipSyncSource = "microphone" | "file";

export type LipSyncMode = "rms" | "viseme";

export type VisemeType =
  | "sil"
  | "aa"
  | "ih"
  | "ou"
  | "eh"
  | "oh"
  | "ff" // f/v
  | "ss" // s/z
  | "pp" // p/b/m
  | "nn" // n/l
  | "kk"; // k/g

export interface VisemeMapping {
  viseme: VisemeType;
  target: { type: "parameter"; parameterId: ParameterId; value: number };
}

export interface LipSyncConfig {
  enabled: boolean;

  mode?: LipSyncMode;

  targetParameterId: ParameterId | null;

  source: LipSyncSource;

  threshold: number;

  smoothing: number;

  gain: number;

  visemeMappings?: VisemeMapping[];

  visemeSmoothing?: number;
}
