import { ViviActionRunner } from "../actions/action-runner";
import {
  propTransformPayloadSchema,
  propVisibilityPayloadSchema,
  propCyclePayloadSchema,
  propSpawnBurstPayloadSchema,
  calibrationCaptureNeutralPayloadSchema,
  calibrationProfileApplyPayloadSchema,
  calibrationResetPayloadSchema,
} from "../actions/action-types";
import { ViviTrackingCalibrationStore } from "../calibration/calibration-store";
import type {
  ProcessTrackingSignalOptions,
} from "../calibration/calibration-engine";
import {
  viewerCalibrationConfigSchema,
  type TrackingSignalFrame,
  type ViewerCalibrationConfig,
} from "../calibration/calibration-types";
import { ViviPropStore } from "../props/prop-store";
import type {
  ViewerControllerEvent,
  ViewerControllerListener,
  ViewerControllerSnapshot,
} from "./viewer-controller-events";
import type {
  ViewerCommandResult,
  ViewerControllerCommand,
  ViewerControllerPorts,
  ViewerControllerTrustedActionRunOptions,
} from "./viewer-controller-ports";

export class ViviViewerController {
  private readonly actionRunner: ViviActionRunner;
  private readonly propStore: ViviPropStore;
  private readonly calibrationStore: ViviTrackingCalibrationStore;
  private listeners = new Set<ViewerControllerListener>();

  constructor(ports: ViewerControllerPorts = {}) {
    this.actionRunner = new ViviActionRunner(ports.actionCapabilities ?? {}, {
      onEvent: (event) => {
        this.emit({ type: "viewer.action.event", event });
      },
      onParameterWrite: (values) => {
        this.emit({
          type: "viewer.signals.changed",
          source: "ui",
          signalIds: Object.keys(values),
        });
      },
    });
    this.propStore = new ViviPropStore();
    this.calibrationStore = new ViviTrackingCalibrationStore();
  }

  async runAction(
    action: unknown,
    options: ViewerControllerTrustedActionRunOptions,
  ): Promise<ViewerCommandResult> {
    if (!options.scopes?.length) {
      return { accepted: false, reason: "action scope denied" };
    }
    const event = await this.actionRunner.runAction(action, {
      triggerSource: options.triggerSource,
      scopes: options.scopes,
      trustedTriggerSource: options.trustedTriggerSource === true,
    });
    this.emitSnapshot();
    return {
      accepted: event.status !== "failed" && event.status !== "skipped",
      reason: event.error,
    };
  }

  snapshot(): ViewerControllerSnapshot {
    return {
      props: this.propStore.list(),
      calibration: this.calibrationStore.snapshot(),
      actionEvents: this.actionRunner.getEvents(),
    };
  }

  processTrackingFrame(
    frame: TrackingSignalFrame,
    options: ProcessTrackingSignalOptions = {},
  ): TrackingSignalFrame {
    return this.calibrationStore.processFrame(frame, options);
  }

  exportCalibrationConfig(): ViewerCalibrationConfig {
    return this.calibrationStore.exportConfig();
  }

  subscribe(listener: ViewerControllerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setActionCapabilities(ports: ViewerControllerPorts["actionCapabilities"]): void {
    this.actionRunner.setCapabilities(ports ?? {});
  }

  async dispatch(command: ViewerControllerCommand): Promise<ViewerCommandResult> {
    switch (command.type) {
      case "action.run": {
        return this.runAction(command.action, {
          triggerSource: command.options?.triggerSource,
          scopes: command.options?.scopes ?? [],
          trustedTriggerSource: false,
        });
      }
      case "props.add": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        try {
          const inputId = getInputId(command.prop);
          if (!inputId) {
            return { accepted: false, reason: "prop id required" };
          }
          if (this.propStore.get(inputId)) {
            return { accepted: false, reason: "prop already exists" };
          }
          const prop = this.propStore.add(command.prop);
          this.emitPropEvent("added", prop);
          this.emitSnapshot();
          return { accepted: true };
        } catch {
          return { accepted: false, reason: "invalid prop" };
        }
      }
      case "props.update": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        try {
          const inputId = getInputId(command.prop);
          if (!inputId || !this.propStore.get(inputId)) {
            return { accepted: false, reason: "prop not found" };
          }
          const prop = this.propStore.update(command.prop);
          this.emitPropEvent("updated", prop);
          this.emitSnapshot();
          return { accepted: true };
        } catch {
          return { accepted: false, reason: "invalid prop" };
        }
      }
      case "props.remove": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        if (!isSafeId(command.propId)) {
          return { accepted: false, reason: "invalid prop id" };
        }
        const removed = this.propStore.remove(command.propId);
        if (removed) this.emitPropEvent("removed", command.propId);
        this.emitSnapshot();
        return removed
          ? { accepted: true }
          : { accepted: false, reason: "prop not found" };
      }
      case "props.patchTransform": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        const parsed = propTransformPayloadSchema.safeParse({
          propId: command.propId,
          transform: command.transform,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid prop transform" };
        }
        const updated = this.propStore.patchTransform(parsed.data.propId, parsed.data.transform);
        if (updated) this.emitPropEvent("updated", updated);
        this.emitSnapshot();
        return updated
          ? { accepted: true }
          : { accepted: false, reason: "prop not found" };
      }
      case "props.cycleGroup": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        const parsed = propCyclePayloadSchema.safeParse({
          groupId: command.groupId,
          direction: command.direction,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid prop group" };
        }
        const updated = this.propStore.cycleGroup(parsed.data.groupId, parsed.data.direction);
        for (const prop of updated.filter((prop) => prop.groupId === parsed.data.groupId)) {
          this.emitPropEvent("updated", prop);
        }
        this.emitSnapshot();
        return { accepted: true };
      }
      case "props.spawnBurst": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        const parsed = propSpawnBurstPayloadSchema.safeParse({
          propIds: command.propIds,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid prop burst" };
        }
        try {
          const updated = this.propStore.spawnBurst(parsed.data.propIds);
          const touched = new Set(parsed.data.propIds);
          for (const prop of updated.filter((prop) => touched.has(prop.id))) {
            this.emitPropEvent("updated", prop);
          }
          this.emitSnapshot();
          return { accepted: true };
        } catch {
          return { accepted: false, reason: "invalid prop burst" };
        }
      }
      case "props.setVisible": {
        if (!hasScope(command.scopes, "write:props")) {
          return { accepted: false, reason: "prop scope denied" };
        }
        const parsed = propVisibilityPayloadSchema.safeParse({
          propId: command.propId,
          visible: command.visible,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid prop visibility" };
        }
        const updated = this.propStore.setVisible(parsed.data.propId, parsed.data.visible);
        if (updated) this.emitPropEvent("updated", updated);
        this.emitSnapshot();
        return updated
          ? { accepted: true }
          : { accepted: false, reason: "prop not found" };
      }
      case "calibration.applyProfile": {
        if (!hasScope(command.scopes, "write:calibration")) {
          return { accepted: false, reason: "calibration scope denied" };
        }
        const parsed = calibrationProfileApplyPayloadSchema.safeParse({
          profileId: command.profileId,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid calibration profile" };
        }
        const accepted = this.calibrationStore.applyProfile(parsed.data.profileId);
        if (accepted) this.emitCalibrationChanged();
        this.emitSnapshot();
        return accepted
          ? { accepted: true }
          : { accepted: false, reason: "calibration profile not found" };
      }
      case "calibration.captureNeutral": {
        if (!hasScope(command.scopes, "write:calibration")) {
          return { accepted: false, reason: "calibration scope denied" };
        }
        const parsed = calibrationCaptureNeutralPayloadSchema.safeParse({
          source: command.source,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid calibration source" };
        }
        const accepted = this.calibrationStore.captureNeutral(parsed.data.source);
        if (accepted) this.emitCalibrationChanged();
        this.emitSnapshot();
        return accepted
          ? { accepted: true }
          : { accepted: false, reason: "no calibration frame recorded" };
      }
      case "calibration.suggestRanges": {
        if (!hasScope(command.scopes, "write:calibration")) {
          return { accepted: false, reason: "calibration scope denied" };
        }
        const parsed = calibrationCaptureNeutralPayloadSchema.safeParse({
          source: command.source,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid calibration source" };
        }
        const accepted = this.calibrationStore.suggestRanges(parsed.data.source);
        if (accepted) this.emitCalibrationChanged();
        this.emitSnapshot();
        return accepted
          ? { accepted: true }
          : { accepted: false, reason: "no observed calibration range" };
      }
      case "calibration.reset": {
        if (!hasScope(command.scopes, "write:calibration")) {
          return { accepted: false, reason: "calibration scope denied" };
        }
        const parsed = calibrationResetPayloadSchema.safeParse({
          profileId: command.profileId,
        });
        if (!parsed.success) {
          return { accepted: false, reason: "invalid calibration reset" };
        }
        this.calibrationStore.reset(parsed.data.profileId);
        this.emitCalibrationChanged();
        this.emitSnapshot();
        return { accepted: true };
      }
      case "calibration.importConfig": {
        if (!hasScope(command.scopes, "write:calibration")) {
          return { accepted: false, reason: "calibration scope denied" };
        }
        const parsed = viewerCalibrationConfigSchema.safeParse(command.config);
        if (!parsed.success) {
          return { accepted: false, reason: "invalid calibration config" };
        }
        this.calibrationStore.importConfig(parsed.data);
        this.emitCalibrationChanged();
        this.emitSnapshot();
        return { accepted: true };
      }
      case "signals.set": {
        if (!hasScope(command.scopes, "write:signals")) {
          return { accepted: false, reason: "signal scope denied" };
        }
        const setParameters = this.actionRunner.getCapabilities().setParameters;
        if (!setParameters) {
          return { accepted: false, reason: "signal writer not available" };
        }
        if (Object.keys(command.values).length > 128) {
          return { accepted: false, reason: "too many signal values" };
        }
        const values = sanitizeParameterValues(command.values);
        if (Object.keys(values).length === 0) {
          return { accepted: false, reason: "no finite signal values" };
        }
        setParameters(values);
        this.emit({
          type: "viewer.signals.changed",
          source: command.source,
          signalIds: Object.keys(values),
        });
        return { accepted: true };
      }
    }
  }

  private emitSnapshot(): void {
    this.emit({ type: "viewer.snapshot.changed", snapshot: this.snapshot() });
  }

  private emitPropEvent(
    event: "added" | "updated" | "removed",
    propOrId: { id: string } | string,
  ): void {
    const propId = typeof propOrId === "string" ? propOrId : propOrId.id;
    this.emit({
      type: "viewer.prop.event",
      event,
      propId,
      prop: typeof propOrId === "string" ? undefined : this.propStore.get(propId) ?? undefined,
    });
  }

  private emitCalibrationChanged(): void {
    this.emit({
      type: "viewer.calibration.changed",
      snapshot: this.calibrationStore.snapshot(),
    });
  }

  private emit(event: ViewerControllerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn("[viewer-controller] listener failed", error);
      }
    }
  }
}

function hasScope(
  scopes: readonly string[],
  requiredScope: string,
): boolean {
  return scopes.includes(requiredScope);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function getInputId(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const id = (input as { id?: unknown }).id;
  return isSafeId(id) ? id : null;
}

function sanitizeParameterValues(
  values: Record<string, number>,
): Record<string, number> {
  const sanitized: Record<string, number> = {};
  const entries = Object.entries(values);
  for (const [key, value] of entries) {
    if (key.length > 0 && key.length <= 256 && Number.isFinite(value)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
