import { resolve } from "path";

export interface AliasOptions {
  publicProfileStubs?: boolean;
}

// Shared aliases for Vite, Vitest, and package boundary checks.
export function makeAliases(
  rootDir: string,
  options: AliasOptions = {},
): Record<string, string> {
  const publicProfileAliases: Record<string, string> = options.publicProfileStubs
    ? {}
    : {};

  return {
    ...publicProfileAliases,
    "@": resolve(rootDir, "src"),
    "@vivi2d/core": resolve(rootDir, "packages/core/src"),
    "@vivi2d/model": resolve(rootDir, "packages/model/src"),
    "@vivi2d/editor-core": resolve(rootDir, "packages/editor-core/src"),
    "@vivi2d/loader": resolve(rootDir, "packages/loader/src"),
    "@vivi2d/runtime": resolve(rootDir, "packages/runtime/src"),
    "@vivi2d/runtime-wasm": resolve(rootDir, "packages/runtime-wasm/src"),
    "@vivi2d/renderer-pixi": resolve(rootDir, "packages/renderer-pixi/src"),
    "@vivi2d/renderer-three": resolve(rootDir, "packages/renderer-three/src"),
    "@vivi2d/renderer-phaser": resolve(rootDir, "packages/renderer-phaser/src"),
    "@vivi2d/viewer": resolve(rootDir, "packages/viewer/src"),
    "@vivi2d/web": resolve(rootDir, "packages/web/src"),
    "@vivi2d/provider-sdk": resolve(rootDir, "packages/provider-sdk/src"),
    "@vivi2d/provider-comfyui": resolve(rootDir, "packages/provider-comfyui/src"),
  };
}
