// Shared E2E project manifest.
//
// Keep Playwright configuration and static coverage checks on the same source
// of truth so newly added specs cannot silently fall out of the default run.

export const VISUAL_MATCH = ["**/visual-*.spec.ts", "**/character-visual-check.spec.ts"];

export const PERF_MATCH = ["**/large-data-performance.spec.ts", "**/perf-*.spec.ts"];

export const WORKFLOW_AUTO_SETUP_MATCH = [
  "**/auto-setup-character-recording.spec.ts",
  "**/auto-setup-source-preservation.spec.ts",
  "**/auto-setup-workflow.spec.ts",
  "**/bbw-auto-weights.spec.ts",
  "**/local-image-auto-setup-preservation.spec.ts",
];

export const SMOKE_MATCH = [
  "**/app-launch.spec.ts",
  "**/project-io.spec.ts",
  "**/project-save-load.spec.ts",
  "**/project-vivid-format.spec.ts",
  "**/properties.spec.ts",
  "**/parameter.spec.ts",
  "**/notification.spec.ts",
  "**/language-switch.spec.ts",
  "**/theme.spec.ts",
  "**/i18n-theme-combo.spec.ts",
  "**/keyboard-workflow.spec.ts",
  "**/undo-redo.spec.ts",
  "**/tools.spec.ts",
  "**/error-handling.spec.ts",
  "**/file-corruption-recovery.spec.ts",
  "**/core-integration.spec.ts",
  "**/ipc-security.spec.ts",
  "**/ai-generate-dialog.spec.ts",
];

export const FULL_A11Y_MATCH = [
  "**/_inventory-color-contrast.spec.ts",
  "**/a11y-*.spec.ts",
  "**/accessibility.spec.ts",
];

export const FULL_RIG_MATCH = [
  "**/auto-mesh.spec.ts",
  "**/bone-workflow.spec.ts",
  "**/canvas-bone-overlay.spec.ts",
  "**/canvas-collider-overlay.spec.ts",
  "**/canvas-mesh-overlay.spec.ts",
  "**/collider-*.spec.ts",
  "**/ik-advanced.spec.ts",
  "**/parameter-binding*.spec.ts",
  "**/parameter-interaction.spec.ts",
  "**/physics.spec.ts",
  "**/validation-workflow.spec.ts",
];

export const FULL_EDITOR_MATCH = [
  "**/artpath-editing.spec.ts",
  "**/canvas-viewport.spec.ts",
  "**/draw-properties.spec.ts",
  "**/layer-drag-reorder.spec.ts",
  "**/mesh-edit.spec.ts",
  "**/multi-view*.spec.ts",
  "**/offscreen-advanced.spec.ts",
  "**/quick-actions.spec.ts",
  "**/shortcut-settings.spec.ts",
  "**/state-machine-*.spec.ts",
  "**/viewport.spec.ts",
];

export const FULL_IO_MATCH = [
  "**/comprehensive-pipeline.spec.ts",
  "**/export-dialog.spec.ts",
  "**/glb-*.spec.ts",
  "**/media-export.spec.ts",
  "**/psd-*.spec.ts",
  "**/sdk-export.spec.ts",
  "**/vivib-binary.spec.ts",
];

export const FULL_ANIMATION_MATCH = [
  "**/expression-preset.spec.ts",
  "**/graph-editor*.spec.ts",
  "**/lipsync.spec.ts",
  "**/scene-*.spec.ts",
  "**/scene-blend.spec.ts",
  "**/timeline*.spec.ts",
  "**/undo-redo-*.spec.ts",
];

export const FULL_DIALOGS_MATCH = [
  "**/design-layout-contracts.spec.ts",
  "**/dialog-state-inventory.spec.ts",
  "**/screen-inventory-capture.spec.ts",
];

export const FULL_INTEGRATIONS_MATCH = [
  "**/comfyui-integration.spec.ts",
  "**/tier-c-*.spec.ts",
  "**/vmc-protocol.spec.ts",
];

export const FULL_SPLIT_MATCH = [
  ...WORKFLOW_AUTO_SETUP_MATCH,
  ...FULL_A11Y_MATCH,
  ...FULL_RIG_MATCH,
  ...FULL_EDITOR_MATCH,
  ...FULL_IO_MATCH,
  ...FULL_ANIMATION_MATCH,
  ...FULL_DIALOGS_MATCH,
  ...FULL_INTEGRATIONS_MATCH,
];

export const FULL_COMMON_IGNORE = [
  ...SMOKE_MATCH,
  ...VISUAL_MATCH,
  ...PERF_MATCH,
];

export const E2E_PROJECT_MANIFEST = [
  {
    name: "smoke",
    testMatch: SMOKE_MATCH,
  },
  {
    name: "workflow-auto-setup",
    testMatch: WORKFLOW_AUTO_SETUP_MATCH,
  },
  {
    name: "visual",
    testMatch: VISUAL_MATCH,
  },
  {
    name: "perf",
    testMatch: PERF_MATCH,
  },
  {
    name: "full-a11y",
    testMatch: FULL_A11Y_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-rig",
    testMatch: FULL_RIG_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-editor",
    testMatch: FULL_EDITOR_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-io",
    testMatch: FULL_IO_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-animation",
    testMatch: FULL_ANIMATION_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-dialogs",
    testMatch: FULL_DIALOGS_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-integrations",
    testMatch: FULL_INTEGRATIONS_MATCH,
    testIgnore: FULL_COMMON_IGNORE,
  },
  {
    name: "full-misc",
    testIgnore: [
      ...FULL_COMMON_IGNORE,
      ...FULL_SPLIT_MATCH,
    ],
  },
];
