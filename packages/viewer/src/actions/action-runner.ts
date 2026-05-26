import {
  actionPayloadSchemas,
  assertImportedActionSafe,
  getActionRequiredScope,
  type ImportedActionSafetyOptions,
  type ViviAction,
  type ViviActionEvent,
  type ViviActionScope,
  type ViviActionTriggerSource,
  parseViviAction,
} from "./action-types";
import type {
  ViewerBridgeCommandArgs,
  ViewerBridgeCommandId,
  ViewerBridgeId,
} from "../bridges/bridge-registry";
import type { TrackingSignalSource } from "../calibration/calibration-types";

export interface ViewerModelTransformPatch {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}

export interface ViewerPropTransformPatch {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
}

export interface ViviActionCapabilities {
  getParameters(ids: string[]): Record<string, number | undefined>;
  setParameters(values: Record<string, number>): void;
  applyExpressionPreset(id: string): void;
  setModelTransform(transform: ViewerModelTransformPatch): void;
  setPropTransform(id: string, transform: ViewerPropTransformPatch): void;
  setPropVisible(id: string, visible: boolean): void;
  cycleProps(groupId: string, direction: "next" | "previous"): void;
  spawnPropBurst(propIds: string[]): void;
  playEffectPreset(id: string): void;
  setRecording(state: "start" | "stop" | "toggle"): Promise<void>;
  runScript(script: string): Promise<void>;
  runBridgeCommand(
    bridgeId: ViewerBridgeId,
    commandId: ViewerBridgeCommandId,
    args: ViewerBridgeCommandArgs,
  ): Promise<void>;
  applyCalibrationProfile(id: string): void;
  captureCalibrationNeutral(source: TrackingSignalSource): void;
  resetCalibration(profileId?: string): void;
}

export type ViviActionCapabilityProvider = Partial<ViviActionCapabilities>;

export interface RunActionOptions {
  triggerSource?: ViviActionTriggerSource;
  scopes?: readonly ViviActionScope[];
  trustedTriggerSource?: boolean;
  reviewedScriptActionIds?: ImportedActionSafetyOptions["reviewedScriptActionIds"];
  reviewedCalibrationActionIds?: ImportedActionSafetyOptions["reviewedCalibrationActionIds"];
}

function now(): number {
  return Date.now();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function makeEvent(
  action: ViviAction,
  status: ViviActionEvent["status"],
  options: RunActionOptions,
  error?: unknown,
): ViviActionEvent {
  const triggerSource =
    options.trustedTriggerSource === true &&
    isViviActionTriggerSource(options.triggerSource)
      ? options.triggerSource
      : undefined;
  return {
    actionId: action.id,
    kind: action.kind,
    status,
    triggerSource,
    error:
      error === undefined
        ? undefined
        : error instanceof Error && error.name === "ZodError"
          ? "Action payload validation failed"
          : error instanceof Error
            ? error.message
            : "Action execution failed",
    timestamp: now(),
  };
}

function isViviActionTriggerSource(
  value: unknown,
): value is ViviActionTriggerSource {
  return (
    value === "keyboard" ||
    value === "midi" ||
    value === "gamepad" ||
    value === "viewerApi" ||
    value === "script" ||
    value === "ui"
  );
}

export interface ViviActionRunnerOptions {
  scopes?: readonly ViviActionScope[];
  eventLimit?: number;
  onEvent?: (event: ViviActionEvent) => void;
  onParameterWrite?: (values: Record<string, number>) => void;
}

export class ViviActionRunner {
  private capabilities: ViviActionCapabilityProvider;
  private cooldownUntil = new Map<string, number>();
  private running = new Map<string, Promise<void>>();
  private enqueueTails = new Map<string, Promise<unknown>>();
  private replaceTickets = new Map<string, number>();
  private events: ViviActionEvent[] = [];
  private defaultScopes: ReadonlySet<ViviActionScope>;
  private eventLimit: number;
  private onEvent?: (event: ViviActionEvent) => void;
  private onParameterWrite?: (values: Record<string, number>) => void;

  constructor(
    capabilities: ViviActionCapabilityProvider = {},
    options: ViviActionRunnerOptions = {},
  ) {
    this.capabilities = capabilities;
    this.defaultScopes = new Set(options.scopes ?? []);
    this.eventLimit = Math.max(16, options.eventLimit ?? 512);
    this.onEvent = options.onEvent;
    this.onParameterWrite = options.onParameterWrite;
  }

  setCapabilities(capabilities: ViviActionCapabilityProvider): void {
    this.capabilities = capabilities;
  }

  getCapabilities(): ViviActionCapabilityProvider {
    return this.capabilities;
  }

  getEvents(): ViviActionEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }

  private record(event: ViviActionEvent): ViviActionEvent {
    this.events.push(event);
    if (this.events.length > this.eventLimit) {
      this.events.splice(0, this.events.length - this.eventLimit);
    }
    this.onEvent?.(event);
    return event;
  }

  async runAction(
    actionInput: unknown,
    options: RunActionOptions = {},
  ): Promise<ViviActionEvent> {
    let action: ViviAction;
    try {
      action = parseViviAction(actionInput);
      assertImportedActionSafe(action, {
        reviewedScriptActionIds: options.reviewedScriptActionIds,
        reviewedCalibrationActionIds: options.reviewedCalibrationActionIds,
      });
    } catch (error) {
      const fallback: ViviAction = {
        id: "invalid-action",
        name: "Invalid action",
        kind: "scriptCommand",
        enabled: false,
        payload: {},
      };
      return this.record(makeEvent(fallback, "failed", options, error));
    }

    if (!action.enabled) {
      return this.record(makeEvent(action, "skipped", options));
    }

    const scopes = new Set(options.scopes ?? this.defaultScopes);
    const requiredScope: ViviActionScope = getActionRequiredScope(action.kind);
    if (!scopes.has(requiredScope)) {
      return this.record(
        makeEvent(action, "failed", options, new Error("Action scope denied")),
      );
    }

    const queuePolicy = action.queuePolicy ?? "drop";
    const previous = this.running.get(action.id);
    const pendingTail = this.enqueueTails.get(action.id);
    if (previous && queuePolicy === "drop") {
      return this.record(makeEvent(action, "skipped", options));
    }

    if ((previous || pendingTail) && queuePolicy === "enqueue") {
      const previousTail =
        pendingTail ??
        previous!.then(
          () => undefined,
          () => undefined,
        );
      const queued = previousTail.then(() => this.performAction(action, options));
      this.enqueueTails.set(action.id, queued);
      try {
        return await queued;
      } finally {
        if (this.enqueueTails.get(action.id) === queued) {
          this.enqueueTails.delete(action.id);
        }
      }
    }

    if (previous && queuePolicy === "replace") {
      const ticket = (this.replaceTickets.get(action.id) ?? 0) + 1;
      this.replaceTickets.set(action.id, ticket);
      await previous.catch(() => {});
      if (this.replaceTickets.get(action.id) !== ticket) {
        return this.record(makeEvent(action, "skipped", options));
      }
      try {
        return await this.performAction(action, options);
      } finally {
        if (this.replaceTickets.get(action.id) === ticket) {
          this.replaceTickets.delete(action.id);
        }
      }
    }

    return this.performAction(action, options);
  }

  private async performAction(
    action: ViviAction,
    options: RunActionOptions,
  ): Promise<ViviActionEvent> {
    const cooldownUntil = this.cooldownUntil.get(action.id) ?? 0;
    if (cooldownUntil > now()) {
      return this.record(makeEvent(action, "skipped", options));
    }

    this.record(makeEvent(action, "started", options));
    const execution = this.execute(action);
    const running = execution.then(
      () => undefined,
      () => undefined,
    );
    this.running.set(action.id, running);

    try {
      await execution;
      if (action.cooldownMs && action.cooldownMs > 0) {
        this.cooldownUntil.set(action.id, now() + action.cooldownMs);
      }
      return this.record(makeEvent(action, "completed", options));
    } catch (error) {
      return this.record(makeEvent(action, "failed", options, error));
    } finally {
      if (this.running.get(action.id) === running) {
        this.running.delete(action.id);
      }
    }
  }

  private requireCapability<K extends keyof ViviActionCapabilities>(
    key: K,
  ): ViviActionCapabilities[K] {
    const capability = this.capabilities[key];
    if (!capability) {
      throw new Error(`Action capability ${key} is not available`);
    }
    return capability as ViviActionCapabilities[K];
  }

  private async execute(action: ViviAction): Promise<void> {
    switch (action.kind) {
      case "signalSet": {
        const payload = actionPayloadSchemas.signalSet.parse(action.payload);
        this.requireCapability("setParameters")(payload.values);
        this.onParameterWrite?.(payload.values);
        return;
      }
      case "signalPulse": {
        const payload = actionPayloadSchemas.signalPulse.parse(action.payload);
        const restore = payload.restore ?? true;
        const durationMs = payload.durationMs ?? 250;
        const previous = restore
          ? this.requireCapability("getParameters")(Object.keys(payload.values))
          : {};
        this.requireCapability("setParameters")(payload.values);
        this.onParameterWrite?.(payload.values);
        if (restore) {
          await delay(durationMs);
          const restoreValues: Record<string, number> = {};
          for (const id of Object.keys(payload.values)) {
            const value = previous[id];
            if (typeof value === "number" && Number.isFinite(value)) {
              restoreValues[id] = value;
            }
          }
          if (Object.keys(restoreValues).length > 0) {
            this.requireCapability("setParameters")(restoreValues);
            this.onParameterWrite?.(restoreValues);
          }
        }
        return;
      }
      case "expressionPreset": {
        const payload = actionPayloadSchemas.expressionPreset.parse(action.payload);
        this.requireCapability("applyExpressionPreset")(payload.presetId);
        return;
      }
      case "modelTransform": {
        const payload = actionPayloadSchemas.modelTransform.parse(action.payload);
        this.requireCapability("setModelTransform")(payload);
        return;
      }
      case "propTransform": {
        const payload = actionPayloadSchemas.propTransform.parse(action.payload);
        this.requireCapability("setPropTransform")(payload.propId, payload.transform);
        return;
      }
      case "propVisibility": {
        const payload = actionPayloadSchemas.propVisibility.parse(action.payload);
        this.requireCapability("setPropVisible")(payload.propId, payload.visible);
        return;
      }
      case "propCycle": {
        const payload = actionPayloadSchemas.propCycle.parse(action.payload);
        this.requireCapability("cycleProps")(payload.groupId, payload.direction);
        return;
      }
      case "propSpawnBurst": {
        const payload = actionPayloadSchemas.propSpawnBurst.parse(action.payload);
        this.requireCapability("spawnPropBurst")(payload.propIds);
        return;
      }
      case "effectPreset": {
        const payload = actionPayloadSchemas.effectPreset.parse(action.payload);
        this.requireCapability("playEffectPreset")(payload.effectId);
        return;
      }
      case "recordingControl": {
        const payload = actionPayloadSchemas.recordingControl.parse(action.payload);
        await this.requireCapability("setRecording")(payload.state);
        return;
      }
      case "scriptCommand": {
        const payload = actionPayloadSchemas.scriptCommand.parse(action.payload);
        await this.requireCapability("runScript")(payload.script);
        return;
      }
      case "bridgeCommand": {
        const payload = actionPayloadSchemas.bridgeCommand.parse(action.payload);
        await this.requireCapability("runBridgeCommand")(
          payload.bridgeId,
          payload.commandId,
          payload.args,
        );
        return;
      }
      case "calibrationProfileApply": {
        const payload = actionPayloadSchemas.calibrationProfileApply.parse(
          action.payload,
        );
        this.requireCapability("applyCalibrationProfile")(payload.profileId);
        return;
      }
      case "calibrationCaptureNeutral": {
        const payload = actionPayloadSchemas.calibrationCaptureNeutral.parse(
          action.payload,
        );
        this.requireCapability("captureCalibrationNeutral")(payload.source);
        return;
      }
      case "calibrationReset": {
        const payload = actionPayloadSchemas.calibrationReset.parse(action.payload);
        this.requireCapability("resetCalibration")(payload.profileId);
        return;
      }
    }
  }
}
