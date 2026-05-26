import { MenuDropdown, MenuDropdownItem } from "@/components/MenuDropdown";
import {
  type I18nKey,
  type Locale,
  SUPPORTED_LOCALES,
  useI18nStore,
  useT,
} from "@/lib/i18n";
import { ManualPngReimportMenuItem } from "./ManualPngReimportMenuItem";

export function FileMenuSection(props: {
  projectLoaded: boolean;
  showAutoSetup: boolean;
  autoSetupDisabledReason?: string | null;
  requiresProjectReason: string;
  onOpenPsd: () => void;
  onOpenImage: () => void;
  onImportImageAsLayer: () => void;
  onImportImagesAsLayers: () => void;
  onImportFolderAsLayers: () => void;
  onOpenManualPngSplit: () => void;
  onOpenProject: () => void;
  onOpenVividImport: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenExportDialog: () => void;
  onOpenMediaExport: () => void;
  onGlbExport: () => void;
  onOpenReimportDialog: () => void;
  onOpenVividExport: () => void;
  onOpenValidationDialog: () => void;
  onOpenAutoSetup: () => void;
  onCloseProject: () => void;
}) {
  const t = useT();
  const {
    projectLoaded,
    showAutoSetup,
    autoSetupDisabledReason,
    requiresProjectReason,
    onOpenPsd,
    onOpenImage,
    onImportImageAsLayer,
    onImportImagesAsLayers,
    onImportFolderAsLayers,
    onOpenManualPngSplit,
    onOpenProject,
    onOpenVividImport,
    onSave,
    onSaveAs,
    onOpenExportDialog,
    onOpenMediaExport,
    onGlbExport,
    onOpenReimportDialog,
    onOpenVividExport,
    onOpenValidationDialog,
    onOpenAutoSetup,
    onCloseProject,
  } = props;

  return (
    <MenuDropdown label={t("menu.fileMenu")}>
      <MenuDropdownItem onClick={onOpenPsd} title={t("menu.openPsdTitle")}>
        {t("menu.openPsd")}
      </MenuDropdownItem>
      <MenuDropdownItem onClick={onOpenImage} title={t("menu.openImageTitle")}>
        {t("menu.openImage")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={onImportImageAsLayer}
        disabled={!projectLoaded}
        title={projectLoaded ? t("menu.importImageAsLayerTitle") : requiresProjectReason}
      >
        {t("menu.importImageAsLayer")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={onImportImagesAsLayers}
        disabled={!projectLoaded}
        title={
          projectLoaded ? t("menu.importImagesAsLayersTitle") : requiresProjectReason
        }
      >
        {t("menu.importImagesAsLayers")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={onImportFolderAsLayers}
        disabled={!projectLoaded}
        title={
          projectLoaded ? t("menu.importFolderAsLayersTitle") : requiresProjectReason
        }
      >
        {t("menu.importFolderAsLayers")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={onOpenManualPngSplit}
        disabled={!projectLoaded}
        title={projectLoaded ? t("menu.manualPngSplitTitle") : requiresProjectReason}
      >
        {t("menu.manualPngSplit")}
      </MenuDropdownItem>
      <MenuDropdownItem onClick={onOpenProject} title={t("menu.openTitle")}>
        {t("menu.open")}
      </MenuDropdownItem>
      <MenuDropdownItem onClick={onOpenVividImport} title={t("menu.vividImportTitle")}>
        {t("menu.vividImport")}
      </MenuDropdownItem>
      {projectLoaded && (
        <>
          <div className="menu-dropdown-divider" />
          <MenuDropdownItem onClick={onSave} title={t("menu.saveTitle")}>
            {t("menu.save")}
          </MenuDropdownItem>
          <MenuDropdownItem onClick={onSaveAs} title={t("menu.saveAsTitle")}>
            {t("menu.saveAs")}
          </MenuDropdownItem>
          <div className="menu-dropdown-divider" />
          <MenuDropdownItem onClick={onOpenExportDialog} title={t("menu.sdkExportTitle")}>
            {t("menu.sdkExport")}
          </MenuDropdownItem>
          <MenuDropdownItem
            onClick={onOpenMediaExport}
            title={t("menu.mediaOutputTitle")}
          >
            {t("menu.mediaOutput")}
          </MenuDropdownItem>
          <MenuDropdownItem onClick={onGlbExport} title={t("menu.glbExportTitle")}>
            {t("menu.glbExport")}
          </MenuDropdownItem>
          <ManualPngReimportMenuItem />
          <MenuDropdownItem
            onClick={onOpenReimportDialog}
            title={t("menu.reimportTitle")}
          >
            {t("menu.reimport")}
          </MenuDropdownItem>
          <MenuDropdownItem
            onClick={onOpenVividExport}
            title={t("menu.vividExportTitle")}
          >
            {t("menu.vividExport")}
          </MenuDropdownItem>
          <div className="menu-dropdown-divider" />
          <MenuDropdownItem
            onClick={onOpenValidationDialog}
            title={t("menu.validateTitle")}
          >
            {t("menu.validate")}
          </MenuDropdownItem>
          {showAutoSetup && (
            <MenuDropdownItem
              onClick={onOpenAutoSetup}
              disabled={Boolean(autoSetupDisabledReason)}
              title={autoSetupDisabledReason ?? t("menu.autoSetupTitle")}
            >
              {t("menu.autoSetup")}
            </MenuDropdownItem>
          )}
          <div className="menu-dropdown-divider" />
          <MenuDropdownItem onClick={onCloseProject}>{t("menu.close")}</MenuDropdownItem>
        </>
      )}
    </MenuDropdown>
  );
}

export function EditHistorySection(props: {
  projectLoaded: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  if (!props.projectLoaded) return null;
  return (
    <>
      <div className="menu-separator" />
      <div className="menu-group">
        <button
          type="button"
          className="menu-btn"
          onClick={props.onUndo}
          disabled={!props.canUndo}
          title={t("menu.undoTitle")}
        >
          {t("menu.undo")}
        </button>
        <button
          type="button"
          className="menu-btn"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          title={t("menu.redoTitle")}
        >
          {t("menu.redo")}
        </button>
      </div>
    </>
  );
}

export function ViewMenuSection(props: {
  defaultFormLocked: boolean;
  onionSkinEnabled: boolean;
  multiViewEnabled: boolean;
  workspaceMode: "default" | "rigging" | "animation";
  onToggleDefaultFormLock: () => void;
  onToggleOnionSkin: () => void;
  onToggleMultiView: () => void;
  onResetView: () => void;
  onSetWorkspaceMode: (mode: "default" | "rigging" | "animation") => void;
}) {
  const t = useT();
  return (
    <MenuDropdown label={t("menu.viewMenu")}>
      <MenuDropdownItem
        onClick={props.onToggleDefaultFormLock}
        active={props.defaultFormLocked}
        title={t("menu.formLockTitle")}
      >
        {t("menu.formLock")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={props.onToggleOnionSkin}
        active={props.onionSkinEnabled}
        title={t("menu.onionSkinTitle")}
      >
        {t("menu.onionSkin")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={props.onToggleMultiView}
        active={props.multiViewEnabled}
        title={t("menu.splitViewTitle")}
      >
        {t("menu.splitView")}
      </MenuDropdownItem>
      <div className="menu-dropdown-divider" />
      <MenuDropdownItem onClick={props.onResetView} title={t("menu.resetViewTitle")}>
        {t("menu.resetView")}
      </MenuDropdownItem>
      <div className="menu-dropdown-divider" />
      <div className="menu-dropdown-section">{t("menu.workspaceMode")}</div>
      <MenuDropdownItem
        onClick={() => props.onSetWorkspaceMode("default")}
        active={props.workspaceMode === "default"}
        title={t("menu.defaultWorkspaceTitle")}
      >
        {t("menu.defaultWorkspace")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={() => props.onSetWorkspaceMode("rigging")}
        active={props.workspaceMode === "rigging"}
        title={t("menu.riggingWorkspaceTitle")}
      >
        {t("menu.riggingWorkspace")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={() => props.onSetWorkspaceMode("animation")}
        active={props.workspaceMode === "animation"}
        title={t("menu.animationWorkspaceTitle")}
      >
        {t("menu.animationWorkspace")}
      </MenuDropdownItem>
    </MenuDropdown>
  );
}

export function SettingsMenuSection(props: {
  onOpenQuickActions: () => void;
  onOpenShortcuts: () => void;
  currentTheme: "light" | "dark";
  onToggleTheme: () => void;
  onSetLocale: (locale: Locale) => void;
}) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const localeLabels: Record<Locale, { labelKey: string; titleKey: string }> = {
    en: {
      labelKey: "menu.languageEnglish",
      titleKey: "menu.languageEnglishTitle",
    },
    ja: {
      labelKey: "menu.languageJapanese",
      titleKey: "menu.languageJapaneseTitle",
    },
    "zh-Hans": {
      labelKey: "menu.languageChineseSimplified",
      titleKey: "menu.languageChineseSimplifiedTitle",
    },
    "ko-KR": {
      labelKey: "menu.languageKorean",
      titleKey: "menu.languageKoreanTitle",
    },
  };
  return (
    <MenuDropdown label={t("menu.settingsMenu")}>
      <MenuDropdownItem
        onClick={props.onOpenQuickActions}
        title={t("menu.quickActionsTitle")}
      >
        {t("menu.quickActions")}
      </MenuDropdownItem>
      <MenuDropdownItem onClick={props.onOpenShortcuts} title={t("menu.shortcutsTitle")}>
        {t("menu.shortcuts")}
      </MenuDropdownItem>
      <MenuDropdownItem onClick={props.onToggleTheme} title={t("menu.themeTitle")}>
        {props.currentTheme === "dark"
          ? t("menu.themeLightMode")
          : t("menu.themeDarkMode")}
      </MenuDropdownItem>
      <div className="menu-dropdown-divider" />
      <div className="menu-dropdown-section">{t("menu.languageSection")}</div>
      {SUPPORTED_LOCALES.map((supportedLocale) => (
        <MenuDropdownItem
          key={supportedLocale}
          onClick={() => props.onSetLocale(supportedLocale)}
          active={locale === supportedLocale}
          title={t(localeLabels[supportedLocale].titleKey as I18nKey)}
        >
          {t(localeLabels[supportedLocale].labelKey as I18nKey)}
        </MenuDropdownItem>
      ))}
    </MenuDropdown>
  );
}

export function IntegrationsMenuSection(props: {
  onOpenAIGenerate: () => void;
  onOpenComfyUISettings: () => void;
  onOpenOBSSettings: () => void;
  onOpenVTSSettings: () => void;
}) {
  const t = useT();
  return (
    <MenuDropdown label={t("menu.integrations")}>
      <div className="menu-dropdown-section">ComfyUI</div>
      <MenuDropdownItem onClick={props.onOpenAIGenerate} title={t("ai.generateTitle")}>
        {t("ai.generate")}
      </MenuDropdownItem>
      <MenuDropdownItem
        onClick={props.onOpenComfyUISettings}
        title={t("ai.comfyuiSettingsTitle")}
      >
        {t("ai.comfyuiSettings")}
      </MenuDropdownItem>
      <div className="menu-dropdown-section">OBS Studio</div>
      <MenuDropdownItem
        onClick={props.onOpenOBSSettings}
        title={t("integration.obsTitle")}
      >
        {t("integration.settings")}
      </MenuDropdownItem>
      <div className="menu-dropdown-section">VTube Studio</div>
      <MenuDropdownItem
        onClick={props.onOpenVTSSettings}
        title={t("integration.vtsTitle")}
      >
        {t("integration.settings")}
      </MenuDropdownItem>
    </MenuDropdown>
  );
}
