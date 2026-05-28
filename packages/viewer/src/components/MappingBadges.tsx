import { TRACKING_COUNTS } from "../constants";
import type { createT } from "../i18n";
import { badgeBaseStyle } from "../styles";

interface Props {
  t: ReturnType<typeof createT>;
  mappedCount: number;
  platformFaceMappedCount: number;
  handMappedCount: number;
  poseMappedCount: number;
}

export function MappingBadges({
  t,
  mappedCount,
  platformFaceMappedCount,
  handMappedCount,
  poseMappedCount,
}: Props) {
  return (
    <>
      {mappedCount > 0 && (
        <span
          style={{
            ...badgeBaseStyle,
            marginLeft: "6px",
            backgroundColor: "var(--viewer-badge-face)",
          }}
        >
          {t("badgeFace")} {mappedCount}/{TRACKING_COUNTS.FACE}
        </span>
      )}
      {platformFaceMappedCount > 0 && (
        <span style={{ ...badgeBaseStyle, backgroundColor: "var(--viewer-badge-platform-face)" }}>
          {t("badgePlatformFace")} {platformFaceMappedCount}/{TRACKING_COUNTS.PLATFORM_FACE}
        </span>
      )}
      {handMappedCount > 0 && (
        <span style={{ ...badgeBaseStyle, backgroundColor: "var(--viewer-badge-hand)" }}>
          {t("badgeHand")} {handMappedCount}/{TRACKING_COUNTS.HAND}
        </span>
      )}
      {poseMappedCount > 0 && (
        <span style={{ ...badgeBaseStyle, backgroundColor: "var(--viewer-badge-pose)" }}>
          {t("badgeBody")} {poseMappedCount}/{TRACKING_COUNTS.POSE}
        </span>
      )}
    </>
  );
}
