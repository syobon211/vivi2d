import { useState } from "react";
import type { ViewerApiPendingChallenge } from "../api/viewer-api-client-types";
import { describeScopeRisk } from "../api/viewer-api-status";
import type { Locale } from "../i18n";
import { smallBtnStyle } from "../styles";

interface PairingRequestCardProps {
  locale: Locale;
  challenge: ViewerApiPendingChallenge;
  busy: boolean;
  onApprove: (challengeId: string, code: string) => void;
}

const copy: Record<Locale, {
  pending: string;
  origin: string;
  codeHidden: string;
  approve: string;
  attempts: string;
  enterCode: string;
}> = {
  en: {
    pending: "Pending",
    origin: "Origin",
    codeHidden: "Verification code is hidden",
    approve: "Approve",
    attempts: "Failed attempts",
    enterCode: "Enter the 6-digit code shown by the external client",
  },
  ja: {
    pending: "承認待ち",
    origin: "接続元",
    codeHidden: "確認コードは非表示です",
    approve: "承認",
    attempts: "失敗回数",
    enterCode: "外部クライアントに表示された6桁のコードを入力",
  },
  "zh-Hans": {
    pending: "等待批准",
    origin: "来源",
    codeHidden: "验证码已隐藏",
    approve: "批准",
    attempts: "失败次数",
    enterCode: "输入外部客户端显示的6位代码",
  },
  "ko-KR": {
    pending: "승인 대기",
    origin: "출처",
    codeHidden: "확인 코드는 숨겨져 있습니다",
    approve: "승인",
    attempts: "실패 횟수",
    enterCode: "외부 클라이언트에 표시된 6자리 코드를 입력하세요",
  },
};

export function PairingRequestCard({
  locale,
  challenge,
  busy,
  onApprove,
}: PairingRequestCardProps) {
  const c = copy[locale];
  const [typedCode, setTypedCode] = useState("");
  const canApprove = /^[0-9]{6}$/.test(typedCode);
  return (
    <article
      data-testid="viewer-api-pairing-card"
      style={{
        padding: "12px",
        border: "1px solid var(--accent-warm)",
        borderRadius: "var(--radius-md)",
        background: "color-mix(in srgb, var(--accent-warm) 12%, var(--bg-surface))",
        display: "grid",
        gap: "8px",
        minWidth: "240px",
      }}
    >
      <strong>
        {c.pending}: {challenge.appName}
      </strong>
      <span style={{ fontSize: "var(--text-sm)", opacity: 0.8 }}>
        {c.origin}: {challenge.originBinding}
      </span>
      <span
        aria-label={c.codeHidden}
        style={{
          fontSize: "var(--text-sm)",
          letterSpacing: "0.08em",
          opacity: 0.75,
        }}
      >
        {c.codeHidden}: ******
      </span>
      <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
        {challenge.scopes
          .map((scope) => `${scope} (${formatScopeRisk(scope, locale)})`)
          .join(", ")}
      </span>
      <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
        {c.attempts}: {challenge.badCodeAttempts}
      </span>
      <label style={{ display: "grid", gap: "4px", fontSize: "var(--text-sm)" }}>
        {c.enterCode}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={typedCode}
          onChange={(event) => {
            setTypedCode(event.target.value.replace(/\D/g, "").slice(0, 6));
          }}
          style={{
            padding: "6px 8px",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            letterSpacing: "0.16em",
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy || !canApprove}
        onClick={() => onApprove(challenge.id, typedCode)}
        style={smallBtnStyle(true)}
      >
        {c.approve}
      </button>
    </article>
  );
}

function formatScopeRisk(
  scope: ViewerApiPendingChallenge["scopes"][number],
  locale: Locale,
): string {
  const risk = describeScopeRisk(scope);
  if (locale === "ja") return { low: "低リスク", medium: "中リスク", high: "高リスク" }[risk];
  if (locale === "zh-Hans") return { low: "低风险", medium: "中风险", high: "高风险" }[risk];
  if (locale === "ko-KR") return { low: "낮은 위험", medium: "중간 위험", high: "높은 위험" }[risk];
  return risk;
}
