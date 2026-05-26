import type { OffscreenTarget } from "@vivi2d/core/types";

export function detectCyclicDependency(
  targets: OffscreenTarget[],
  consumerMap: Map<string, string>,
): string[] | null {
  const targetSources = new Map<string, Set<string>>();
  for (const target of targets) {
    targetSources.set(target.id, new Set(target.sourceLayerIds));
  }

  const layerToTarget = new Map<string, string>();
  for (const [targetId, layerId] of consumerMap) {
    layerToTarget.set(layerId, targetId);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(targetId: string, path: string[]): string[] | null {
    if (inStack.has(targetId)) {
      return [...path, targetId];
    }
    if (visited.has(targetId)) return null;

    visited.add(targetId);
    inStack.add(targetId);
    path.push(targetId);

    const sources = targetSources.get(targetId);
    if (sources) {
      for (const srcLayerId of sources) {
        const dependsOnTarget = layerToTarget.get(srcLayerId);
        if (dependsOnTarget) {
          const cycle = dfs(dependsOnTarget, path);
          if (cycle) return cycle;
        }
      }
    }

    path.pop();
    inStack.delete(targetId);
    return null;
  }

  for (const target of targets) {
    const cycle = dfs(target.id, []);
    if (cycle) return cycle;
  }

  return null;
}

export function topologicalSortTargets(
  targets: OffscreenTarget[],
  consumerMap: Map<string, string>,
): string[] {
  const deps = new Map<string, Set<string>>();
  const layerToTarget = new Map<string, string>();

  for (const [targetId, layerId] of consumerMap) {
    layerToTarget.set(layerId, targetId);
  }

  for (const target of targets) {
    const targetDeps = new Set<string>();
    for (const srcLayerId of target.sourceLayerIds) {
      const dep = layerToTarget.get(srcLayerId);
      if (dep && dep !== target.id) {
        targetDeps.add(dep);
      }
    }
    deps.set(target.id, targetDeps);
  }

  const inDegree = new Map<string, number>();
  for (const target of targets) {
    inDegree.set(target.id, 0);
  }
  for (const [, targetDeps] of deps) {
    for (const dep of targetDeps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    const targetDeps = deps.get(id);
    if (targetDeps) {
      for (const dep of targetDeps) {
        const newDegree = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) queue.push(dep);
      }
    }
  }

  return result;
}
