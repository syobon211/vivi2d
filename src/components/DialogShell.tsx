import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/hooks/useDialog";

type Props = {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;

  minWidth?: number;

  className?: string;

  contentStyle?: CSSProperties;

  bodyStyle?: CSSProperties;

  disableEscape?: boolean;

  disableBackdropClose?: boolean;

  disableFocusTrap?: boolean;
};

export function DialogShell({
  onClose,
  title,
  children,
  footer,
  minWidth = 400,
  className,
  contentStyle,
  bodyStyle,
  disableEscape = false,
  disableBackdropClose = false,
  disableFocusTrap = false,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog({ dialogRef, onClose, disableEscape, disableFocusTrap });

  const handleOverlayClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (disableBackdropClose) return;
      if (e.target === e.currentTarget) onClose();
    },
    [onClose, disableBackdropClose],
  );

  const dialog = (
    // biome-ignore lint/a11y: The overlay only handles pointer backdrop dismissal; keyboard dismissal is owned by useDialog Escape handling.
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className={`modal-content${className ? ` ${className}` : ""}`}
        style={{ minWidth, ...contentStyle }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div id={titleId} className="modal-title">
          {title}
        </div>
        <div className="modal-body" style={bodyStyle}>
          {children}
        </div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
