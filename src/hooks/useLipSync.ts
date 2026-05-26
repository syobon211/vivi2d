import { useEffect, useRef } from "react";
import { t as tGlobal } from "@/lib/i18n";
import { LipSyncAnalyser, smoothVolume } from "@/lib/lipsync-engine";
import { useEditorStore } from "@/stores/editorStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";

export function useLipSync() {
  const project = useEditorStore((s) => s.project);
  const analyserRef = useRef<LipSyncAnalyser | null>(null);
  const rafId = useRef(0);
  const smoothedRef = useRef(0);

  const enabled = project?.lipsyncConfig.enabled ?? false;
  const source = project?.lipsyncConfig.source ?? "microphone";
  const smoothing = project?.lipsyncConfig.smoothing ?? 0.7;
  const gain = project?.lipsyncConfig.gain ?? 2.0;
  const threshold = project?.lipsyncConfig.threshold ?? 0.02;

  useEffect(() => {
    if (!enabled) {
      if (analyserRef.current) {
        analyserRef.current.dispose();
        analyserRef.current = null;
      }
      cancelAnimationFrame(rafId.current);
      useLipSyncStore.getState().reset();
      return;
    }

    const analyser = new LipSyncAnalyser();
    analyserRef.current = analyser;
    smoothedRef.current = 0;

    const connect = async () => {
      try {
        if (source === "microphone") {
          await analyser.connectMicrophone();
        }
        useLipSyncStore.getState().setConnected(true);
        useLipSyncStore.getState().setError(null);
        startLoop();
      } catch (e) {
        const msg = e instanceof Error ? e.message : tGlobal("notify.audioInputFailed");
        useLipSyncStore.getState().setError(msg);
        useLipSyncStore.getState().setConnected(false);
      }
    };

    const startLoop = () => {
      const tick = () => {
        if (!analyserRef.current) return;

        const rawVolume = analyserRef.current.getRmsVolume(gain, threshold);
        smoothedRef.current = smoothVolume(rawVolume, smoothedRef.current, smoothing);
        useLipSyncStore.getState().setVolume(smoothedRef.current);

        rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);
    };

    connect();

    return () => {
      cancelAnimationFrame(rafId.current);
      analyser.dispose();
      analyserRef.current = null;
      useLipSyncStore.getState().reset();
    };
  }, [enabled, source, gain, threshold, smoothing]);
}
