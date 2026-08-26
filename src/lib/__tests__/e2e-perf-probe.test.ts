import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeE2EPerfProbeEvents,
  endE2EPerfProbe,
  measureE2EPerfProbe,
  startE2EPerfProbe,
} from "../e2e-perf-probe";

describe("e2e-perf-probe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete window.__vivi2dPerfProbeState__;
  });

  it("does not allocate probe state in a normal production build", () => {
    vi.stubEnv("VITE_EXPOSE_E2E", "false");
    const now = vi.spyOn(performance, "now");

    startE2EPerfProbe("disabled");
    const result = measureE2EPerfProbe("disabled", () => 42);

    expect(result).toBe(42);
    expect(now).not.toHaveBeenCalled();
    expect(window.__vivi2dPerfProbeState__).toBeUndefined();
    expect(consumeE2EPerfProbeEvents()).toEqual([]);
  });

  it("records measurements when the E2E build flag is enabled", () => {
    vi.stubEnv("VITE_EXPOSE_E2E", "true");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(10).mockReturnValueOnce(25);

    startE2EPerfProbe("interaction", "mesh");
    endE2EPerfProbe("interaction", "mesh", { layerId: "mesh" });

    expect(consumeE2EPerfProbeEvents()).toEqual([
      expect.objectContaining({
        name: "interaction",
        durationMs: 15,
        meta: { layerId: "mesh" },
      }),
    ]);
  });

  it("keeps only the newest 512 events", () => {
    vi.stubEnv("VITE_EXPOSE_E2E", "true");

    for (let index = 0; index < 513; index += 1) {
      measureE2EPerfProbe(`event-${index}`, () => undefined);
    }

    const events = consumeE2EPerfProbeEvents();
    expect(events).toHaveLength(512);
    expect(events[0]?.name).toBe("event-1");
    expect(events.at(-1)?.name).toBe("event-512");
  });

  it("keeps only the newest 128 unfinished marks", () => {
    vi.stubEnv("VITE_EXPOSE_E2E", "true");

    for (let index = 0; index < 129; index += 1) {
      startE2EPerfProbe("mark", String(index));
    }

    expect(window.__vivi2dPerfProbeState__?.marks.size).toBe(128);
    expect(window.__vivi2dPerfProbeState__?.marks.has("mark:0")).toBe(false);
    expect(window.__vivi2dPerfProbeState__?.marks.has("mark:128")).toBe(true);
  });
});
