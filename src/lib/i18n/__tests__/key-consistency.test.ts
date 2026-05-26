import { beforeEach, describe, expect, it } from "vitest";
import { common as enCommon } from "../en/common";
import { dialog as enDialog } from "../en/dialog";
import { en } from "../en/index";
import { layer as enLayer } from "../en/layer";
import { menu as enMenu } from "../en/menu";
import { panel as enPanel } from "../en/panel";
import { shortcut as enShortcut } from "../en/shortcut";
import { timeline as enTimeline } from "../en/timeline";
import { common as jaCommon } from "../ja/common";
import { dialog as jaDialog } from "../ja/dialog";
import { ja } from "../ja/index";
import { layer as jaLayer } from "../ja/layer";
import { menu as jaMenu } from "../ja/menu";
import { panel as jaPanel } from "../ja/panel";
import { shortcut as jaShortcut } from "../ja/shortcut";
import { timeline as jaTimeline } from "../ja/timeline";
import {
  detectPreferredLocale,
  normalizeLocale,
  resolveLocaleFromSources,
  SUPPORTED_LOCALES,
} from "../locale";
import { common as koCommon } from "../ko-KR/common";
import { dialog as koDialog } from "../ko-KR/dialog";
import { koKR } from "../ko-KR/index";
import { layer as koLayer } from "../ko-KR/layer";
import { menu as koMenu } from "../ko-KR/menu";
import { panel as koPanel } from "../ko-KR/panel";
import { shortcut as koShortcut } from "../ko-KR/shortcut";
import { timeline as koTimeline } from "../ko-KR/timeline";
import { common as zhCommon } from "../zh-Hans/common";
import { dialog as zhDialog } from "../zh-Hans/dialog";
import { zhHans } from "../zh-Hans/index";
import { layer as zhLayer } from "../zh-Hans/layer";
import { menu as zhMenu } from "../zh-Hans/menu";
import { panel as zhPanel } from "../zh-Hans/panel";
import { shortcut as zhShortcut } from "../zh-Hans/shortcut";
import { timeline as zhTimeline } from "../zh-Hans/timeline";
import { useI18nStore } from "../../i18n";

type NamespaceBundle = Record<string, Record<string, string>>;

const englishNamespaces: NamespaceBundle = {
  common: enCommon,
  dialog: enDialog,
  layer: enLayer,
  menu: enMenu,
  panel: enPanel,
  shortcut: enShortcut,
  timeline: enTimeline,
};

const localeNamespaces: Record<string, NamespaceBundle> = {
  en: englishNamespaces,
  ja: {
    common: jaCommon,
    dialog: jaDialog,
    layer: jaLayer,
    menu: jaMenu,
    panel: jaPanel,
    shortcut: jaShortcut,
    timeline: jaTimeline,
  },
  "zh-Hans": {
    common: zhCommon,
    dialog: zhDialog,
    layer: zhLayer,
    menu: zhMenu,
    panel: zhPanel,
    shortcut: zhShortcut,
    timeline: zhTimeline,
  },
  "ko-KR": {
    common: koCommon,
    dialog: koDialog,
    layer: koLayer,
    menu: koMenu,
    panel: koPanel,
    shortcut: koShortcut,
    timeline: koTimeline,
  },
};

const mergedLocales = {
  en,
  ja,
  "zh-Hans": zhHans,
  "ko-KR": koKR,
};

const editorLaunchSurfaceKeys = [
  "menu.fileMenu",
  "menu.viewMenu",
  "menu.settingsMenu",
  "menu.select",
  "menu.pan",
  "menu.mesh",
  "layer.title",
  "layer.openPsd",
  "prop.title",
  "prop.noProject",
] as const;

const editorMajorDialogSurfaceKeys = [
  "ai.dialogTitle",
  "ai.tabImage",
  "ai.selectImageAndGenerate",
  "manualPngSplit.title",
  "manualPngSplit.toolLasso",
  "manualPngSplit.lassoSmoothing",
  "manualPngSplit.createLayers",
  "autoSetup.title",
  "autoSetup.recommendedFlow",
  "autoSetup.detectDescription",
  "autoSetup.detailLevel",
  "autoSetup.modeBeginner",
  "autoSetup.modeAdvanced",
  "autoSetup.settings",
  "autoSetup.generationPlan",
  "autoSetup.generateBones",
  "autoSetup.generateMeshes",
  "autoSetup.generateWeights",
  "autoSetup.generatePhysics",
  "autoSetup.meshDensity",
  "autoSetup.minConfidence",
  "autoSetup.weightModeBadge",
  "autoSetup.detectStart",
  "autoSetup.motionHandleReview",
  "autoSetup.safeOperationsSummary",
  "autoSetup.discardedPreviewCategories",
  "autoSetup.motionStressChecks",
  "autoSetup.cleanupComparisonTitle",
  "autoSetup.motionHandleEditor",
  "autoSetup.motionStressAction.duplicateOutline",
  "autoSetup.motionStressAction.hiddenReveal",
  "prop.coarse",
  "prop.standard",
  "prop.fine",
] as const;

const editorShortcutSurfaceKeys = [
  "shortcut.action.undo",
  "shortcut.action.redo",
  "shortcut.action.save",
  "shortcut.action.saveAs",
  "shortcut.action.moveLayerUp",
  "shortcut.action.moveLayerDown",
  "shortcut.action.selectAll",
  "shortcut.action.toolSelect",
  "shortcut.action.toolPan",
  "shortcut.action.toolMeshEdit",
  "shortcut.action.tempPan",
] as const;

const editorToolbarSurfaceKeys = [
  "menu.undo",
  "menu.redo",
] as const;

const editorLoadedProjectPanelSurfaceKeys = [
  "prop.rigHealth.title",
  "prop.rigHealth.ok",
  "prop.rigHealth.openValidation",
  "prop.size",
  "param.noParams",
  "template.label",
  "collider.none",
  "collider.addRect",
  "collider.addCircle",
  "collider.addMesh",
  "physics.addGroup",
  "physics.hairStrand.title",
  "physics.hairStrand.selectTipBone",
  "physics.hairStrand.preset.generic",
  "physics.hairStrand.create",
  "expressionPreset.title",
  "expressionPreset.save",
  "expressionPreset.none",
] as const;

const editorTimelineChromeSurfaceKeys = [
  "timeline.noClip",
  "timeline.sceneNone",
  "timeline.clipNone",
  "timeline.stopButton",
  "timeline.playButton",
  "timeline.loopButton",
  "timeline.graphButton",
  "timeline.motionPresetButtonLabel",
  "timeline.firstMotionButtonLabel",
  "timeline.idleSynthButtonLabel",
] as const;

function diff(
  expected: Record<string, string>,
  actual: Record<string, string>,
): {
  missing: string[];
  extra: string[];
} {
  const expectedKeys = new Set(Object.keys(expected));
  const actualKeys = new Set(Object.keys(actual));
  return {
    missing: [...expectedKeys].filter((key) => !actualKeys.has(key)).sort(),
    extra: [...actualKeys].filter((key) => !expectedKeys.has(key)).sort(),
  };
}

describe("editor i18n dictionaries", () => {
  it.each(Object.entries(localeNamespaces))(
    "keeps namespace keys aligned for %s",
    (locale, namespaces) => {
      for (const [name, englishNamespace] of Object.entries(englishNamespaces)) {
        const { missing, extra } = diff(englishNamespace, namespaces[name] ?? {});
        expect(missing, `${locale}/${name} is missing keys`).toEqual([]);
        expect(extra, `${locale}/${name} has extra keys`).toEqual([]);
      }
    },
  );

  it.each(Object.entries(mergedLocales))("keeps merged keys aligned for %s", (locale, dict) => {
    const { missing, extra } = diff(en, dict);
    expect(missing, `${locale} is missing merged keys`).toEqual([]);
    expect(extra, `${locale} has extra merged keys`).toEqual([]);
  });

  it.each(Object.entries(localeNamespaces))(
    "merged dictionary size equals namespace total for %s",
    (locale, namespaces) => {
      const namespaceTotal = Object.values(namespaces).reduce(
        (sum, namespace) => sum + Object.keys(namespace).length,
        0,
      );
      expect(Object.keys(mergedLocales[locale as keyof typeof mergedLocales]).length).toBe(
        namespaceTotal,
      );
    },
  );

  it.each(Object.entries(mergedLocales))("does not contain empty values for %s", (locale, dict) => {
    const emptyEntries = Object.entries(dict).filter(([, value]) => value.length === 0);
    expect(emptyEntries, `${locale} has empty translations`).toEqual([]);
  });

  it.each(["zh-Hans", "ko-KR"] as const)(
    "does not fall back to English on the editor launch surface for %s",
    (locale) => {
      const dict = mergedLocales[locale];
      for (const key of editorLaunchSurfaceKeys) {
        expect(dict[key], `${locale}.${key} should be localized`).not.toBe(en[key]);
      }
    },
  );

  it.each(["zh-Hans", "ko-KR"] as const)(
    "does not fall back to English on major dialog surfaces for %s",
    (locale) => {
      const dict = mergedLocales[locale];
      for (const key of editorMajorDialogSurfaceKeys) {
        expect(dict[key], `${locale}.${key} should be localized`).not.toBe(en[key]);
      }
    },
  );

  it.each(["zh-Hans", "ko-KR"] as const)(
    "does not fall back to English on shortcut action labels for %s",
    (locale) => {
      const dict = mergedLocales[locale];
      for (const key of editorShortcutSurfaceKeys) {
        expect(dict[key], `${locale}.${key} should be localized`).not.toBe(en[key]);
      }
    },
  );

  it.each(["zh-Hans", "ko-KR"] as const)(
    "does not fall back to English on loaded project chrome for %s",
    (locale) => {
      const dict = mergedLocales[locale];
      for (const key of [
        ...editorToolbarSurfaceKeys,
        ...editorLoadedProjectPanelSurfaceKeys,
        ...editorTimelineChromeSurfaceKeys,
      ]) {
        expect(dict[key], `${locale}.${key} should be localized`).not.toBe(en[key]);
      }
    },
  );

  it("declares the expected supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "ja", "zh-Hans", "ko-KR"]);
  });

  it("normalizes common BCP 47 variants", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("ja-JP-u-ca-japanese")).toBe("ja");
    expect(normalizeLocale("ZH_hans_CN")).toBe("zh-Hans");
    expect(normalizeLocale("ko-kr")).toBe("ko-KR");
  });

  it("does not map Traditional Chinese variants to Simplified Chinese", () => {
    expect(normalizeLocale("zh-Hant")).toBeNull();
    expect(normalizeLocale("zh-TW")).toBeNull();
    expect(normalizeLocale("zh-HK")).toBeNull();
    expect(normalizeLocale("zh-MO")).toBeNull();
  });

  it("chooses the first supported browser language", () => {
    expect(detectPreferredLocale(["fr-FR", "zh-CN", "ja-JP"])).toBe("zh-Hans");
  });

  it("keeps locale source priority deterministic", () => {
    expect(
      resolveLocaleFromSources({
        explicitUserSelection: "ko",
        urlOverride: "ja",
        persistedPreference: "zh-CN",
        browserLanguages: ["en-US"],
      }),
    ).toEqual({ locale: "ko-KR", source: "explicitUserSelection", mayPersist: true });

    expect(
      resolveLocaleFromSources({
        urlOverride: "zh_hans_cn",
        persistedPreference: "ja",
        browserLanguages: ["ko-KR"],
      }),
    ).toEqual({ locale: "zh-Hans", source: "urlOverride", mayPersist: false });

    expect(
      resolveLocaleFromSources({
        persistedPreference: "ja-JP",
        browserLanguages: ["ko-KR"],
      }),
    ).toEqual({ locale: "ja", source: "persistedPreference", mayPersist: false });

    expect(resolveLocaleFromSources({ browserLanguages: ["ko-KR"] })).toEqual({
      locale: "ko-KR",
      source: "browserLanguage",
      mayPersist: false,
    });
  });
});

describe("editor locale persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not persist locale changes unless explicitly requested", () => {
    useI18nStore.getState().setLocale("ko-KR");
    expect(localStorage.getItem("vivi2d-locale")).toBeNull();
  });

  it("persists explicit user locale selections", () => {
    useI18nStore.getState().setLocale("zh-Hans", { persist: true });
    expect(localStorage.getItem("vivi2d-locale")).toBe("zh-Hans");
  });
});
