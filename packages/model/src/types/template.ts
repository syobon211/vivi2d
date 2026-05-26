import type { LipSyncConfig } from "./lipsync";
import type { PhysicsGroup } from "./physics";

export type TemplateCategory = "parameter" | "physics" | "lipsync";

export interface ParameterTemplateEntry {
  name: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  group?: string;

  pairedName?: string;
}

export interface Template {
  id: string;

  name: string;

  category: TemplateCategory;

  description: string;

  data:
    | { type: "parameter"; entries: ParameterTemplateEntry[] }
    | { type: "physics"; groups: Omit<PhysicsGroup, "id">[] }
    | { type: "lipsync"; config: Partial<LipSyncConfig> };
}
