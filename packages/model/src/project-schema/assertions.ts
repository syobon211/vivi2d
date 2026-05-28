import type { z } from "zod";
import type { BindingTarget, ColliderShape, LayerNode, NodeKind } from "../types";
import type { ColliderShapeSchema } from "./collider";
import type { LayerNodeSchema } from "./layer";
import type { BindingTargetSchema } from "./parameter";
import type { NodeKindSchema } from "./primitives";

type TypeEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _assertNodeKind: TypeEqual<z.infer<typeof NodeKindSchema>, NodeKind> = true;
const _assertBindingTargetType: TypeEqual<
  z.infer<typeof BindingTargetSchema>["type"],
  BindingTarget["type"]
> = true;
const _assertColliderShapeType: TypeEqual<
  z.infer<typeof ColliderShapeSchema>["type"],
  ColliderShape["type"]
> = true;
const _assertLayerNodeKind: TypeEqual<
  z.infer<typeof LayerNodeSchema>["kind"],
  LayerNode["kind"]
> = true;
void _assertNodeKind;
void _assertBindingTargetType;
void _assertColliderShapeType;
void _assertLayerNodeKind;
