import { z } from "zod";

export const VIEWER_BRIDGE_IDS = ["scene"] as const;

export type ViewerBridgeId = (typeof VIEWER_BRIDGE_IDS)[number];

const sceneNameSchema = z.string().min(1).max(256);

export const sceneBridgeActivateSceneArgsSchema = z
  .object({
    sceneName: sceneNameSchema,
  })
  .strict();

export const sceneBridgeSetSourceVisibleArgsSchema = z
  .object({
    sceneName: sceneNameSchema,
    sourceName: z.string().min(1).max(256),
    visible: z.boolean(),
  })
  .strict();

export const viewerBridgeCommandPayloadSchema = z.union([
  z
    .object({
      bridgeId: z.literal("scene"),
      commandId: z.literal("activateScene"),
      args: sceneBridgeActivateSceneArgsSchema,
    })
    .strict(),
  z
    .object({
      bridgeId: z.literal("scene"),
      commandId: z.literal("setSourceVisible"),
      args: sceneBridgeSetSourceVisibleArgsSchema,
    })
    .strict(),
]);

export type ViewerBridgeCommandPayload = z.infer<
  typeof viewerBridgeCommandPayloadSchema
>;

export type ViewerBridgeCommandId = ViewerBridgeCommandPayload["commandId"];

export type ViewerBridgeCommandArgs = ViewerBridgeCommandPayload["args"];
