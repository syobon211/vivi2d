import type { ViewerApiGrantSummary } from "../api/viewer-api-client-types";
import { describeScopeRisk } from "../api/viewer-api-status";
import type { Locale } from "../i18n";
import { smallBtnStyle } from "../styles";

interface GrantManagementTableProps {
  locale: Locale;
  grants: ViewerApiGrantSummary[];
  busy: boolean;
  onRevoke: (grantId: string) => void;
  onRotate: (grantId: string) => void;
}

const copy: Record<Locale, {
  approved: string;
  empty: string;
  origin: string;
  scopes: string;
  lastUsed: string;
  revoke: string;
  rotate: string;
}> = {
  en: {
    approved: "Approved clients",
    empty: "No approved clients.",
    origin: "Origin",
    scopes: "Scopes",
    lastUsed: "Last used",
    revoke: "Revoke",
    rotate: "Revoke and re-pair",
  },
  ja: {
    approved: "承認済みクライアント",
    empty: "承認済みクライアントはありません。",
    origin: "接続元",
    scopes: "権限",
    lastUsed: "最終使用",
    revoke: "取り消し",
    rotate: "取り消して再ペアリング",
  },
  "zh-Hans": {
    approved: "已批准的客户端",
    empty: "没有已批准的客户端。",
    origin: "来源",
    scopes: "权限范围",
    lastUsed: "最后使用",
    revoke: "撤销",
    rotate: "撤销并重新配对",
  },
  "ko-KR": {
    approved: "승인된 클라이언트",
    empty: "승인된 클라이언트가 없습니다.",
    origin: "출처",
    scopes: "권한 범위",
    lastUsed: "마지막 사용",
    revoke: "철회",
    rotate: "철회 후 다시 페어링",
  },
};

function formatTime(value: number | null, locale: Locale): string {
  if (!value) return "-";
  const dateLocale =
    locale === "ja"
      ? "ja-JP"
      : locale === "zh-Hans"
        ? "zh-Hans-CN"
        : locale === "ko-KR"
          ? "ko-KR"
          : "en-US";
  return new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export function GrantManagementTable({
  locale,
  grants,
  busy,
  onRevoke,
  onRotate,
}: GrantManagementTableProps) {
  const c = copy[locale];
  return (
    <section aria-label={c.approved} style={{ display: "grid", gap: "8px" }}>
      <strong>{c.approved}</strong>
      {grants.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.7 }}>{c.empty}</p>
      ) : (
        <div style={{ display: "grid", gap: "8px" }}>
          {grants.map((grant) => (
            <article
              key={grant.id}
              data-testid="viewer-api-grant-row"
              style={{
                display: "grid",
                gap: "6px",
                padding: "10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface)",
              }}
            >
              <strong>
                {grant.appName}{" "}
                <span style={{ opacity: 0.55 }}>
                  #{grant.fingerprint ?? grant.id.slice(0, 12)}
                </span>
              </strong>
              <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
                {c.origin}: {grant.originBinding}
              </span>
              <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
                {c.scopes}:{" "}
                {grant.scopes
                  .map((scope) => `${scope} (${formatScopeRisk(scope, locale)})`)
                  .join(", ")}
              </span>
              <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
                {c.lastUsed}: {formatTime(grant.lastUsedAt, locale)}
              </span>
              <span style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRotate(grant.id)}
                  style={smallBtnStyle()}
                >
                  {c.rotate}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRevoke(grant.id)}
                  style={smallBtnStyle(false)}
                >
                  {c.revoke}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatScopeRisk(
  scope: ViewerApiGrantSummary["scopes"][number],
  locale: Locale,
): string {
  const risk = describeScopeRisk(scope);
  if (locale === "ja") return { low: "低リスク", medium: "中リスク", high: "高リスク" }[risk];
  if (locale === "zh-Hans") return { low: "低风险", medium: "中风险", high: "高风险" }[risk];
  if (locale === "ko-KR") return { low: "낮은 위험", medium: "중간 위험", high: "높은 위험" }[risk];
  return risk;
}
