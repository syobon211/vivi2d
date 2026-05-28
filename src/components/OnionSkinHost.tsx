import { useOnionSkin } from "@/hooks/useOnionSkin";
import type { PixiAppRefs } from "@/hooks/usePixiApp";

export function OnionSkinHost({ pixiRefs }: { pixiRefs: React.RefObject<PixiAppRefs> }) {
  useOnionSkin(pixiRefs);
  return null;
}
