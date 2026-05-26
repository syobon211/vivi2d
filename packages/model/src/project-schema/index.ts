import { AnimationClipSchema, SceneSchema } from "./animation";
import { ColliderDataSchema, ColliderShapeSchema } from "./collider";
import { LayerNodeSchema } from "./layer";
import {
  BindingTargetSchema,
  ParameterBindingSchema,
  ParameterDefinitionSchema,
} from "./parameter";
import { LipSyncConfigSchema, PhysicsGroupSchema } from "./physics";
import {
  AffineMatrixSchema,
  BlendModeSchema,
  MeshDataSchema,
  NodeKindSchema,
  RGBColorSchema,
} from "./primitives";
import { AtlasDataSchema, ProjectDataSchema, ViviFileDataSchema } from "./project";
import { AnimationStateMachineSchema } from "./statemachine";

import "./assertions";

export { LayerNodeSchema } from "./layer";
export { ProjectDataSchema, ViviFileDataSchema } from "./project";

export const schemas = {
  RGBColor: RGBColorSchema,
  BlendMode: BlendModeSchema,
  NodeKind: NodeKindSchema,
  MeshData: MeshDataSchema,
  AffineMatrix: AffineMatrixSchema,
  LayerNode: LayerNodeSchema,
  ParameterDefinition: ParameterDefinitionSchema,
  AnimationClip: AnimationClipSchema,
  Scene: SceneSchema,
  BindingTarget: BindingTargetSchema,
  ParameterBinding: ParameterBindingSchema,
  ColliderShape: ColliderShapeSchema,
  ColliderData: ColliderDataSchema,
  AnimationStateMachine: AnimationStateMachineSchema,
  LipSyncConfig: LipSyncConfigSchema,
  PhysicsGroup: PhysicsGroupSchema,
  AtlasData: AtlasDataSchema,
  ProjectData: ProjectDataSchema,
  ViviFileData: ViviFileDataSchema,
};
