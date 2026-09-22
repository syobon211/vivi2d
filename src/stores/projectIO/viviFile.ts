import { assertPublicViviFileProfile } from "@vivi2d/core/public-profile";
import type { ViviFileData } from "@vivi2d/core/types";
import { decodeViviBinary, encodeViviBinary } from "@vivi2d/core/vivib-format";
import {
  forkEmbeddedRoundTripV11,
  migrateLegacyToEmbeddedRoundTripV11,
} from "@vivi2d/model/internal/project-format-v11";
import { t as tGlobal } from "@/lib/i18n";
import { inferProjectSourceKind } from "@/lib/project-source-kind";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
import { requireProjectV11Display } from "@/lib/project-v11-renderer";
import { projectV11Sha256, V11EditorCarrier } from "@/lib/project-v11-serializer";
import { clearTextures, getAllTextures, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { useNotificationStore } from "../notificationStore";
import {
  adoptLegacyProjectFromV11,
  adoptProjectV11,
  markProjectV11Saved,
} from "../project-v11-transaction";
import { initParameterValues, resetRelatedStores } from "./reset";
import { verifyV11PngForMigration } from "./v11Images";

let activeSave: object | null = null;
let openRequest = 0;
function copySources(
  before: ReturnType<typeof useEditorStore.getState>,
): string[] | undefined {
  const paths = [
    ...new Set(
      [before.projectV11?.originalFilePath, before.currentFilePath].filter(
        (value): value is string => typeof value === "string",
      ),
    ),
  ];
  return paths.length ? paths : undefined;
}
function notifyFailure(kind: "load" | "save"): void {
  try {
    useNotificationStore
      .getState()
      .addNotification(
        "error",
        tGlobal(
          kind === "load" ? "notify.projectLoadFailed" : "notify.projectSaveFailed",
        ),
      );
  } catch {
    /* Notifications cannot change the operation's outcome. */
  }
}

export async function loadProject(): Promise<boolean> {
  if (isProjectV11Publishing()) return false;
  const request = ++openRequest;
  const before = useEditorStore.getState();
  const fresh = () =>
    request === openRequest &&
    useEditorStore.getState().projectVersion === before.projectVersion &&
    useEditorStore.getState().projectV11?.carrier === before.projectV11?.carrier;
  try {
    const result = await window.electronAPI.openViviFile();
    if (!result || !fresh()) return false;
    if (
      !("binary" in result) &&
      (JSON.parse(result.data) as { version?: unknown })?.version === 11
    ) {
      if (!(result.utf8Bytes instanceof ArrayBuffer))
        throw new Error("PROJECT_CARRIER_INVALID");
      const loaded = await V11EditorCarrier.open(new Uint8Array(result.utf8Bytes));
      if (!fresh()) return false;
      requireProjectV11Display();
      adoptProjectV11(
        loaded.project,
        {
          carrier: loaded.carrier,
          revision: loaded.revision,
          display: loaded.display,
          saved: {
            project: loaded.project,
            revision: loaded.revision,
            canonical: loaded.canonical,
          },
        },
        result.filePath,
      );
      return true;
    }
    const { parseViviFile, prepareDeserializedProject } = await import(
      "@/lib/project-serializer"
    );
    const fileData: ViviFileData =
      "binary" in result ? decodeViviBinary(result.binary) : parseViviFile(result.data);
    assertPublicViviFileProfile(fileData);
    const prepared = await prepareDeserializedProject(fileData);
    if (!fresh()) return false;
    const kind = inferProjectSourceKind(prepared.project);
    // Derived UI classification belongs to EditorState. Preserve the authored
    // field's absence/value instead of injecting provenance into the document.
    if (before.projectV11) {
      adoptLegacyProjectFromV11(
        prepared.project,
        prepared.textures,
        result.filePath,
        kind,
      );
    } else {
      const project = prepared.project;
      clearTextures();
      for (const [id, canvas] of prepared.textures) setTexture(id, canvas);
      useEditorStore.setState((state) => {
        state.project = project;
        state.projectV11 = null;
        state.projectVersion += 1;
        state.currentFilePath = result.filePath;
        state.projectSourceKind = kind;
      });
      resetRelatedStores();
      initParameterValues();
    }
    return true;
  } catch {
    notifyFailure("load");
    return false;
  }
}

/** Starts before validation's first await, shared by all save routes; opening or
 * closing another Project deliberately does not unlock an outstanding write. */
async function withSaveSlot(action: () => Promise<boolean>): Promise<boolean> {
  if (activeSave || isProjectV11Publishing()) {
    try {
      useNotificationStore
        .getState()
        .addNotification("warning", tGlobal("notify.projectSaveBusy"));
    } catch {
      /* No core mutation. */
    }
    return false;
  }
  const owner = {};
  activeSave = owner;
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_WRITTEN_METADATA_FAILED") {
      try {
        useNotificationStore
          .getState()
          .addNotification("warning", tGlobal("notify.projectWrittenMetadataFailed"));
      } catch {
        /* The file was written; UI is not the outcome. */
      }
      return true;
    }
    notifyFailure("save");
    return false;
  } finally {
    if (activeSave === owner) activeSave = null;
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  return withSaveSlot(async () => {
    const before = useEditorStore.getState(),
      { project, currentFilePath, projectV11 } = before;
    if (!project) return false;
    const targetPath = saveAs ? undefined : (currentFilePath ?? undefined);
    if (projectV11) {
      projectV11.display.assertUnchanged(getAllTextures());
      const canonical = await projectV11.carrier.serialize(project, projectV11.revision);
      const result = await window.electronAPI.saveFile({
        format: "project-v11-json",
        data: canonical,
        defaultName: `${project.name}.vivi`,
        filePath: targetPath,
      });
      if (!result) return false;
      markProjectV11Saved(projectV11, project, canonical, result.filePath);
      return true;
    }
    const textures = new Map(getAllTextures());
    const { serializeProject } = await import("@/lib/project-serializer");
    const fileData = serializeProject(project, textures);
    const result = await window.electronAPI.saveFile({
      data: JSON.stringify(fileData),
      binary: encodeViviBinary(fileData).buffer as ArrayBuffer,
      defaultName: `${project.name}${targetPath?.endsWith(".vivb") ? ".vivb" : ".vivi"}`,
      filePath: targetPath,
    });
    if (!result) return false;
    if (
      useEditorStore.getState().projectVersion === before.projectVersion &&
      !useEditorStore.getState().projectV11
    )
      useEditorStore.setState({ currentFilePath: result.filePath });
    return true;
  });
}

/** Explicit opt-in only. Never overwrites the legacy target or auto-migrates open. */
export async function saveProjectV11Copy(): Promise<boolean> {
  return withSaveSlot(async () => {
    const before = useEditorStore.getState();
    if (!before.project || before.projectV11) return false;
    requireProjectV11Display();
    const preserveSourcePaths = copySources(before);
    const { serializeProject } = await import("@/lib/project-serializer");
    const legacy = serializeProject(before.project, new Map(getAllTextures()));
    const migrated = await migrateLegacyToEmbeddedRoundTripV11(
      new TextEncoder().encode(JSON.stringify(legacy)),
      crypto.randomUUID(),
      { sha256: projectV11Sha256, verifyPng: verifyV11PngForMigration },
    );
    if (!migrated.ok) throw new Error(migrated.code);
    const loaded = await V11EditorCarrier.open(migrated.canonicalUtf8);
    const result = await window.electronAPI.saveFile({
      format: "project-v11-json",
      data: loaded.canonical,
      defaultName: `${before.project.name}-v11.vivi`,
      preserveSourcePaths,
    });
    if (!result) return false;
    // Newer edits stay active; the successfully written older copy still exists.
    if (
      useEditorStore.getState().project === before.project &&
      useEditorStore.getState().projectV11 === before.projectV11
    ) {
      try {
        requireProjectV11Display();
        adoptProjectV11(
          loaded.project,
          {
            carrier: loaded.carrier,
            revision: loaded.revision,
            display: loaded.display,
            saved: {
              project: loaded.project,
              revision: loaded.revision,
              canonical: loaded.canonical,
            },
          },
          result.filePath,
        );
      } catch {
        throw new Error("PROJECT_WRITTEN_METADATA_FAILED");
      }
    }
    return true;
  });
}

export async function forkProjectV11(): Promise<boolean> {
  return withSaveSlot(async () => {
    const before = useEditorStore.getState(),
      session = before.projectV11;
    if (!before.project || !session) return false;
    requireProjectV11Display();
    const preserveSourcePaths = copySources(before);
    session.display.assertUnchanged(getAllTextures());
    const source = await session.carrier.serialize(before.project, session.revision);
    const forked = await forkEmbeddedRoundTripV11(
      new TextEncoder().encode(source),
      crypto.randomUUID(),
      { sha256: projectV11Sha256, verifyPng: verifyV11PngForMigration },
    );
    if (!forked.ok) throw new Error(forked.code);
    const loaded = await V11EditorCarrier.open(forked.canonicalUtf8);
    const result = await window.electronAPI.saveFile({
      format: "project-v11-json",
      data: loaded.canonical,
      defaultName: `${before.project.name}-fork.vivi`,
      preserveSourcePaths,
    });
    if (!result) return false;
    if (
      useEditorStore.getState().project === before.project &&
      useEditorStore.getState().projectV11 === session
    ) {
      try {
        requireProjectV11Display();
        adoptProjectV11(
          loaded.project,
          {
            carrier: loaded.carrier,
            revision: loaded.revision,
            display: loaded.display,
            saved: {
              project: loaded.project,
              revision: loaded.revision,
              canonical: loaded.canonical,
            },
          },
          result.filePath,
        );
      } catch {
        throw new Error("PROJECT_WRITTEN_METADATA_FAILED");
      }
    }
    return true;
  });
}

export async function duplicateOriginalProjectV11(): Promise<boolean> {
  return withSaveSlot(async () => {
    const before = useEditorStore.getState(),
      { project, projectV11 } = before;
    if (!project || !projectV11) return false;
    return !!(await window.electronAPI.saveFile({
      format: "project-v11-json",
      data: projectV11.carrier.duplicateOriginal(),
      defaultName: `${project.name}-original.vivi`,
      preserveSourcePaths: copySources(before),
    }));
  });
}
