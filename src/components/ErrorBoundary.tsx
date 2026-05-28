import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  children: ReactNode;
  // Optional callback for telemetry or error reporting.
  // `errorId` is generated per captured error instance.
  onError?: (error: Error, errorId: string, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

interface FallbackProps {
  error: Error | null;
  errorId: string | null;
  onTryAgain: () => void;
}

// Fallback UI for the top-level error boundary.
// It is separated from the class component so it can use i18n hooks.
function ErrorFallback({ error, errorId, onTryAgain }: FallbackProps) {
  const t = useT();
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-labelledby="vivi2d-error-title"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "var(--bg-base, #1e1e2e)",
        color: "var(--text-primary, #cdd6f4)",
        fontFamily: "var(--font-ui, sans-serif)",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1
        id="vivi2d-error-title"
        style={{
          fontSize: "1.5rem",
          marginBottom: "1rem",
          color: "var(--danger, #f38ba8)",
        }}
      >
        {t("errorBoundary.title")}
      </h1>
      <p
        style={{
          fontSize: "0.9rem",
          marginBottom: "0.5rem",
          color: "var(--text-secondary, #a6adc8)",
        }}
      >
        {t("errorBoundary.description")}
      </p>
      {error && (
        <pre
          style={{
            fontSize: "0.8rem",
            color: "var(--text-primary, #f9e2af)",
            backgroundColor: "var(--bg-elevated, #313244)",
            padding: "1rem",
            borderRadius: "8px",
            maxWidth: "600px",
            overflow: "auto",
            marginBottom: "1rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </pre>
      )}
      {errorId && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted, #9090a5)",
            marginBottom: "1.5rem",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {t("errorBoundary.errorId")} <code>{errorId}</code>
        </p>
      )}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={onTryAgain}
          style={{
            padding: "0.6rem 1.5rem",
            fontSize: "1rem",
            backgroundColor: "var(--bg-elevated, #313244)",
            color: "var(--text-primary, #cdd6f4)",
            border: "1px solid var(--border, #3a3a55)",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {t("errorBoundary.tryAgain")}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "0.6rem 1.5rem",
            fontSize: "1rem",
            backgroundColor: "var(--accent, #89b4fa)",
            color: "var(--bg-base, #1e1e2e)",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {t("errorBoundary.reload")}
        </button>
      </div>
    </div>
  );
}

// Top-level application error boundary.
// "Try again" clears the error state and remounts the subtree.
// "Reload" performs a full page reload.
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // `errorId` is generated in componentDidCatch and stored immediately after capture.
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const errorId = this.generateErrorId();
    this.setState({ errorId });
    console.error(
      `[ErrorBoundary] Caught error (id=${errorId}):`,
      error,
      info.componentStack,
    );
    this.props.onError?.(error, errorId, info);
  }

  /** Clear the error state and try to remount the subtree. */
  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  /** Fallback ID generator for environments without `crypto.randomUUID`. */
  private generateErrorId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    const rand = Math.random().toString(36).slice(2, 10);
    return `err-${Date.now().toString(36)}-${rand}`;
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          onTryAgain={this.handleTryAgain}
        />
      );
    }

    return this.props.children;
  }
}
