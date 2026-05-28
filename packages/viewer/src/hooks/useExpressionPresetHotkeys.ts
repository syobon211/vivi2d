import type { ViviModel } from "@vivi2d/core/model";
import { type RefObject, useEffect, useRef, useState } from "react";
import type {
  ViviActionScope,
  ViviActionTriggerSource,
} from "../actions/action-types";
import { UI_TIMING } from "../constants";

type RunViewerAction = (
  action: unknown,
  options: {
    triggerSource?: ViviActionTriggerSource;
    scopes: readonly ViviActionScope[];
  },
) => void;

export function useExpressionPresetHotkeys(
  enabled: boolean,
  modelRef: RefObject<ViviModel | null>,
  runAction?: RunViewerAction,
): string | null {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const timeoutRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key < "1" || e.key > "9") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const model = modelRef.current;
      if (!model) return;

      const hotkey = Number(e.key);
      const preset = model.project.expressionPresets?.find((p) => p.hotkey === hotkey);
      if (!preset) return;

      if (runAction) {
        runAction(
          {
            id: `expression-preset-${preset.id}`,
            name: preset.name,
            kind: "expressionPreset",
            enabled: true,
            payload: { presetId: preset.id },
            cooldownMs: 100,
            queuePolicy: "drop",
            source: "builtIn",
          },
          { triggerSource: "keyboard", scopes: ["run:actions:safe"] },
        );
      } else {
        model.applyExpressionPreset(preset.id);
      }
      setActivePreset(`${hotkey}: ${preset.name}`);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(
        () => setActivePreset(null),
        UI_TIMING.PRESET_DISPLAY_MS,
      );
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [enabled, modelRef, runAction]);

  return activePreset;
}
