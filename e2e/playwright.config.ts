import { defineConfig } from "@playwright/test";
import { E2E_PROJECT_MANIFEST } from "./project-manifest.mjs";

// ============================================================
// Playwright project split.
//
// - smoke: lightweight startup, persistence, and core UI coverage.
// - visual: screenshot and visual-regression coverage.
// - perf: larger datasets and performance-sensitive workflows.
// - full-*: remaining E2E coverage split by product area.
//
// The runner executes every project by default. CI jobs can narrow the scope
// with flags such as `--project=smoke`. Keep workers=1 because Electron tests
// share process and window state.
// ============================================================

const WORKFLOW_VIDEO: "on" | "retain-on-failure" =
  process.env.VIVI2D_RECORD_E2E_WORKFLOWS === "1" ? "on" : "retain-on-failure";
const WORKFLOW_TIMEOUT =
  process.env.VIVI2D_RECORD_E2E_WORKFLOWS === "1" ? 90_000 : 30_000;
const PROJECTS = E2E_PROJECT_MANIFEST.map((project) => {
  const base = {
    name: project.name,
    ...(project.testMatch ? { testMatch: [...project.testMatch] } : {}),
    ...(project.testIgnore ? { testIgnore: [...project.testIgnore] } : {}),
  };
  return project.name === "workflow-auto-setup"
    ? {
        ...base,
        timeout: WORKFLOW_TIMEOUT,
        use: {
          video: WORKFLOW_VIDEO,
        },
      }
    : base;
});

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  // Allow small renderer differences across Electron/GPU combinations.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  // Keep screenshot baselines per platform because font rendering and GPU
  // rasterization differ noticeably between Windows, Linux, and macOS.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{platform}/{arg}{ext}",
  projects: PROJECTS,
});
