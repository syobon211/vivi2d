import type { Locale } from "../i18n";
import type { RecordingState } from "../recorder";
import { getStreamSafeDisplayName } from "./viewer-workflow";

interface ViewerStatusStripProps {
  locale: Locale;
  loaded: boolean;
  modelName: string;
  viewerApiEnabled: boolean;
  tracking: boolean;
  handTracking: boolean;
  poseTracking: boolean;
  lipSync: boolean;
  showHud: boolean;
  recordingState: RecordingState;
  propCount: number;
  calibrationProfileCount: number;
}

export function ViewerStatusStrip({
  locale,
  loaded,
  modelName,
  viewerApiEnabled,
  tracking,
  handTracking,
  poseTracking,
  lipSync,
  showHud,
  recordingState,
  propCount,
  calibrationProfileCount,
}: ViewerStatusStripProps) {
  const labels = STATUS_LABELS[locale];
  return (
    <footer
      data-testid="viewer-status-strip"
      className="viewer-status-strip"
      aria-label={labels.ariaLabel}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "6px 10px",
        backgroundColor: "var(--bg-elevated)",
        borderTop: "1px solid var(--border)",
        color: "var(--text-secondary)",
        fontSize: "var(--text-xs)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {loaded ? getStreamSafeDisplayName(modelName) : labels.noModel}
      </span>
      <span style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <StatusItem label={labels.api} active={viewerApiEnabled} labels={labels} />
        <StatusItem label={labels.face} active={tracking} labels={labels} />
        <StatusItem label={labels.hand} active={handTracking} labels={labels} />
        <StatusItem label={labels.pose} active={poseTracking} labels={labels} />
        <StatusItem label={labels.lip} active={lipSync} labels={labels} />
        <StatusItem label={labels.stats} active={showHud} labels={labels} />
        <span>
          {labels.props} {propCount}
        </span>
        <span>
          {labels.calibration} {calibrationProfileCount}
        </span>
        <span>
          {labels.recording} {labels.recordingStates[recordingState]}
        </span>
      </span>
    </footer>
  );
}

function StatusItem({
  label,
  active,
  labels = STATUS_LABELS.en,
}: {
  label: string;
  active: boolean;
  labels?: StatusLabels;
}) {
  return (
    <span style={{ color: active ? "var(--viewer-status-ok)" : "var(--text-muted)" }}>
      {label} {active ? labels.on : labels.off}
    </span>
  );
}

type StatusLabels = {
  ariaLabel: string;
  noModel: string;
  api: string;
  face: string;
  hand: string;
  pose: string;
  lip: string;
  stats: string;
  props: string;
  calibration: string;
  recording: string;
  on: string;
  off: string;
  recordingStates: Record<RecordingState, string>;
};

const STATUS_LABELS: Record<Locale, StatusLabels> = {
  en: {
    ariaLabel: "Viewer status",
    noModel: "No model loaded",
    api: "API",
    face: "Face",
    hand: "Hand",
    pose: "Pose",
    lip: "Lip",
    stats: "Stats",
    props: "Items",
    calibration: "Profiles",
    recording: "Recording",
    on: "on",
    off: "off",
    recordingStates: {
      idle: "idle",
      recording: "recording",
      processing: "processing",
    },
  },
  ja: {
    ariaLabel: "Viewer 状態",
    noModel: "モデル未読み込み",
    api: "API",
    face: "顔",
    hand: "手",
    pose: "姿勢",
    lip: "リップ",
    stats: "統計",
    props: "アイテム",
    calibration: "調整",
    recording: "録画",
    on: "ON",
    off: "OFF",
    recordingStates: {
      idle: "待機",
      recording: "録画中",
      processing: "処理中",
    },
  },
  "zh-Hans": {
    ariaLabel: "Viewer 状态",
    noModel: "未加载模型",
    api: "API",
    face: "脸",
    hand: "手",
    pose: "姿势",
    lip: "口型",
    stats: "统计",
    props: "项目",
    calibration: "校准",
    recording: "录制",
    on: "开",
    off: "关",
    recordingStates: {
      idle: "待机",
      recording: "录制中",
      processing: "处理中",
    },
  },
  "ko-KR": {
    ariaLabel: "Viewer 상태",
    noModel: "모델 없음",
    api: "API",
    face: "얼굴",
    hand: "손",
    pose: "자세",
    lip: "입",
    stats: "통계",
    props: "아이템",
    calibration: "보정",
    recording: "녹화",
    on: "ON",
    off: "OFF",
    recordingStates: {
      idle: "대기",
      recording: "녹화 중",
      processing: "처리 중",
    },
  },
};
