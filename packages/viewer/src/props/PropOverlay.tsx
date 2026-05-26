import { resolvePropAnchorTransform } from "./prop-anchors";
import type { PropAnchorContext } from "./prop-anchors";
import type { ViviProp } from "./prop-types";

export interface PropOverlayProps {
  props: readonly ViviProp[];
  anchorContext?: PropAnchorContext;
  resolveAssetUrl?: (assetId: string) => string | null | undefined;
}

export function PropOverlay({
  props,
  anchorContext = {},
  resolveAssetUrl,
}: PropOverlayProps) {
  return (
    <div
      data-testid="prop-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {props
        .filter((prop) => prop.visible)
        .map((prop) => {
          // Props stay in a viewer-owned DOM overlay; anchors consume only
          // public transform snapshots, never runtime mesh/vertex handles.
          const transform = resolvePropAnchorTransform(prop, anchorContext);
          const src =
            prop.source.kind === "objectUrl"
              ? prop.source.url
              : prop.source.kind === "inlineBase64"
                ? `data:${prop.source.mimeType};base64,${prop.source.bytes}`
                : (resolveAssetUrl?.(prop.source.assetId) ?? "");
          if (!src) return null;
          return (
            <img
              key={prop.id}
              alt=""
              src={src}
              draggable={false}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                maxWidth: "50%",
                maxHeight: "50%",
                opacity: prop.opacity,
                zIndex: prop.drawOrder,
                transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`,
                transformOrigin: "center",
              }}
            />
          );
        })}
    </div>
  );
}
