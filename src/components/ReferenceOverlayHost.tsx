import type { PixiAppRefs } from "@/hooks/usePixiApp";
import { useReferenceOverlay } from "@/hooks/useReferenceOverlay";

export function ReferenceOverlayHost({
  pixiRefs,
}: {
  pixiRefs: React.RefObject<PixiAppRefs>;
}) {
  useReferenceOverlay(pixiRefs);
  return null;
}
