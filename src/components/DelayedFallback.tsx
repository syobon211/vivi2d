import { type ReactNode, useEffect, useState } from "react";

interface DelayedFallbackProps {
  delayMs?: number;
  children: ReactNode;
}

export function DelayedFallback({ delayMs = 100, children }: DelayedFallbackProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  return show ? children : null;
}
