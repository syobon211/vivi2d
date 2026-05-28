import type { ComponentProps, ReactNode } from "react";
import { ContextToolbar } from "../components/ContextToolbar";
import { SideSheet } from "../components/SideSheet";
import { ViewerShell } from "../components/ViewerShell";
import { ViewerStatusStrip } from "../components/ViewerStatusStrip";
import { rootStyle } from "../styles";

interface ViewerShellFrameProps {
  rootAriaLabel: string;
  toolbarProps: ComponentProps<typeof ContextToolbar>;
  sideSheetProps: ComponentProps<typeof SideSheet>;
  statusStripProps: ComponentProps<typeof ViewerStatusStrip>;
  onDragOver: ComponentProps<"div">["onDragOver"];
  onDragLeave: ComponentProps<"div">["onDragLeave"];
  onDrop: ComponentProps<"div">["onDrop"];
  children: ReactNode;
}

export function ViewerShellFrame({
  rootAriaLabel,
  toolbarProps,
  sideSheetProps,
  statusStripProps,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: ViewerShellFrameProps) {
  return (
    <div
      style={rootStyle}
      aria-label={rootAriaLabel}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ViewerShell
        toolbar={<ContextToolbar {...toolbarProps} />}
        sideSheet={<SideSheet {...sideSheetProps} />}
        statusStrip={<ViewerStatusStrip {...statusStripProps} />}
      >
        {children}
      </ViewerShell>
    </div>
  );
}
