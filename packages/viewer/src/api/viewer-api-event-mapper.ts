import type { ViviActionEvent } from "../actions/action-types";
import type { ViewerControllerEvent } from "../controller/viewer-controller-events";

export interface ViewerApiPublicEvent {
  name: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function mapControllerEventToViewerApiEvents(
  event: ViewerControllerEvent,
): ViewerApiPublicEvent[] {
  if (event.type === "viewer.action.event") {
    return [mapActionEvent(event.event)];
  }
  if (event.type === "viewer.signals.changed") {
    return [
      {
        name: "viewer.signals.changed",
        timestamp: Date.now(),
        data: {
          signalIds: [...event.signalIds].sort(),
          source: event.source ?? "ui",
        },
      },
    ];
  }
  if (event.type === "viewer.prop.event") {
    return [
      {
        name: `viewer.prop.${event.event}`,
        timestamp: Date.now(),
        data: {
          propId: event.propId,
          ...(event.prop
            ? {
                name: event.prop.name,
                visible: event.prop.visible,
                groupId: event.prop.groupId ?? null,
              }
            : {}),
        },
      },
    ];
  }
  if (event.type === "viewer.calibration.changed") {
    return [
      {
        name: "viewer.calibration.changed",
        timestamp: Date.now(),
        data: {
          profileCount: event.snapshot.profiles.length,
          activeProfileId: event.snapshot.activeProfileId,
        },
      },
    ];
  }
  return [];
}

function mapActionEvent(event: ViviActionEvent): ViewerApiPublicEvent {
  const nameByStatus = {
    started: "viewer.action.started",
    completed: "viewer.action.completed",
    failed: "viewer.action.failed",
    skipped: "viewer.action.skipped",
  } as const satisfies Record<ViviActionEvent["status"], string>;
  return {
    name: nameByStatus[event.status],
    timestamp: event.timestamp,
    data: {
      actionId: event.actionId,
      kind: event.kind,
      status: event.status,
      ...(event.status === "failed" || event.status === "skipped"
        ? { errorCode: normalizeErrorCode(event.error) }
        : {}),
    },
  };
}

function normalizeErrorCode(error: string | undefined): string | undefined {
  if (!error) return undefined;
  return error
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "action_failed";
}
