import type { AnimationClip, Scene, SceneBlend } from "./animation";
import type { ColliderData } from "./collider";
import type { IKController } from "./ik";
import type { LayerId, LayerNode } from "./layer";
import type { LipSyncConfig } from "./lipsync";
import type { SkinData } from "./mesh";
import type { ExpressionPreset, ParameterBinding, ParameterDefinition } from "./parameter";
import type { PhysicsGroup } from "./physics";
import type { AnimationStateMachine } from "./statemachine";

export interface OffscreenTarget {
  id: string;

  width: number;

  height: number;

  sourceLayerIds: LayerId[];
}

export interface AtlasEntry {
  layerId: LayerId;

  x: number;

  y: number;

  width: number;

  height: number;
}

export interface AtlasData {
  image: string;

  width: number;

  height: number;

  entries: AtlasEntry[];
}

export interface ProjectData {
  name: string;
  width: number;
  height: number;
  sourceKind?: "psd" | "seeThrough" | "manualPng" | "vivi" | "vivid";
  layers: LayerNode[];
  parameters: ParameterDefinition[];

  clips: AnimationClip[];

  scenes: Scene[];
  physicsGroups: PhysicsGroup[];
  lipsyncConfig: LipSyncConfig;

  skins: Record<LayerId, SkinData>;

  parameterBindings?: ParameterBinding[];

  sceneBlends?: SceneBlend[];

  ikControllers?: IKController[];

  offscreenTargets?: OffscreenTarget[];

  expressionPresets?: ExpressionPreset[];

  colliders: ColliderData[];

  stateMachines: AnimationStateMachine[];
}

export interface ViviFileData {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

  profile?: "publicProfileV1";

  project: ProjectData;

  atlases: AtlasData[];
}
