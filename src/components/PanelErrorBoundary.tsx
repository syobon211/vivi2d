import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  children: ReactNode;
  panelName: string;
  onError?: (error: Error, errorId: string, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

interface FallbackProps {
  panelName: string;
  error: Error | null;
  errorId: string | null;
  onTryAgain: () => void;
}

function PanelErrorFallback({ panelName, error, errorId, onTryAgain }: FallbackProps) {
  const t = useT();
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="panel-error"
      data-panel-name={panelName}
    >
      <div className="panel-error-title">
        {t("errorBoundary.panelTitle")} {panelName}
      </div>
      {error && <pre className="panel-error-message">{error.message}</pre>}
      {errorId && (
        <div className="panel-error-id">
          <code>{errorId}</code>
        </div>
      )}
      <button type="button" className="panel-error-retry" onClick={onTryAgain}>
        {t("errorBoundary.tryAgain")}
      </button>
    </div>
  );
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const errorId = this.generateErrorId();
    this.setState({ errorId });
    console.error(
      `[PanelErrorBoundary:${this.props.panelName}] (id=${errorId}):`,
      error,
      info.componentStack,
    );
    this.props.onError?.(error, errorId, info);
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

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
        <PanelErrorFallback
          panelName={this.props.panelName}
          error={this.state.error}
          errorId={this.state.errorId}
          onTryAgain={this.handleTryAgain}
        />
      );
    }
    return this.props.children;
  }
}
