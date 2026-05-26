import { useIK } from "@/hooks/useIK";
import { useLipSync } from "@/hooks/useLipSync";
import { useParameterBinding } from "@/hooks/useParameterBinding";
import { usePhysics } from "@/hooks/usePhysics";
import { usePlayback } from "@/hooks/usePlayback";
import { useVMC } from "@/hooks/useVMC";

export function AppRuntimeHost() {
  usePlayback();
  useParameterBinding();
  usePhysics();
  useLipSync();
  useIK();
  useVMC();

  return null;
}
