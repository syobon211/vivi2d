import type { createT } from "../i18n";
import type { Vowel } from "../tracking/lipsync-analyser";

// VowelIndicator / RecordingIndicator / PresetIndicator / Toast

interface VowelProps {
  t: ReturnType<typeof createT>;
  vowel: Vowel;
}

export function VowelIndicator({ t, vowel }: VowelProps) {
  if (vowel === "silent") return null;
  return (
    <div
      data-testid="vowel-indicator"
      style={{
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 20px",
        backgroundColor: "var(--viewer-overlay-vowel)",
        borderRadius: "var(--radius-md)",
        fontSize: "24px",
        color: "white",
        pointerEvents: "none",
        fontWeight: "bold",
      }}
    >
      {t(`vowel${vowel.toUpperCase() as "A" | "I" | "U" | "E" | "O"}`)}
    </div>
  );
}

export function RecordingIndicator() {
  return (
    <div
      data-testid="recording-indicator"
      style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        backgroundColor: "var(--danger)",
        animation: "pulse 1s infinite",
        pointerEvents: "none",
      }}
    />
  );
}

export function PresetIndicator({ label }: { label: string }) {
  return (
    <div
      data-testid="preset-indicator"
      style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        padding: "8px 16px",
        backgroundColor: "var(--viewer-overlay-preset)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-base)",
        color: "white",
        pointerEvents: "none",
      }}
    >
      {label}
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div
      data-testid="toast"
      style={{
        position: "absolute",
        bottom: "60px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 16px",
        backgroundColor: "var(--viewer-overlay-toast)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-base)",
        color: "white",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
