import type { EasingPreset } from "@vivi2d/core/constants";
import { useCallback } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";

interface EasingPresetMenuProps {
  clipId: string;
  parameterId: string;
  frame: number;
}

const PRESETS: { value: EasingPreset; labelKey: I18nKey }[] = [
  { value: "linear", labelKey: "timeline.easing.linear" },
  { value: "easeIn", labelKey: "timeline.easing.easeIn" },
  { value: "easeOut", labelKey: "timeline.easing.easeOut" },
  { value: "easeInOut", labelKey: "timeline.easing.easeInOut" },
];

export function EasingPresetMenu({ clipId, parameterId, frame }: EasingPresetMenuProps) {
  const t = useT();
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const preset = e.target.value as EasingPreset;
      if (!preset) return;
      useClipStore.getState().applyEasingPreset(clipId, parameterId, frame, preset);
    },
    [clipId, parameterId, frame],
  );

  return (
    <select
      className="tl-easing-select"
      onChange={handleChange}
      defaultValue=""
      title={t("timeline.easingPresetTitle")}
    >
      <option value="" disabled>
        {t("timeline.easingSelectLabel")}
      </option>
      {PRESETS.map((p) => (
        <option key={p.value} value={p.value}>
          {t(p.labelKey)}
        </option>
      ))}
    </select>
  );
}
