import type { CSSProperties } from "react";
import type { Locale } from "../i18n";
import { useViewerApiStatus } from "../hooks/useViewerApiStatus";
import { btnStyle, smallBtnStyle } from "../styles";
import { GrantManagementTable } from "./GrantManagementTable";
import { PairingRequestCard } from "./PairingRequestCard";

interface ViewerApiPanelProps {
  locale: Locale;
}

const copy: Record<Locale, {
  title: string;
  subtitle: string;
  enable: string;
  disable: string;
  unavailableButton: string;
  pair: string;
  closePairing: string;
  endpoint: string;
  storageOk: string;
  storageSession: string;
  storageUnavailable: string;
  loopback: string;
  noToken: string;
  browserOrigin: string;
  pending: string;
  error: string;
  unavailable: string;
}> = {
  en: {
    title: "Connect Center",
    subtitle: "The Local API is available only to clients you explicitly approve.",
    enable: "Enable Local API",
    disable: "Disable Local API",
    unavailableButton: "Electron only",
    pair: "Pair new client",
    closePairing: "Close pairing",
    endpoint: "Endpoint",
    storageOk: "Secure storage: available",
    storageSession: "Secure storage: dev session only",
    storageUnavailable:
      "Secure storage unavailable: pairing cannot persist approved clients",
    loopback: "127.0.0.1 only",
    noToken: "Tokens are never shown in the UI",
    browserOrigin: "Browser clients must match their approved Origin",
    pending: "Pending requests",
    error: "Error",
    unavailable:
      "Local API is available only in the Electron viewer. It is disabled in browser preview.",
  },
  ja: {
    title: "接続センター",
    subtitle: "ローカルAPIは、明示的に承認したクライアントだけが利用できます。",
    enable: "ローカルAPIを有効化",
    disable: "ローカルAPIを無効化",
    unavailableButton: "Electron版のみ",
    pair: "新しいクライアントをペアリング",
    closePairing: "ペアリング受付を閉じる",
    endpoint: "エンドポイント",
    storageOk: "安全な保存: 利用可能",
    storageSession: "安全な保存: 開発セッションのみ",
    storageUnavailable:
      "安全な保存を利用できません: 承認済みクライアントは保存されません",
    loopback: "127.0.0.1のみ",
    noToken: "トークンは画面に表示されません",
    browserOrigin: "ブラウザクライアントは承認済みOriginと一致する必要があります",
    pending: "承認待ち",
    error: "エラー",
    unavailable:
      "ローカルAPIはElectron版ビューアでのみ利用できます。ブラウザpreviewでは接続機能は無効です。",
  },
  "zh-Hans": {
    title: "连接中心",
    subtitle: "本地 API 仅供你明确批准的客户端使用。",
    enable: "启用本地 API",
    disable: "停用本地 API",
    unavailableButton: "仅 Electron",
    pair: "配对新客户端",
    closePairing: "关闭配对",
    endpoint: "端点",
    storageOk: "安全存储：可用",
    storageSession: "安全存储：仅开发会话",
    storageUnavailable: "安全存储不可用：已批准的客户端不会被保存",
    loopback: "仅 127.0.0.1",
    noToken: "令牌永远不会显示在界面中",
    browserOrigin: "浏览器客户端必须匹配已批准的 Origin",
    pending: "待处理请求",
    error: "错误",
    unavailable:
      "本地 API 仅在 Electron Viewer 中可用。浏览器预览中已禁用。",
  },
  "ko-KR": {
    title: "연결 센터",
    subtitle: "로컬 API는 명시적으로 승인한 클라이언트만 사용할 수 있습니다.",
    enable: "로컬 API 활성화",
    disable: "로컬 API 비활성화",
    unavailableButton: "Electron 전용",
    pair: "새 클라이언트 페어링",
    closePairing: "페어링 닫기",
    endpoint: "엔드포인트",
    storageOk: "보안 저장소: 사용 가능",
    storageSession: "보안 저장소: 개발 세션 전용",
    storageUnavailable: "보안 저장소를 사용할 수 없음: 승인한 클라이언트가 저장되지 않음",
    loopback: "127.0.0.1만 허용",
    noToken: "토큰은 UI에 표시되지 않습니다",
    browserOrigin: "브라우저 클라이언트는 승인된 Origin과 일치해야 합니다",
    pending: "대기 중인 요청",
    error: "오류",
    unavailable:
      "로컬 API는 Electron Viewer에서만 사용할 수 있습니다. 브라우저 미리보기에서는 비활성화됩니다.",
  },
};

export function ViewerApiPanel({ locale }: ViewerApiPanelProps) {
  const c = copy[locale];
  const {
    status,
    available,
    busy,
    error,
    setEnabled,
    openPairingWindow,
    closePairingWindow,
    approvePairing,
    revokeGrant,
    rotateGrant,
  } = useViewerApiStatus();
  const pending = status.pendingChallenges ?? [];
  const grants = status.grants ?? [];
  const storageLabel =
    status.tokenPersistence === "persistent"
      ? c.storageOk
      : status.tokenPersistence === "session"
        ? c.storageSession
        : c.storageUnavailable;

  return (
    <section
      data-testid="viewer-api-panel"
      style={{
        display: "grid",
        gap: "12px",
        padding: "12px",
        borderBottom: "1px solid var(--border)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--bg-surface) 88%, var(--accent-warm)), var(--bg-surface))",
      }}
    >
      <header style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ display: "grid", gap: "3px", minWidth: 0 }}>
          <strong style={{ fontSize: "var(--text-lg)" }}>{c.title}</strong>
          <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
            {c.subtitle}
          </span>
        </div>
        <button
          type="button"
          disabled={busy || !available}
          onClick={() => void setEnabled(!status.enabled)}
          title={!available ? c.unavailable : undefined}
          style={{
            ...btnStyle(status.enabled),
            marginLeft: "auto",
            opacity: available ? 1 : 0.62,
            cursor: available ? "pointer" : "not-allowed",
          }}
        >
          {!available ? c.unavailableButton : status.enabled ? c.disable : c.enable}
        </button>
      </header>

      {!available && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-hover)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.5,
          }}
        >
          {c.unavailable}
        </p>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <span style={badgeStyle}>{c.loopback}</span>
        <span style={badgeStyle}>{c.noToken}</span>
        <span style={badgeStyle}>{c.browserOrigin}</span>
        <span style={badgeStyle}>
          {storageLabel}
        </span>
      </div>

      {status.enabled && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-sm)", opacity: 0.8 }}>
            {c.endpoint}: {status.endpoint ?? `ws://127.0.0.1:${status.port ?? ""}`}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openPairingWindow()}
            style={smallBtnStyle(status.pairingWindowOpen)}
          >
            {c.pair}
          </button>
          {status.pairingWindowOpen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void closePairingWindow()}
              style={smallBtnStyle()}
            >
              {c.closePairing}
            </button>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <section style={{ display: "grid", gap: "8px" }}>
          <strong>{c.pending}</strong>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {pending.map((challenge) => (
              <PairingRequestCard
                key={challenge.id}
                locale={locale}
                challenge={challenge}
                busy={busy}
                onApprove={(challengeId, code) => void approvePairing(challengeId, code)}
              />
            ))}
          </div>
        </section>
      )}

      <GrantManagementTable
        locale={locale}
        grants={grants}
        busy={busy}
        onRevoke={(grantId) => void revokeGrant(grantId)}
        onRotate={(grantId) => void rotateGrant(grantId)}
      />

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--danger-strong)" }}>
          {c.error}: {error}
        </p>
      )}
    </section>
  );
}

const badgeStyle: CSSProperties = {
  padding: "3px 8px",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "var(--bg-hover)",
  fontSize: "var(--text-xs)",
};
