import type { ReactNode } from "react";

interface ViewerShellProps {
  toolbar: ReactNode;
  sideSheet: ReactNode;
  statusStrip: ReactNode;
  children: ReactNode;
}

export function ViewerShell({
  toolbar,
  sideSheet,
  statusStrip,
  children,
}: ViewerShellProps) {
  return (
    <div
      data-testid="viewer-shell"
      className="viewer-shell"
      style={{ display: "contents" }}
    >
      {toolbar}
      <div
        className="viewer-shell__body"
        style={{
          minHeight: 0,
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          background:
            "radial-gradient(circle at 20% 10%, rgba(124,111,240,0.12), transparent 32%), var(--bg-base)",
        }}
      >
        <main
          data-testid="viewer-stage-shell"
          className="viewer-shell__stage"
          style={{
            minWidth: 0,
            minHeight: 0,
            position: "relative",
            display: "flex",
          }}
        >
          {children}
        </main>
        {sideSheet}
      </div>
      {statusStrip}
    </div>
  );
}
