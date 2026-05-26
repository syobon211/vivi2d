import type { ViviCompatSupportReport } from "@vivi2d/provider-comfyui";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export type ComfyUICompatStatus = "unknown" | "checking" | "ready" | "missing";

export interface ComfyUIState {
  baseUrl: string;
  connected: boolean;
  generating: boolean;
  progressMessage: string;
  progressPercent: number;
  error: string | null;
  compatStatus: ComfyUICompatStatus;
  compatBaseUrl: string | null;
  compatCapability: string | null;
  compatPluginVersion: string | null;
  compatManifestSchema: string | null;
  compatHasDecomposeNode: boolean;
  compatHasExportNode: boolean;
  compatIssues: string[];

  setBaseUrl: (url: string) => void;
  setConnected: (connected: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setProgress: (message: string, percent: number) => void;
  setError: (error: string | null) => void;
  setCompatChecking: (baseUrl: string) => void;
  setCompatSupported: (
    baseUrl: string,
    report: Pick<
      ViviCompatSupportReport,
      | "capability"
      | "pluginVersion"
      | "manifestSchema"
      | "hasDecomposeNode"
      | "hasExportNode"
      | "issues"
    >,
  ) => void;
  setCompatMissing: (
    baseUrl: string,
    issues: string[],
    details?: Partial<
      Pick<
        ViviCompatSupportReport,
        | "capability"
        | "pluginVersion"
        | "manifestSchema"
        | "hasDecomposeNode"
        | "hasExportNode"
      >
    >,
  ) => void;
  clearCompat: () => void;
  reset: () => void;
}

const DEFAULT_URL = "http://127.0.0.1:8188";

function normalizeComfyUIBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = pathname === "" ? "/" : pathname;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function migrateComfyUI(persistedState: unknown, _version: number): ComfyUIState {
  const url = typeof persistedState === "string" ? persistedState : DEFAULT_URL;
  return { baseUrl: url } as ComfyUIState;
}

export const useComfyUIStore = create<ComfyUIState>()(
  withStandardMiddleware<ComfyUIState>(
    (set) => ({
      baseUrl: DEFAULT_URL,
      connected: false,
      generating: false,
      progressMessage: "",
      progressPercent: 0,
      error: null,
      compatStatus: "unknown",
      compatBaseUrl: null,
      compatCapability: null,
      compatPluginVersion: null,
      compatManifestSchema: null,
      compatHasDecomposeNode: false,
      compatHasExportNode: false,
      compatIssues: [],

      setBaseUrl: (url) =>
        set((s) => {
          const normalizedUrl = normalizeComfyUIBaseUrl(url);
          const keepCompat = s.compatBaseUrl === normalizedUrl;
          s.baseUrl = normalizedUrl;
          s.connected = keepCompat ? s.connected : false;
          if (!keepCompat) {
            s.compatStatus = "unknown";
            s.compatBaseUrl = null;
            s.compatCapability = null;
            s.compatPluginVersion = null;
            s.compatManifestSchema = null;
            s.compatHasDecomposeNode = false;
            s.compatHasExportNode = false;
            s.compatIssues = [];
          }
        }),
      setConnected: (connected) =>
        set((s) => {
          s.connected = connected;
        }),
      setGenerating: (generating) =>
        set((s) => {
          s.generating = generating;
        }),
      setProgress: (message, percent) =>
        set((s) => {
          s.progressMessage = message;
          s.progressPercent = percent;
        }),
      setError: (error) =>
        set((s) => {
          s.error = error;
        }),
      setCompatChecking: (baseUrl) =>
        set((s) => {
          const normalizedBaseUrl = normalizeComfyUIBaseUrl(baseUrl);
          s.compatStatus = "checking";
          s.compatBaseUrl = normalizedBaseUrl;
          s.compatCapability = null;
          s.compatPluginVersion = null;
          s.compatManifestSchema = null;
          s.compatHasDecomposeNode = false;
          s.compatHasExportNode = false;
          s.compatIssues = [];
        }),
      setCompatSupported: (baseUrl, report) =>
        set((s) => {
          const normalizedBaseUrl = normalizeComfyUIBaseUrl(baseUrl);
          s.compatStatus = "ready";
          s.compatBaseUrl = normalizedBaseUrl;
          s.compatCapability = report.capability;
          s.compatPluginVersion = report.pluginVersion;
          s.compatManifestSchema = report.manifestSchema;
          s.compatHasDecomposeNode = report.hasDecomposeNode;
          s.compatHasExportNode = report.hasExportNode;
          s.compatIssues = [...report.issues];
        }),
      setCompatMissing: (baseUrl, issues, details) =>
        set((s) => {
          const normalizedBaseUrl = normalizeComfyUIBaseUrl(baseUrl);
          s.compatStatus = "missing";
          s.compatBaseUrl = normalizedBaseUrl;
          s.compatCapability = details?.capability ?? null;
          s.compatPluginVersion = details?.pluginVersion ?? null;
          s.compatManifestSchema = details?.manifestSchema ?? null;
          s.compatHasDecomposeNode = details?.hasDecomposeNode ?? false;
          s.compatHasExportNode = details?.hasExportNode ?? false;
          s.compatIssues = [...issues];
        }),
      clearCompat: () =>
        set((s) => {
          s.compatStatus = "unknown";
          s.compatBaseUrl = null;
          s.compatCapability = null;
          s.compatPluginVersion = null;
          s.compatManifestSchema = null;
          s.compatHasDecomposeNode = false;
          s.compatHasExportNode = false;
          s.compatIssues = [];
        }),
      reset: () =>
        set((s) => {
          s.generating = false;
          s.progressMessage = "";
          s.progressPercent = 0;
          s.error = null;
        }),
    }),
    {
      name: "ComfyUIStore",
      persistKey: "vivi2d-comfyui-url",
      persistVersion: 1,
      partialize: (s) => ({ baseUrl: s.baseUrl }),
      migrate: migrateComfyUI,
    },
  ),
);
