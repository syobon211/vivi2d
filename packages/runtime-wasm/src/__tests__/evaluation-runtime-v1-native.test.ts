// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createNativeEvaluationRuntime,
  type EvaluationResult,
} from "../internal/evaluation-runtime-v1";
import {
  evaluationProject,
  fixtureHost,
  PNG_HASH,
  pngBytes,
} from "./fixtures/evaluation-project";

function value<T>(result: EvaluationResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

describe("actual EDH + Evaluation native WASM", () => {
  it("retains a real same-seal session for missing retry, activates once, and copies fresh controls", async () => {
    const runtime = value(await createNativeEvaluationRuntime()),
      host = fixtureHost();
    const init = await host.initJson(JSON.stringify(evaluationProject(true)));
    let sessionLive = true;
    try {
      value(runtime.observeRequestState(host.getRequestState()));
      const payload = host.buildRuntimePayload(init.sessionId);
      const missing = value(
        runtime.prepare({
          requestGeneration: payload.requestGeneration,
          payloadUtf8: new TextEncoder().encode(JSON.stringify(payload.payload)),
          textures: payload.texturePlan.textures,
          objects: [],
        }),
      );
      expect(missing.kind).toBe("missing");
      expect(host.getSnapshot(init.sessionId).requestGeneration).toBe(
        payload.requestGeneration,
      );
      const ready = value(
        runtime.retryMissing(missing, [{ objectAddress: PNG_HASH, bytes: pngBytes() }]),
      );
      expect(ready.kind).toBe("ready");
      const prepared = value(runtime.getPreparedSnapshot(ready));
      expect(prepared.textures[0]?.rgba).toEqual(
        new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      );
      expect(
        prepared.commands.some((c) => c.kind === 2 && c.flags === 1 && c.depth === 2),
      ).toBe(true);
      expect(host.getSnapshot(init.sessionId).guards.canRuntime).toBe(true);
      value(runtime.observeRequestState(host.getRequestState()));
      const permit = value(runtime.prepareCommit(ready));
      expect(runtime.commitPrepared(permit)).toBe(0);
      runtime.finishCommit(permit);
      host.dispose(init.sessionId);
      sessionLive = false;
      expect(() => host.getSnapshot(init.sessionId)).toThrowError(
        expect.objectContaining({ code: "VIVI_EDITOR_HOST_SESSION_DISPOSED" }),
      );
      const active = value(runtime.getSnapshot());
      expect(active.generations?.dynamic).toBe(0n);
      expect(active.presets).toEqual(["one"]);
      value(runtime.setInput("p", 0.5));
      expect(value(runtime.getSnapshot()).parameters[0]).toMatchObject({
        current: 0.5,
        evaluated: 0,
      });
      value(runtime.update(0));
      const next = value(runtime.getSnapshot());
      expect(next.parameters[0]).toMatchObject({ current: 0.5, evaluated: 0.5 });
      expect(next.generations?.dynamic).toBe(1n);
      expect(next.textures).toBe(active.textures);
      value(runtime.applyPreset("one"));
      value(runtime.update(0));
      expect(value(runtime.getSnapshot()).parameters[0]).toMatchObject({
        current: 1,
        evaluated: 1,
      });
      runtime.dispose();
      expect(active.textures[0]?.rgba[0]).toBe(255);
    } finally {
      if (sessionLive) host.dispose(init.sessionId);
      runtime.dispose();
    }
  });

  it("consumes superseded prepared work while leaving the active state unchanged", async () => {
    const runtime = value(await createNativeEvaluationRuntime()),
      host = fixtureHost();
    const init = await host.initJson(JSON.stringify(evaluationProject()));
    try {
      value(runtime.observeRequestState(host.getRequestState()));
      const p = host.buildRuntimePayload(init.sessionId);
      const ready = value(
        runtime.prepare({
          requestGeneration: p.requestGeneration,
          payloadUtf8: new TextEncoder().encode(JSON.stringify(p.payload)),
          textures: p.texturePlan.textures,
          objects: [{ objectAddress: PNG_HASH, bytes: pngBytes() }],
        }),
      );
      const newer = await host.initJson(JSON.stringify(evaluationProject()));
      value(runtime.observeRequestState(host.getRequestState()));
      const permit = value(runtime.prepareCommit(ready));
      expect(runtime.commitPrepared(permit)).toBe(-1);
      runtime.finishCommit(permit);
      expect(runtime.getPreparedSnapshot(ready).ok).toBe(false);
      expect(runtime.getSnapshot().ok).toBe(false);
      host.dispose(newer.sessionId);
    } finally {
      host.dispose(init.sessionId);
      runtime.dispose();
    }
  });
});
