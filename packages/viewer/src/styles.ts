import type { CSSProperties } from "react";

export const btnStyle = (active = false): CSSProperties => ({
  padding: "6px 12px",
  backgroundColor: active ? "var(--accent-warm)" : "var(--bg-hover)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: active ? "var(--button-active-text)" : "var(--text-primary)",
  cursor: "pointer",
  fontSize: "var(--text-base)",
  whiteSpace: "nowrap",
});

export const smallBtnStyle = (active = false): CSSProperties => ({
  ...btnStyle(active),
  padding: "4px 8px",
  fontSize: "var(--text-sm)",
});

export const selectStyle: CSSProperties = {
  padding: "4px 6px",
  backgroundColor: "var(--bg-hover)",
  color: "var(--text-primary)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-sm)",
};

export const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  backgroundColor: "var(--bg-base)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-ui)",
};

export const toolbarStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  padding: "6px 8px",
  backgroundColor: "var(--bg-elevated)",
  alignItems: "center",
  flexShrink: 0,
};

export const badgeBaseStyle: CSSProperties = {
  marginLeft: "4px",
  padding: "2px 6px",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--text-xs)",
};
