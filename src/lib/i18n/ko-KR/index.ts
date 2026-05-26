import { common } from "./common";
import { dialog } from "./dialog";
import { layer } from "./layer";
import { menu } from "./menu";
import { panel } from "./panel";
import { shortcut } from "./shortcut";
import { timeline } from "./timeline";

export const koKR = {
  ...common,
  ...menu,
  ...dialog,
  ...layer,
  ...panel,
  ...timeline,
  ...shortcut,
} as const;
