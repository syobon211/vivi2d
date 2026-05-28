export interface E2EPerfProbeEvent {
  name: string;
  durationMs: number;
  meta?: Record<string, unknown>;
  recordedAt: number;
}

interface E2EPerfProbeState {
  marks: Map<string, number>;
  events: E2EPerfProbeEvent[];
}

declare global {
  interface Window {
    __vivi2dPerfProbeState__?: E2EPerfProbeState;
  }
}

function getProbeState(): E2EPerfProbeState | null {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return null;
  }
  window.__vivi2dPerfProbeState__ ??= {
    marks: new Map<string, number>(),
    events: [],
  };
  return window.__vivi2dPerfProbeState__;
}

function buildKey(name: string, key?: string): string {
  return key ? `${name}:${key}` : name;
}

export function startE2EPerfProbe(name: string, key?: string): void {
  const state = getProbeState();
  if (!state) return;
  state.marks.set(buildKey(name, key), performance.now());
}

export function endE2EPerfProbe(
  name: string,
  key?: string,
  meta?: Record<string, unknown>,
): void {
  const state = getProbeState();
  if (!state) return;
  const probeKey = buildKey(name, key);
  const startedAt = state.marks.get(probeKey);
  if (startedAt === undefined) return;
  state.marks.delete(probeKey);
  state.events.push({
    name,
    durationMs: Math.max(0, performance.now() - startedAt),
    meta,
    recordedAt: Date.now(),
  });
}

export function cancelE2EPerfProbe(name: string, key?: string): void {
  const state = getProbeState();
  if (!state) return;
  state.marks.delete(buildKey(name, key));
}

export function measureE2EPerfProbe<T>(
  name: string,
  fn: () => T,
  meta?: Record<string, unknown>,
): T {
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  const result = fn();
  const state = getProbeState();
  if (state) {
    state.events.push({
      name,
      durationMs: Math.max(0, performance.now() - startedAt),
      meta,
      recordedAt: Date.now(),
    });
  }
  return result;
}

export function clearE2EPerfProbeEvents(): void {
  const state = getProbeState();
  if (!state) return;
  state.events = [];
  state.marks.clear();
}

export function consumeE2EPerfProbeEvents(): E2EPerfProbeEvent[] {
  const state = getProbeState();
  if (!state) return [];
  const events = [...state.events];
  state.events = [];
  return events;
}
