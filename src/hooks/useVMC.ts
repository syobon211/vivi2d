import { useEffect, useRef } from "react";
import { useParameterStore } from "@/stores/parameterStore";
import { useVMCStore } from "@/stores/vmcStore";

export function useVMC() {
  const rafId = useRef(0);

  useEffect(() => {
    const unsubscribe = useVMCStore.subscribe((state, prev) => {
      if (!state.connected) return;
      if (state.faceChannelBuffer === prev.faceChannelBuffer) return;

      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const { mappings, faceChannelBuffer } = useVMCStore.getState();
        if (mappings.length === 0) return;

        const paramStore = useParameterStore.getState();
        const updates: Record<string, number> = {};

        for (const mapping of mappings) {
          const value = faceChannelBuffer[mapping.vmcName];
          if (value === undefined) continue;
          updates[mapping.parameterId] = value * mapping.scale + mapping.offset;
        }

        if (Object.keys(updates).length > 0) {
          paramStore.setAllValues({
            ...paramStore.parameterValues,
            ...updates,
          });
        }
      });
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafId.current);
    };
  }, []);
}
