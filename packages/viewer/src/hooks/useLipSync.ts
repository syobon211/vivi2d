import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { TranslationKey } from "../i18n";
import { LipSyncAnalyser, type Vowel } from "../tracking/lipsync-analyser";
import type { UseViewerStateResult } from "./useViewerState";

export interface UseLipSyncParams {
  state: Pick<
    UseViewerStateResult,
    "lipSync" | "setLipSync" | "lipSyncMode" | "setError" | "setCurrentVowel"
  >;
  t: (key: TranslationKey) => string;
}

export interface UseLipSyncResult {
  lipSyncRef: RefObject<LipSyncAnalyser | null>;
  lipSyncVolumeRef: RefObject<number>;
  lipSyncVowelRef: RefObject<Vowel>;
  toggleLipSync: () => Promise<void>;
}

export function useLipSync({ state, t }: UseLipSyncParams): UseLipSyncResult {
  const lipSyncRef = useRef<LipSyncAnalyser | null>(null);
  const lipSyncVolumeRef = useRef<number>(0);
  const lipSyncVowelRef = useRef<Vowel>("silent");

  const toggleLipSync = useCallback(async () => {
    if (state.lipSync) {
      lipSyncRef.current?.stop();
      lipSyncVolumeRef.current = 0;
      lipSyncVowelRef.current = "silent";
      state.setLipSync(false);
      state.setCurrentVowel("silent");
      return;
    }

    try {
      state.setError(null);
      const analyser = new LipSyncAnalyser();
      await analyser.init(state.lipSyncMode);
      lipSyncRef.current = analyser;

      analyser.start((volume, vowel) => {
        lipSyncVolumeRef.current = volume;
        if (vowel) lipSyncVowelRef.current = vowel;
      });

      state.setLipSync(true);
    } catch (e) {
      state.setError(e instanceof Error ? e.message : t("errMicInit"));
    }
  }, [state, t]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      lipSyncRef.current?.stop();
    };
  }, []);

  return {
    lipSyncRef,
    lipSyncVolumeRef,
    lipSyncVowelRef,
    toggleLipSync,
  };
}
