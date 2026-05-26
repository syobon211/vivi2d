import type { createT } from "../i18n";
import { btnStyle, selectStyle, toolbarStyle } from "../styles";
import { MappingBadges } from "./MappingBadges";

interface ToolbarProps {
  t: ReturnType<typeof createT>;
  loaded: boolean;
  modelName: string;
  mappedCount: number;
  platformFaceMappedCount: number;
  handMappedCount: number;
  poseMappedCount: number;
  tracking: boolean;
  handTracking: boolean;
  lipSync: boolean;
  poseTracking: boolean;
  cameras: MediaDeviceInfo[];
  selectedCamera: string;
  error: string | null;
  panelOpen: boolean;
  onFileLoad: (file: File) => void;
  onToggleTracking: () => void;
  onToggleHandTracking: () => void;
  onToggleLipSync: () => void;
  onTogglePoseTracking: () => void;
  onCameraChange: (deviceId: string) => void;
  onTogglePanel: () => void;
}

export function Toolbar({
  t,
  loaded,
  modelName,
  mappedCount,
  platformFaceMappedCount,
  handMappedCount,
  poseMappedCount,
  tracking,
  handTracking,
  lipSync,
  poseTracking,
  cameras,
  selectedCamera,
  error,
  panelOpen,
  onFileLoad,
  onToggleTracking,
  onToggleHandTracking,
  onToggleLipSync,
  onTogglePoseTracking,
  onCameraChange,
  onTogglePanel,
}: ToolbarProps) {
  return (
    <div data-testid="main-toolbar" style={toolbarStyle}>
      <label style={{ ...btnStyle(), cursor: "pointer" }}>
        {t("openModel")}
        <input
          type="file"
          accept=".vivi"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileLoad(file);
          }}
        />
      </label>

      {modelName && (
        <span style={{ fontSize: "13px", opacity: 0.7, whiteSpace: "nowrap" }}>
          {modelName}
          <MappingBadges
            t={t}
            mappedCount={mappedCount}
            platformFaceMappedCount={platformFaceMappedCount}
            handMappedCount={handMappedCount}
            poseMappedCount={poseMappedCount}
          />
        </span>
      )}

      <TrackingToggle
        label={t("faceTrackingStart")}
        status={tracking}
        loaded={loaded}
        title={t("faceTrackingTip")}
        onClick={onToggleTracking}
        t={t}
      />
      <TrackingToggle
        label={t("handTrackingStart")}
        status={handTracking}
        loaded={loaded}
        title={t("handTrackingTip")}
        onClick={onToggleHandTracking}
        t={t}
      />
      <TrackingToggle
        label={t("lipSyncStart")}
        status={lipSync}
        loaded={loaded}
        title={t("lipSyncTip")}
        onClick={onToggleLipSync}
        t={t}
      />
      <TrackingToggle
        label={t("poseStart")}
        status={poseTracking}
        loaded={loaded}
        title={t("poseTrackingTip")}
        onClick={onTogglePoseTracking}
        t={t}
      />

      {cameras.length > 1 && (
        <select
          value={selectedCamera}
          disabled={tracking}
          onChange={(e) => onCameraChange(e.target.value)}
          style={{ ...selectStyle, padding: "6px 8px", fontSize: "13px" }}
        >
          <option value="">{t("defaultCamera")}</option>
          {cameras.map((cam) => (
            <option key={cam.deviceId} value={cam.deviceId}>
              {cam.label || `${t("cameraPrefix")} ${cam.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}

      {error && (
        <span
          data-testid="viewer-error"
          style={{
            color: "var(--danger-strong)",
            fontSize: "var(--text-base)",
            marginLeft: "auto",
          }}
        >
          {error}
        </span>
      )}
      <button
        type="button"
        data-testid="settings-toggle"
        onClick={onTogglePanel}
        style={{ ...btnStyle(panelOpen), marginLeft: error ? "6px" : "auto" }}
      >
        {t("controls")}
      </button>
    </div>
  );
}

function TrackingToggle({
  label,
  status,
  loaded,
  title,
  onClick,
  t,
}: {
  label: string;
  status: boolean;
  loaded: boolean;
  title: string;
  onClick: () => void;
  t: ReturnType<typeof createT>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!loaded}
      title={title}
      style={{
        ...btnStyle(),
        backgroundColor: "var(--border)",
        opacity: loaded ? 1 : 0.5,
        cursor: loaded ? "pointer" : "not-allowed",
      }}
    >
      {label}{" "}
      <span style={{ color: status ? "var(--danger)" : "var(--text-inverse)" }}>
        {status ? t("trackingOn") : t("trackingOff")}
      </span>
    </button>
  );
}
