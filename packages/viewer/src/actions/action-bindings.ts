import { z } from "zod";
import type { ViviActionTrigger } from "./action-types";

export const viviActionTriggerSchema = z.object({
  id: z.string().min(1).max(256),
  actionId: z.string().min(1).max(256),
  source: z.enum(["keyboard", "midi", "gamepad", "viewerApi", "script", "ui"]),
  match: z.unknown(),
  enabled: z.boolean(),
});

const keyboardMatchSchema = z
  .object({
    key: z.string().min(1).max(32),
    ctrlKey: z.boolean().optional(),
    metaKey: z.boolean().optional(),
    altKey: z.boolean().optional(),
    shiftKey: z.boolean().optional(),
  })
  .strict();

const midiMatchSchema = z
  .object({
    cc: z.number().int().min(0).max(127),
    channel: z.number().int().min(0).max(15).optional(),
  })
  .strict();

const gamepadMatchSchema = z
  .object({
    type: z.enum(["axis", "button"]),
    index: z.number().int().min(0).max(64),
  })
  .strict();

const emptyMatchSchema = z.object({}).strict();

export function parseViviActionTrigger(input: unknown): ViviActionTrigger {
  const trigger = viviActionTriggerSchema.parse(input);
  switch (trigger.source) {
    case "keyboard":
      keyboardMatchSchema.parse(trigger.match);
      break;
    case "midi":
      midiMatchSchema.parse(trigger.match);
      break;
    case "gamepad":
      gamepadMatchSchema.parse(trigger.match);
      break;
    case "viewerApi":
    case "script":
    case "ui":
      emptyMatchSchema.parse(trigger.match);
      break;
  }
  return trigger;
}

export function parseViviActionTriggers(input: unknown): ViviActionTrigger[] {
  return z.array(z.unknown()).max(512).parse(input).map(parseViviActionTrigger);
}
