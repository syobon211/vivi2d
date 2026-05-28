import { useCallback, useEffect, useRef, useState } from "react";

export function MenuDropdown({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const handleToggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const mouseHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", mouseHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", mouseHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const items = getFocusableItems(panelRef.current);
    items[0]?.focus();
  }, [open]);

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    const items = getFocusableItems(panelRef.current);
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const currentIdx = active ? items.indexOf(active as HTMLButtonElement) : -1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev =
        currentIdx < 0
          ? items.length - 1
          : (currentIdx - 1 + items.length) % items.length;
      items[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }, []);

  return (
    <div ref={ref} className={`menu-dropdown ${className ?? ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="menu-btn menu-dropdown-trigger"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          className="menu-dropdown-panel"
          onClick={close}
          onKeyDown={handlePanelKeyDown}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function getFocusableItems(panel: HTMLElement): HTMLButtonElement[] {
  const all = panel.querySelectorAll<HTMLButtonElement>(
    '[role="menuitem"]:not(:disabled)',
  );
  return Array.from(all);
}

export function MenuDropdownItem({
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-dropdown-item ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
