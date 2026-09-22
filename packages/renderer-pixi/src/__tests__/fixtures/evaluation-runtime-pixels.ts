import {
  createNativeEvaluationRuntime,
  type EvaluationResult,
} from "@vivi2d/runtime-wasm/internal/evaluation-runtime-v1";
import { RenderTexture, type WebGLRenderer } from "pixi.js";
import {
  evaluationProject,
  fixtureHost,
  PNG_HASH,
  pngBytes,
} from "../../../../runtime-wasm/src/__tests__/fixtures/evaluation-project";
import { ViviPixiRenderer } from "../../renderer";

function require(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function value<T>(result: EvaluationResult<T>): T {
  require(result.ok, "Actual Evaluation WASM operation failed");
  return result.value;
}

/** Real EDH -> Missing/retry -> C10/C11 WASM -> same-device Pixi; no mock renderer. */
export async function runEvaluationRuntimePixels() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  document.body.appendChild(canvas);
  const renderer = await ViviPixiRenderer.create(canvas, {
    transparent: true,
    backgroundColor: 0x000000,
    antialias: false,
  });
  const runtime = value(await createNativeEvaluationRuntime());
  const host = fixtureHost();
  const initialized = await host.initJson(JSON.stringify(evaluationProject(true)));
  let sessionLive = true;
  try {
    require(Object.isFrozen(host), "Actual frozen EDH required");
    value(runtime.observeRequestState(host.getRequestState()));
    const payload = host.buildRuntimePayload(initialized.sessionId);
    let child = value(
      runtime.prepare({
        requestGeneration: payload.requestGeneration,
        payloadUtf8: new TextEncoder().encode(JSON.stringify(payload.payload)),
        textures: payload.texturePlan.textures,
        objects: [],
      }),
    );
    require(child.kind === "missing", "Physical-object absence must be postseal Missing");
    require(host.getSnapshot(initialized.sessionId).requestGeneration ===
      payload.requestGeneration, "Same session retained for explicit same-seal retry");
    child = value(
      runtime.retryMissing(child, [{ objectAddress: PNG_HASH, bytes: pngBytes() }]),
    );
    require(child.kind === "ready", "Same-seal retry must become Ready");
    const snapshot = value(runtime.getPreparedSnapshot(child));
    require(snapshot.commands.some(
      (command) => command.kind === 2 && command.flags === 1 && command.depth === 2,
    ), "Actual C11 nested inverted command required");
    const pending = renderer.prepareEvaluationModel(snapshot);
    const fresh = host.getSnapshot(initialized.sessionId);
    require(fresh.guards.canRuntime &&
      fresh.requestGeneration === child.requestGeneration, "Final actual session check");
    value(runtime.observeRequestState(host.getRequestState()));
    renderer.validatePreparedEvaluation(pending);
    const permit = value(runtime.prepareCommit(child));
    let publishing = false,
      publicationEvents = 0;
    const onChildEvent = () => {
      if (publishing) publicationEvents++;
    };
    renderer.pixiApp.stage.on("childAdded", onChildEvent);
    renderer.pixiApp.stage.on("childRemoved", onChildEvent);
    pending.world.on("added", onChildEvent);
    publishing = true;
    const status = runtime.commitPrepared(permit);
    const retired = status === 0 ? renderer.commitPreparedEvaluation(pending) : null;
    publishing = false;
    require(publicationEvents ===
      0, "No child event/user callback during CPU/GPU selection");
    runtime.finishCommit(permit);
    require(status === 0, "Native activation failed");
    renderer.finalizeEvaluation(pending, retired);
    host.dispose(initialized.sessionId);
    sessionLive = false;
    let disposed = false;
    try {
      host.getSnapshot(initialized.sessionId);
    } catch (error) {
      disposed =
        (error as { code?: string }).code === "VIVI_EDITOR_HOST_SESSION_DISPOSED";
    }
    require(disposed, "Activated same-seal session must be disposed");
    renderer.render();
    const glRenderer = renderer.pixiApp.renderer as WebGLRenderer;
    require(glRenderer.gl &&
      !glRenderer.gl.isContextLost(), "Real healthy WebGL required");
    let gl = glRenderer.gl;
    const pixel = (x: number, y: number) => {
      const out = new Uint8Array(4);
      const scale = gl.drawingBufferWidth / 64;
      gl.readPixels(
        Math.floor(x * scale),
        Math.floor((64 - y) * scale),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        out,
      );
      return Array.from(out);
    };
    const overlap = pixel(32, 32),
      retainedParent = pixel(16, 32),
      outside = pixel(4, 32);
    require(overlap.every(
      (channel) => channel <= 3,
    ), "Parent/child intersection must be premultiplied transparent");
    require(retainedParent[0]! >= 252 &&
      retainedParent[1]! <= 3 &&
      retainedParent[3]! >= 252, "Parent outside inverted child must retain red target");
    require(outside.every(
      (channel) => channel <= 3,
    ), "Outside parent domain must be premultiplied transparent");
    require(gl.getError() === gl.NO_ERROR, "No hidden WebGL error");
    const active = value(runtime.getSnapshot());
    require(active.generations?.dynamic ===
      0n, "Initial C10 evaluation must not add update(0)");
    value(runtime.setInput("p", 0.5));
    value(runtime.update(0));
    const updated = value(runtime.getSnapshot());
    require(updated.parameters[0]?.current === 0.5 &&
      updated.parameters[0]?.evaluated ===
        0.5, "Actual current/evaluated copy-out after explicit update");
    require(updated.textures ===
      active.textures, "Stable model/topology reuses copied texture bytes");
    require(updated.meshes[0]?.uvs === active.meshes[0]?.uvs &&
      updated.meshes[0]?.indices ===
        active.meshes[0]?.indices, "Static owned topology arrays are cached");

    const replacementSession = await host.initJson(
      JSON.stringify(evaluationProject(true)),
    );
    const replacementPayload = host.buildRuntimePayload(replacementSession.sessionId);
    value(runtime.observeRequestState(host.getRequestState()));
    const replacement = value(
      runtime.prepare({
        requestGeneration: replacementPayload.requestGeneration,
        payloadUtf8: new TextEncoder().encode(JSON.stringify(replacementPayload.payload)),
        textures: replacementPayload.texturePlan.textures,
        objects: [{ objectAddress: PNG_HASH, bytes: pngBytes() }],
      }),
    );
    const replacementSnapshot = value(runtime.getPreparedSnapshot(replacement));
    try {
      const createTexture = RenderTexture.create;
      let lastPrepareFailure = false;
      RenderTexture.create = (...args: Parameters<typeof RenderTexture.create>) => {
        if (args[0]?.width === 64 && args[0]?.height === 64)
          throw new Error("TEST_LAST_PREPARE_ALLOCATION");
        return createTexture(...args);
      };
      try {
        renderer.prepareEvaluationModel(replacementSnapshot);
      } catch {
        lastPrepareFailure = true;
      } finally {
        RenderTexture.create = createTexture;
      }
      require(lastPrepareFailure, "Last actual GPU preparation allocation must reject");
      renderer.render();
      require(pixel(16, 32)[0]! >= 252 &&
        pixel(32, 32).every(
          (channel) => channel <= 3,
        ), "Healthy incumbent GPU survives failed preparation");
      require(value(runtime.getSnapshot()).generations?.model ===
        updated.generations
          ?.model, "Failed GPU preparation cannot activate CPU replacement");

      const oldApp = renderer.pixiApp;
      const oldDevice = oldApp.renderer as WebGLRenderer;
      const originalRender = oldDevice.render.bind(oldDevice);
      let oldDraws = 0,
        abortRejected = false;
      oldDevice.render = () => {
        oldDraws++;
        throw new Error("TEST_ENTERED_RENDER_ABORT");
      };
      try {
        renderer.prepareEvaluationModel(replacementSnapshot);
      } catch {
        abortRejected = true;
      }
      oldDevice.render = ((...args: Parameters<typeof oldDevice.render>) => {
        oldDraws++;
        return originalRender(...args);
      }) as typeof oldDevice.render;
      const stoppedAt = oldDraws;
      renderer.render();
      require(abortRejected &&
        oldDraws === stoppedAt, "Interrupted old renderer must issue no further draw");
      await renderer.recoverEvaluation();
      require(renderer.pixiApp !== oldApp &&
        oldDraws ===
          stoppedAt, "Recovery must recreate the single Application slot without old-instance draws");
      gl = (renderer.pixiApp.renderer as WebGLRenderer).gl;
      renderer.render();
      require(pixel(16, 32)[0]! >= 252 &&
        pixel(32, 32).every((channel) => channel <= 3) &&
        pixel(4, 32).every(
          (channel) => channel <= 3,
        ), "Actual recreated GPU rebuilds the retained incumbent");
      require(value(runtime.getSnapshot()).generations?.model ===
        updated.generations?.model, "GPU lifecycle recovery must not replace CPU state");
    } finally {
      replacement.dispose();
      host.dispose(replacementSession.sessionId);
    }
    return {
      realWebGL: true,
      nestedInvertPixels: { overlap, retainedParent, outside },
      sameSealRetry: true,
      sessionDisposed: true,
      initialDynamic: "0",
      explicitUpdate: true,
      publicationEvents,
      lastPrepareFailurePreservedIncumbent: true,
      enteredRenderAbortStopped: true,
      actualApplicationRecovery: true,
    };
  } finally {
    if (sessionLive) host.dispose(initialized.sessionId);
    runtime.dispose();
    renderer.destroy();
    canvas.remove();
  }
}
