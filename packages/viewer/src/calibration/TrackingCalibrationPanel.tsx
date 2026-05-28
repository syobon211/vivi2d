import type { Locale } from "../i18n";
import type { ViviTrackingCalibrationSnapshot } from "./calibration-store";
import type {
  TrackingSignalSource,
  ViviTrackingCalibrationProfile,
} from "./calibration-types";

const SOURCES: TrackingSignalSource[] = [
  "face",
  "platformFace",
  "hand",
  "pose",
  "lipSync",
];

interface TrackingCalibrationPanelProps {
  locale: Locale;
  snapshot: ViviTrackingCalibrationSnapshot;
  onApplyProfile: (profileId: string) => void;
  onCaptureNeutral: (source: TrackingSignalSource) => void;
  onSuggestRanges: (source: TrackingSignalSource) => void;
  onReset: () => void;
}

type CalibrationDiagnostic = ViviTrackingCalibrationSnapshot["diagnostics"][number];

type CalibrationCopy = {
  title: string;
  profileAriaLabel: string;
  captureNeutral: string;
  suggestRanges: string;
  reset: string;
  noSignal: string;
  stale: string;
  clipped: string;
  calibrated: string;
  raw: string;
  observed: string;
  meterAriaLabel: string;
};

const CALIBRATION_COPY: Record<Locale, CalibrationCopy> = {
  en: {
    title: "Calibration",
    profileAriaLabel: "Calibration profile",
    captureNeutral: "Neutral",
    suggestRanges: "Suggest",
    reset: "Reset",
    noSignal: "No live tracking signal",
    stale: "stale",
    clipped: "clipped",
    calibrated: "calibrated",
    raw: "raw",
    observed: "observed",
    meterAriaLabel: "Calibration meter",
  },
  ja: {
    title: "調整",
    profileAriaLabel: "調整プロファイル",
    captureNeutral: "基準取得",
    suggestRanges: "範囲提案",
    reset: "リセット",
    noSignal: "ライブトラッキング信号がありません",
    stale: "停止中",
    clipped: "上限到達",
    calibrated: "調整済み",
    raw: "未調整",
    observed: "観測範囲",
    meterAriaLabel: "調整メーター",
  },
  "zh-Hans": {
    title: "校准",
    profileAriaLabel: "校准配置",
    captureNeutral: "获取中立值",
    suggestRanges: "建议范围",
    reset: "重置",
    noSignal: "没有实时追踪信号",
    stale: "已停止",
    clipped: "已裁切",
    calibrated: "已校准",
    raw: "原始",
    observed: "观测范围",
    meterAriaLabel: "校准仪表",
  },
  "ko-KR": {
    title: "보정",
    profileAriaLabel: "보정 프로필",
    captureNeutral: "중립값 캡처",
    suggestRanges: "범위 제안",
    reset: "초기화",
    noSignal: "실시간 트래킹 신호가 없습니다",
    stale: "멈춤",
    clipped: "클리핑",
    calibrated: "보정됨",
    raw: "원본",
    observed: "관측 범위",
    meterAriaLabel: "보정 미터",
  },
};

const SOURCE_LABELS: Record<Locale, Record<TrackingSignalSource, string>> = {
  en: {
    face: "face",
    platformFace: "platform face",
    hand: "hand",
    pose: "pose",
    lipSync: "lip sync",
  },
  ja: {
    face: "顔",
    platformFace: "表情",
    hand: "手",
    pose: "姿勢",
    lipSync: "リップ",
  },
  "zh-Hans": {
    face: "脸",
    platformFace: "表情",
    hand: "手",
    pose: "姿势",
    lipSync: "口型",
  },
  "ko-KR": {
    face: "얼굴",
    platformFace: "표정",
    hand: "손",
    pose: "자세",
    lipSync: "입",
  },
};

function profileLabel(profile: ViviTrackingCalibrationProfile): string {
  return `${profile.name} (${Object.keys(profile.channels).length})`;
}

export function TrackingCalibrationPanel({
  locale,
  snapshot,
  onApplyProfile,
  onCaptureNeutral,
  onSuggestRanges,
  onReset,
}: TrackingCalibrationPanelProps) {
  const c = CALIBRATION_COPY[locale];
  const sourceLabels = SOURCE_LABELS[locale];
  const diagnostics = snapshot.diagnostics.slice(0, 8);
  return (
    <section
      data-testid="tracking-calibration-panel"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        alignItems: "center",
        padding: "8px 12px",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        fontSize: "12px",
      }}
    >
      <strong>{c.title}</strong>
      <select
        aria-label={c.profileAriaLabel}
        value={snapshot.activeProfileId}
        onChange={(event) => onApplyProfile(event.target.value)}
        style={{
          backgroundColor: "var(--border)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
        }}
      >
        {snapshot.profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profileLabel(profile)}
          </option>
        ))}
      </select>
      {SOURCES.map((source) => (
        <span key={source} style={{ display: "inline-flex", gap: "4px" }}>
          <button
            type="button"
            onClick={() => onCaptureNeutral(source)}
            style={buttonStyle}
          >
            {c.captureNeutral} {sourceLabels[source]}
          </button>
          <button
            type="button"
            onClick={() => onSuggestRanges(source)}
            style={buttonStyle}
          >
            {c.suggestRanges} {sourceLabels[source]}
          </button>
        </span>
      ))}
      <button type="button" onClick={onReset} style={buttonStyle}>
        {c.reset}
      </button>
      <div
        data-testid="tracking-calibration-diagnostics"
        style={{ display: "grid", gap: "6px", minWidth: "280px", flex: 1 }}
      >
        {diagnostics.length === 0
          ? c.noSignal
          : diagnostics.map((item) => (
              <div key={item.channelId} style={{ display: "grid", gap: "3px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <code>
                    {item.channelId}:{item.raw.toFixed(2)}-&gt;{item.value.toFixed(2)}
                  </code>
                  <span style={{ opacity: 0.75 }}>
                    {formatDiagnosticStatus(item, c)}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`${c.meterAriaLabel} ${item.channelId}`}
                  aria-valuemin={item.inputMin ?? -1}
                  aria-valuemax={item.inputMax ?? 1}
                  aria-valuenow={item.raw}
                  style={{
                    height: "6px",
                    borderRadius: "999px",
                    overflow: "hidden",
                    backgroundColor: "var(--border)",
                  }}
                >
                  <div
                    style={{
                      width: `${meterPercent(item.raw, item.inputMin, item.inputMax)}%`,
                      height: "100%",
                      backgroundColor: item.clipped
                        ? "var(--danger-strong)"
                        : "var(--accent-warm)",
                    }}
                  />
                </div>
                {item.observedMin !== undefined && item.observedMax !== undefined && (
                  <small style={{ opacity: 0.7 }}>
                    {c.observed} {item.observedMin.toFixed(2)}..
                    {item.observedMax.toFixed(2)}
                  </small>
                )}
              </div>
            ))}
      </div>
    </section>
  );
}

function formatDiagnosticStatus(
  item: CalibrationDiagnostic,
  c: CalibrationCopy,
): string {
  const statuses: string[] = [];
  if (item.stale) statuses.push(c.stale);
  if (item.clipped) statuses.push(c.clipped);
  statuses.push(item.calibrated ? c.calibrated : c.raw);
  return statuses.join(" ");
}

function meterPercent(
  value: number,
  inputMin: number | undefined,
  inputMax: number | undefined,
): number {
  const min = inputMin ?? -1;
  const max = inputMax ?? 1;
  if (max - min <= Number.EPSILON) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

const buttonStyle = {
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  padding: "4px 8px",
  backgroundColor: "var(--bg-hover)",
  color: "var(--text-primary)",
};
