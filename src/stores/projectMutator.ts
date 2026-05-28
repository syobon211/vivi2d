import { findLayerById } from "@vivi2d/core/layer-utils";
import type { AnimationClip, LayerNode, ProjectData, Scene } from "@vivi2d/core/types";
import {
  createProjectMutation,
  type Patch,
} from "@vivi2d/editor-core/project-transaction";
import { useEditorStore } from "./editorStore";
import { _resetMergeTimer, useHistoryStore } from "./historyStore";

let _transactionDepth = 0;

function pushSnapshotIfTopLevel(mergeKey?: string): void {
  if (_transactionDepth > 0) return;
  const prev = useEditorStore.getState().project;
  if (prev) {
    useHistoryStore.getState().pushState(prev, mergeKey);
  }
}

function pushPatchesIfTopLevel(
  patches: Patch[],
  inversePatches: Patch[],
  mergeKey?: string,
): void {
  if (_transactionDepth > 0) return;
  useHistoryStore.getState().pushPatches(patches, inversePatches, mergeKey);
}

export function runInHistoryTransaction<T>(fn: () => T): T {
  const isTopLevel = _transactionDepth === 0;
  const editorState = useEditorStore.getState();
  const editorBefore = isTopLevel
    ? {
        project: editorState.project,
        projectVersion: editorState.projectVersion,
        projectStructureVersion: editorState.projectStructureVersion,
      }
    : null;
  const historyState = useHistoryStore.getState();
  const historyBefore = isTopLevel
    ? {
        undoStack: [...historyState.undoStack],
        redoStack: [...historyState.redoStack],
      }
    : null;
  pushSnapshotIfTopLevel();
  _transactionDepth++;
  try {
    return fn();
  } catch (error) {
    if (isTopLevel && editorBefore && historyBefore) {
      useEditorStore.setState({
        project: editorBefore.project,
        projectVersion: editorBefore.projectVersion,
        projectStructureVersion: editorBefore.projectStructureVersion,
      });
      useHistoryStore.setState({
        undoStack: historyBefore.undoStack,
        redoStack: historyBefore.redoStack,
      });
      _resetMergeTimer();
    }
    throw error;
  } finally {
    _transactionDepth--;
  }
}

export function mutateProject(
  fn: (project: ProjectData) => void,
  mergeKey?: string,
): void {
  const prev = useEditorStore.getState().project;
  if (!prev) return;

  const { next, patches, inversePatches, changed } = createProjectMutation(prev, fn);
  if (!changed) return;
  pushPatchesIfTopLevel(patches, inversePatches, mergeKey);
  useEditorStore.setState({ project: next });
}

export function replaceProject(
  next: ProjectData,
  bumpVersion = true,
  mergeKey?: string,
): void {
  pushSnapshotIfTopLevel(mergeKey);
  useEditorStore.setState((state) => {
    state.project = next;
    if (bumpVersion) state.projectStructureVersion += 1;
  });
}

export function bumpProjectStructureVersion(): void {
  useEditorStore.setState((state) => {
    state.projectStructureVersion += 1;
  });
}

export function mutateNode(
  id: string,
  fn: (node: LayerNode) => void,
  mergeKey?: string,
): void {
  mutateProject((project) => {
    const node = findLayerById(project.layers, id);
    if (node) fn(node);
  }, mergeKey);
}

export function mutateClip(
  clipId: string,
  fn: (clip: AnimationClip) => void,
  mergeKey?: string,
): void {
  mutateProject((project) => {
    for (const scene of project.scenes) {
      const clip = scene.clips.find((c) => c.id === clipId);
      if (clip) {
        fn(clip);
        return;
      }
    }
    const clip = project.clips.find((c) => c.id === clipId);
    if (clip) fn(clip);
  }, mergeKey);
}

export function mutateScene(sceneId: string, fn: (scene: Scene) => void): void {
  mutateProject((project) => {
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (scene) fn(scene);
  });
}
