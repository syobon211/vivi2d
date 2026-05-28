import type { Locale } from "../i18n";

interface Props {
  locale: Locale;
  stats: { fps: number; meshes: number; vertices: number };
}

export function HudOverlay({ locale, stats }: Props) {
  const labels = HUD_LABELS[locale];

  return (
    <div
      data-testid="hud-overlay"
      style={{
        position: "absolute",
        top: "16px",
        left: "16px",
        padding: "8px 12px",
        backgroundColor: "var(--viewer-overlay-hud)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-mono)",
        color: "var(--viewer-status-ok)",
        pointerEvents: "none",
        lineHeight: "1.6",
      }}
    >
      <div>{stats.fps} FPS</div>
      <div>
        {stats.meshes} {labels.meshes}
      </div>
      <div>
        {stats.vertices} {labels.vertices}
      </div>
    </div>
  );
}

const HUD_LABELS: Record<Locale, { meshes: string; vertices: string }> = {
  en: { meshes: "meshes", vertices: "verts" },
  ja: { meshes: "メッシュ", vertices: "頂点" },
  "zh-Hans": { meshes: "网格", vertices: "顶点" },
  "ko-KR": { meshes: "메시", vertices: "정점" },
};
