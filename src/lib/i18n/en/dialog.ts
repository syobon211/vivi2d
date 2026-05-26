// All dialogs (Spine export / Media output / Validation / PSD reimport /
// Integrations (OBS/VTS) / ComfyUI / Error boundary / Notification toast / Generic dialog)
export const dialog = {
  "export.spineTitle": "Spine JSON Export",
  "export.noViviMesh": "No ViviMeshes",
  "export.outputFiles": "Output Files",
  "export.bonesSkinAnims": "Bones, Skins, & Animations",
  "export.textureAtlas": "Texture Atlas",
  "export.selectingDest": "Selecting destination...",
  "export.generatingData": "Generating export data...",
  "export.writingFiles": "Writing files...",
  "export.layers": "Layers",
  "export.animations": "Animations",
  "export.fileCountSuffix": "file(s)",
  "export.writingFileCountSuffix": "file(s) being written...",
  "export.completedPrefix": "Export complete:",
  "export.failedPrefix": "Export failed:",

  "media.title": "Media Export",
  "media.pngSequence": "PNG Sequence",
  "media.video": "Video (WebM/MP4)",
  "media.clip": "Clip",
  "media.noClips": "No exportable clips",
  "media.format": "Format",
  "media.rendering": "Rendering",
  "media.encoding": "Encoding",
  "media.saving": "Saving",
  "media.pixiMissing": "PixiJS application was not found",
  "media.pngExportedSuffix": "PNG frame(s) exported",
  "media.videoExported": "Video exported",
  "media.exportFailedPrefix": "Export failed:",
  "media.unknownError": "Unknown error",
  "media.duration": "Duration",
  "media.seconds": "seconds",
  "media.frameCount": "Frames",
  "media.framesShort": "f",
  "media.fps": "FPS",
  "media.output": "Output",
  "media.pngFileCountSuffix": "PNG file(s)",
  "media.webmVideoFile": "WebM video file",

  "validation.title": "Model Validation",
  "validation.noIssues": "No issues found",
  "validation.category.emptyMesh": "Empty Mesh",
  "validation.category.meshIndexBounds": "Mesh Index Bounds",
  "validation.category.orphanSkin": "Orphan Skin",
  "validation.category.unboundVertices": "Unbound Vertices",
  "validation.category.unusedBone": "Unused Bone",
  "validation.category.weightNormalization": "Weight Normalization",

  "reimport.title": "PSD Reimport",
  "reimport.info1": "Select a PSD file to preview differences.",
  "reimport.info2": "Match by layer name and update textures and positions.",
  "reimport.info3": "Parameters, motion controls, and binding points are preserved.",
  "reimport.analyzing": "Analyzing...",
  "reimport.selectPsd": "Select PSD File",
  "reimport.noChanges": "No changes found.",
  "reimport.keptNote": "These remain in the project (not deleted)",
  "reimport.parseFailedPrefix": "PSD analysis failed:",
  "reimport.completedPrefix": "PSD reimport complete:",
  "reimport.updatedCountSuffix": "updated",
  "reimport.addedCountSuffix": "added",
  "reimport.failedPrefix": "Reimport failed:",
  "reimport.updated": "Updated",
  "reimport.added": "Added",
  "reimport.removedFromPsd": "Missing from PSD",

  "integration.settings": "Settings...",
  "integration.obsTitle": "OBS Studio WebSocket connection",
  "integration.obsDialogTitle": "OBS Studio Connection Settings",
  "integration.obsUrl": "OBS WebSocket URL",
  "integration.obsPassword": "Password",
  "integration.obsPasswordPlaceholder": "Leave empty if not configured",
  "integration.obsNotice":
    "Enable the WebSocket server in OBS Studio (Tools → WebSocket Server Settings).",
  "integration.vtsTitle": "VTube Studio API connection",
  "integration.vtsDialogTitle": "VTube Studio Connection Settings",
  "integration.vtsUrl": "VTube Studio API URL",
  "integration.vtsNotice":
    "Make sure VTube Studio is running. Plugin authorization is required on first connection.",

  "ai.menuLabel": "ComfyUI",
  "ai.generate": "Generate Model...",
  "ai.generateTitle": "Auto-generate model from image or prompt",
  "ai.comfyuiSettings": "ComfyUI Settings...",
  "ai.comfyuiSettingsTitle": "Configure ComfyUI connection",
  "ai.dialogTitle": "Automatic Model Generation",
  "ai.tabImage": "From Image",
  "ai.tabPrompt": "From Prompt",
  "ai.imageModeNotice":
    "Select an image file to start See-through decomposition and automatic model generation.",
  "ai.prompt": "Prompt",
  "ai.promptDefault": "anime girl, full body, white background, simple outfit",
  "ai.promptPlaceholder": "anime girl, full body, white background...",
  "ai.negativePrompt": "Negative Prompt",
  "ai.negativePromptDefault": "low quality, worst quality, blurry",
  "ai.seed": "Seed",
  "ai.resolution": "Resolution",
  "ai.steps": "Steps",
  "ai.recommended": "Recommended",
  "ai.licenseNotice":
    "ComfyUI is required. Vivi2D compat or the legacy See-through workflow will be used.",
  "ai.selectImageAndGenerate": "Select Image & Generate",
  "ai.startGenerate": "Start Generation",
  "ai.generating": "Generating...",
  "ai.uploading": "Uploading image...",
  "ai.decomposing": "Starting See-through decomposition...",
  "ai.processing": "Processing...",
  "ai.downloading": "Downloading results...",
  "ai.loadingPsd": "Loading PSD...",
  "ai.complete": "Complete!",
  "ai.modelGenerated": "Model generation complete",
  "ai.error": "Error",
  "ai.timeout": "Timeout: processing did not finish within 10 minutes",
  "ai.workflowError": "ComfyUI workflow finished with error",
  "ai.psdNotFound": "PSD file not found",
  "ai.noOutput": "Could not retrieve output from ComfyUI",
  "ai.comfyuiTitle": "ComfyUI Connection Settings",
  "ai.comfyuiUrl": "ComfyUI URL",
  "ai.testConnection": "Test Connection",
  "ai.testing": "Testing...",
  "ai.connectionSuccess": "✓ Connected",
  "ai.connectionFailed": "✗ Connection Failed",
  "ai.comfyuiNotice":
    "Make sure ComfyUI is running. Vivi2D compat or the legacy See-through workflow will be used.",
  "ai.compatChecking": "Checking Vivi2D compat plugin...",
  "ai.compatReady": "Vivi2D compat plugin detected. Using the Vivi2D compat workflow.",
  "ai.compatFallback":
    "Vivi2D compat plugin was not detected. Falling back to the legacy See-through workflow.",
  "ai.compatFallbackRuntimeNotice":
    "The Vivi2D compat workflow became unavailable during generation. Falling back to the legacy See-through workflow.",
  "ai.nativeImportFallbackNotice":
    "The native See-through import path failed. Falling back to compat PSD import.",
  "ai.compatSchema": "Manifest schema",
  "ai.compatIssue": "Compat check issue",
  "ai.compatPluginVersion": "Plugin version",
  "ai.compatCapability": "Capability",
  "ai.compatNodes": "Compat nodes",
  "ai.compatNode.decompose": "decompose",
  "ai.compatNode.export": "export",
  "ai.compatNode.ok": "OK",
  "ai.compatNode.missing": "Missing",
  "ai.promptStarting": "Starting image generation + See-through decomposition...",

  "manualPngSplit.title": "PNG Layer Split Wizard",
  "manualPngSplit.open": "Open split wizard",
  "manualPngSplit.description":
    "Paint masks for the parts you want to rig independently. Vivi2D will cut the original pixels into role-labeled layers without generating new artwork.",
  "manualPngSplit.canvasLabel": "Manual PNG split mask canvas",
  "manualPngSplit.noSource":
    "Select a manual PNG layer, or open a PNG project, before using the split wizard.",
  "manualPngSplit.sourceLayer": "Source layer",
  "manualPngSplit.reviewTitle": "Review",
  "manualPngSplit.reviewNeedMasks": "Create at least two non-empty masks before applying.",
  "manualPngSplit.reviewOverlap": "Some masks overlap. You can still apply, but review the overlap before auto setup.",
  "manualPngSplit.reviewReady": "Masks are ready for a non-destructive split.",
  "manualPngSplit.showSource": "Show source image",
  "manualPngSplit.showStressPreview": "Show movement stress preview",
  "manualPngSplit.brushSize": "Brush size",
  "manualPngSplit.stressOffset": "Stress offset",
  "manualPngSplit.paint": "Paint",
  "manualPngSplit.erase": "Erase",
  "manualPngSplit.toolBrush": "Brush",
  "manualPngSplit.toolLasso": "Lasso",
  "manualPngSplit.toolWand": "Wand",
  "manualPngSplit.lassoSmoothing": "Lasso smoothing",
  "manualPngSplit.lassoSmoothing.off": "Off",
  "manualPngSplit.lassoSmoothing.low": "Low",
  "manualPngSplit.lassoSmoothing.medium": "Medium",
  "manualPngSplit.lassoSmoothing.high": "High",
  "manualPngSplit.lassoPrecision": "Precision mode",
  "manualPngSplit.lassoWarning.tooFewPoints":
    "Lasso stroke was too short. Draw a wider closed region.",
  "manualPngSplit.lassoWarning.pointLimitReduced":
    "The lasso stroke was simplified because it contained many points.",
  "manualPngSplit.lassoWarning.detailReducedForSmoothing":
    "Some detail was reduced for smoothing. Lower smoothing or zoom in for fine edges.",
  "manualPngSplit.lassoWarning.areaDeltaTooLarge":
    "Smoothing was reduced because the selected area changed too much.",
  "manualPngSplit.lassoWarning.boundsDriftTooLarge":
    "Smoothing was reduced because the path moved too far from the stroke.",
  "manualPngSplit.lassoWarning.selfIntersectionSuspected":
    "The lasso crossed itself, so the stroke was not applied.",
  "manualPngSplit.lassoWarning.smoothingFallbackToRaw":
    "Smoothing was skipped for this stroke, so the raw lasso path was used.",
  "manualPngSplit.lassoWarning.degenerateStroke":
    "The lasso area was too small to apply.",
  "manualPngSplit.lassoWarning.nonFinitePointDropped":
    "Some invalid pointer samples were ignored.",
  "manualLayerSplit.lassoSmoothing": "Lasso smoothing",
  "manualLayerSplit.lassoSmoothing.off": "Off",
  "manualLayerSplit.lassoSmoothing.low": "Low",
  "manualLayerSplit.lassoSmoothing.medium": "Medium",
  "manualLayerSplit.lassoSmoothing.high": "High",
  "manualLayerSplit.lassoPrecision": "Precision mode",
  "manualLayerSplit.lassoWarning.tooFewPoints":
    "Lasso stroke was too short. Draw a wider closed region.",
  "manualLayerSplit.lassoWarning.pointLimitReduced":
    "The lasso stroke was simplified because it contained many points.",
  "manualLayerSplit.lassoWarning.detailReducedForSmoothing":
    "Some detail was reduced for smoothing. Lower smoothing or zoom in for fine edges.",
  "manualLayerSplit.lassoWarning.areaDeltaTooLarge":
    "Smoothing was reduced because the selected area changed too much.",
  "manualLayerSplit.lassoWarning.boundsDriftTooLarge":
    "Smoothing was reduced because the path moved too far from the stroke.",
  "manualLayerSplit.lassoWarning.selfIntersectionSuspected":
    "The lasso crossed itself, so the stroke was not applied.",
  "manualLayerSplit.lassoWarning.smoothingFallbackToRaw":
    "Smoothing was skipped for this stroke, so the raw lasso path was used.",
  "manualLayerSplit.lassoWarning.degenerateStroke":
    "The lasso area was too small to apply.",
  "manualLayerSplit.lassoWarning.nonFinitePointDropped":
    "Some invalid pointer samples were ignored.",
  "manualPngSplit.modeAdd": "Add",
  "manualPngSplit.modeSubtract": "Subtract",
  "manualPngSplit.modeReplace": "Replace",
  "manualPngSplit.refineRadius": "Refine radius",
  "manualPngSplit.wandTolerance": "Wand tolerance",
  "manualPngSplit.growMask": "Grow",
  "manualPngSplit.shrinkMask": "Shrink",
  "manualPngSplit.featherMask": "Feather",
  "manualPngSplit.fillHoles": "Fill holes",
  "manualPngSplit.removeIslands": "Remove islands",
  "manualPngSplit.resolveOverlap": "Assign overlap here",
  "manualPngSplit.undo": "Undo",
  "manualPngSplit.redo": "Redo",
  "manualPngSplit.clearActive": "Clear active",
  "manualPngSplit.clearAll": "Clear all",
  "manualPngSplit.pixels": "px",
  "manualPngSplit.createLayers": "Create split layers",
  "manualPngSplit.needAtLeastTwoMasks":
    "Paint at least two part masks before creating split layers.",
  "manualPngSplit.noUsableMasks":
    "No usable split layers were created. Paint larger masks and try again.",
  "manualPngSplit.created": "Created manual split layers.",

  "seethrough.depthRig.summary":
    "Depth-to-rig hints: blocking {blocking} | warning {warning} | info {info}",
  "seethrough.depthRig.blockingQualityErrors":
    "{count} import quality error(s) should be fixed before rigging.",
  "seethrough.depthRig.cleanupUnknownRole":
    "{layerName} still has an unknown role. Resolve its role before auto-rigging.",
  "seethrough.depthRig.coarseBackLayer":
    "{layerName} can usually stay on the lighter cleanup path.",
  "seethrough.depthRig.eyeRigReady": "Eye parts are ready for the eye rig helper.",
  "seethrough.depthRig.frontFineControl":
    "{layerName} will likely benefit from finer deformation control.",
  "seethrough.depthRig.incompleteEyebrowFamily":
    "Eyebrow layers are incomplete on one side. Symmetric face rigging may be unstable.",
  "seethrough.depthRig.incompleteEyeFamily":
    "Eye layers are incomplete on one side. Symmetric face rigging may be unstable.",
  "seethrough.depthRig.mouthRigReady": "Mouth layers are ready for the mouth rig helper.",
  "seethrough.depthRig.physicsBackLayer":
    "{layerName} is a good candidate for later physics setup.",

  "errorBoundary.title": "An unexpected error occurred",
  "errorBoundary.description": "The application encountered an error.",
  "errorBoundary.reload": "Reload",
  "errorBoundary.tryAgain": "Try again",
  "errorBoundary.errorId": "Error ID:",
  "errorBoundary.panelTitle": "Panel error:",

  "notifications.regionLabel": "Notifications",
  "notifications.closeLabel": "Dismiss notification",

  "quickActions.title": "Quick Actions",
  "quickActions.searchLabel": "Search actions",
  "quickActions.searchPlaceholder": "Type an action name...",
  "quickActions.noResults": "No actions match the current query.",
  "quickActions.dialogActionBadge": "Dialog",
  "quickActions.section.project": "Project / Setup",
  "quickActions.section.timeline": "Timeline / Motion",
  "quickActions.section.view": "View / Tools",
  "quickActions.section.workspace": "Workspace",
  "quickActions.requiresProject": "A project must be loaded first.",
  "quickActions.requiresClip": "Select an active clip first.",
  "quickActions.reason.referenceOverlaySelection":
    "Select a ViviMesh to compare against its reference.",
  "quickActions.reason.referenceOverlayImportedBounds":
    "The selected ViviMesh requires See-through import metadata.",
  "quickActions.reason.meshHeatmapSelection":
    "Select a ViviMesh and switch to clip-target mesh edit to preview the mesh heatmap.",
  "quickActions.reason.autoMeshSelection": "Select a ViviMesh to rebuild its auto mesh.",
  "quickActions.reason.autoMeshTexture":
    "The selected ViviMesh requires texture data before rebuilding.",
  "quickActions.reason.autoWeightSkin":
    "The selected ViviMesh requires an existing skin binding.",
  "quickActions.reason.boneSelection": "Select a bone to remove it.",
  "quickActions.reason.orphanSkinsMissing": "No orphan skins were found.",
  "quickActions.reason.parameterBindingCleanup":
    "No stale parameter bindings need cleanup.",
  "quickActions.reason.stateMachineCleanup":
    "No stale state machine references need cleanup.",
  "quickActions.reason.sceneBlendCleanup": "No stale scene blends need cleanup.",
  "quickActions.reason.animationTrackCleanup": "No stale animation tracks need cleanup.",
  "quickActions.reason.seeThroughProjectRequired":
    "A See-through imported project is required.",
  "quickActions.reason.autoSetupQuickActionRunning":
    "Another Auto Setup quick action is already running.",
  "quickActions.reason.seeThroughImportedLayerRequired":
    "A See-through imported layer is required.",
  "quickActions.action.readyToRig.title": "Run Ready to Rig",
  "quickActions.action.readyToRig.description":
    "Open Auto Setup and run the See-through cleanup and detect flow.",
  "quickActions.action.refineImportedMeshes.title": "Refine imported meshes",
  "quickActions.action.refineImportedMeshes.description":
    "Open Auto Setup and rebuild imported meshes beyond the default quad.",
  "quickActions.action.applyAutomaticEyeClipping.title": "Apply automatic eye clipping",
  "quickActions.action.applyAutomaticEyeClipping.description":
    "Open Auto Setup and create iris-to-eye clipping pairs.",
  "quickActions.action.createBasicEyeRig.title": "Create basic eye rig",
  "quickActions.action.createBasicEyeRig.description":
    "Open Auto Setup and generate managed blink rig assets.",
  "quickActions.action.repairLeftRightRoles.title": "Repair left/right roles",
  "quickActions.action.repairLeftRightRoles.description":
    "Open Auto Setup and repair See-through role assignments.",
  "quickActions.action.createBasicMouthRig.title": "Create basic mouth rig",
  "quickActions.action.createBasicMouthRig.description":
    "Open Auto Setup and create a managed mouth-open rig.",
  "quickActions.action.openPhysicsPanel.title": "Open Physics Panel",
  "quickActions.action.openPhysicsPanel.description":
    "Switch to the rigging workspace and show secondary physics tools.",
  "quickActions.action.openPropertiesPanel.title": "Open Properties Panel",
  "quickActions.action.openPropertiesPanel.description":
    "Switch to the default workspace and inspect layer properties and bindings.",
  "quickActions.action.openStateMachinePanel.title": "Open State Machine Panel",
  "quickActions.action.openStateMachinePanel.description":
    "Switch to the animation workspace and inspect animation state machines.",
  "quickActions.action.openSceneBlendPanel.title": "Open Scene Blend Panel",
  "quickActions.action.openSceneBlendPanel.description":
    "Switch to the default workspace and inspect scene blend transitions.",
  "quickActions.action.openTimelinePanel.title": "Open Timeline Panel",
  "quickActions.action.openTimelinePanel.description":
    "Switch to the animation workspace and inspect timeline tracks.",
  "quickActions.action.cleanParameterBindings.title": "Clean Parameter Bindings",
  "quickActions.action.cleanParameterBindings.description":
    "Remove stale or empty parameter bindings.",
  "quickActions.action.cleanStateMachines.title": "Clean State Machines",
  "quickActions.action.cleanStateMachines.description":
    "Remove stale state machine references and reset broken defaults.",
  "quickActions.action.cleanSceneBlends.title": "Clean Scene Blends",
  "quickActions.action.cleanSceneBlends.description":
    "Remove invalid scene blends and normalize stale durations.",
  "quickActions.action.cleanAnimationTracks.title": "Clean Animation Tracks",
  "quickActions.action.cleanAnimationTracks.description":
    "Remove stale track references from clips and clear broken lip sync targets.",
  "quickActions.action.removeOrphanSkins.title": "Remove orphan skins",
  "quickActions.action.removeOrphanSkins.description":
    "Delete skin data that references missing layers.",
  "quickActions.action.rebuildSelectedMesh.title": "Rebuild selected mesh",
  "quickActions.action.rebuildSelectedMesh.description":
    "Generate a standard auto mesh for the selected ViviMesh.",
  "quickActions.action.autoWeightSelectedMesh.title": "Auto-weight selected mesh",
  "quickActions.action.autoWeightSelectedMesh.description":
    "Recompute skin weights for the selected ViviMesh.",
  "quickActions.action.normalizeSelectedSkinWeights.title":
    "Normalize selected skin weights",
  "quickActions.action.normalizeSelectedSkinWeights.description":
    "Normalize the selected ViviMesh skin weights to sum to 1.",
  "quickActions.action.deleteSelectedBone.title": "Delete Selected Bone",
  "quickActions.action.deleteSelectedBone.description":
    "Remove the selected bone from the project.",
  "quickActions.action.referenceOverlayToggle.enable": "Enable Reference Overlay",
  "quickActions.action.referenceOverlayToggle.disable": "Disable Reference Overlay",
  "quickActions.action.referenceOverlayToggle.description":
    "Toggle the selected mesh reference comparison overlay.",
  "quickActions.action.referenceOverlaySource.title": "Reference Overlay: Source",
  "quickActions.action.referenceOverlaySource.description":
    "Show the undeformed source texture rectangle.",
  "quickActions.action.referenceOverlayCurrentBounds.title":
    "Reference Overlay: Current Bounds",
  "quickActions.action.referenceOverlayCurrentBounds.description":
    "Show the current mesh bounds rectangle.",
  "quickActions.action.referenceOverlayImportedBounds.title":
    "Reference Overlay: Imported Bounds",
  "quickActions.action.referenceOverlayImportedBounds.description":
    "Show the See-through import-time bounding box.",
  "quickActions.action.referenceOverlayBoundsCompare.title":
    "Reference Overlay: Bounds Compare",
  "quickActions.action.referenceOverlayBoundsCompare.description":
    "Overlay the current mesh bounds and the See-through import bounds together.",
  "quickActions.action.referenceOverlayComparePrefix": "Reference Overlay Compare:",
  "quickActions.action.referenceOverlayComparePreset.description":
    "Switch bounds compare to {label}.",
  "quickActions.action.referenceOverlayCompareSwap.title":
    "Reference Overlay Compare: Swap A/B",
  "quickActions.action.referenceOverlayCompareSwap.description":
    "Swap the current compare A and compare B modes.",
  "quickActions.action.referenceOverlayPinCompareSummary.enable":
    "Pin Reference Overlay Compare Summary",
  "quickActions.action.referenceOverlayPinCompareSummary.disable":
    "Unpin Reference Overlay Compare Summary",
  "quickActions.action.referenceOverlayPinCompareSummary.description":
    "Keep the compare summary visible even when the overlay mode changes away from compare.",
  "quickActions.action.referenceOverlayOpacity25.title": "Reference Overlay Opacity: 25%",
  "quickActions.action.referenceOverlayOpacity25.description":
    "Set the reference overlay opacity to 25% and keep the current mode.",
  "quickActions.action.referenceOverlayOpacity50.title": "Reference Overlay Opacity: 50%",
  "quickActions.action.referenceOverlayOpacity50.description":
    "Set the reference overlay opacity to 50% and keep the current mode.",
  "quickActions.action.referenceOverlayOpacity75.title": "Reference Overlay Opacity: 75%",
  "quickActions.action.referenceOverlayOpacity75.description":
    "Set the reference overlay opacity to 75% and keep the current mode.",
  "quickActions.action.referenceOverlayOpacity100.title":
    "Reference Overlay Opacity: 100%",
  "quickActions.action.referenceOverlayOpacity100.description":
    "Set the reference overlay opacity to 100% and keep the current mode.",
  "quickActions.action.meshHeatmapToggle.enable": "Enable Mesh Heatmap",
  "quickActions.action.meshHeatmapToggle.disable": "Disable Mesh Heatmap",
  "quickActions.action.meshHeatmapToggle.description":
    "Toggle the clip-target mesh heatmap overlay.",
  "quickActions.action.meshHeatmapIntensity50.title": "Mesh Heatmap Intensity: 50%",
  "quickActions.action.meshHeatmapIntensity50.description":
    "Enable the heatmap and set intensity to 50%.",
  "quickActions.action.meshHeatmapIntensity100.title": "Mesh Heatmap Intensity: 100%",
  "quickActions.action.meshHeatmapIntensity100.description":
    "Enable the heatmap and set intensity to 100%.",
  "quickActions.action.meshHeatmapIntensity150.title": "Mesh Heatmap Intensity: 150%",
  "quickActions.action.meshHeatmapIntensity150.description":
    "Enable the heatmap and set intensity to 150%.",
  "quickActions.action.meshHeatmapIntensity200.title": "Mesh Heatmap Intensity: 200%",
  "quickActions.action.meshHeatmapIntensity200.description":
    "Enable the heatmap and set intensity to 200%.",

  "imageImportOptions.title.openProject": "Open Image Options",
  "imageImportOptions.title.importLayer": "Import Image Options",
  "imageImportOptions.title.importLayers": "Import Images Options",
  "imageImportOptions.title.importFolder": "Import Folder Options",
  "imageImportOptions.description.openProject":
    "Choose how the PNG should be placed when opening it as a new project.",
  "imageImportOptions.description.importLayer":
    "Choose how the PNG should be placed when importing it into the current project.",
  "imageImportOptions.description.importLayers":
    "Choose how imported PNG layers should be placed in the current project.",
  "imageImportOptions.description.importFolder":
    "Choose how PNG layers from the selected folder should be placed in the current project.",
  "imageImportOptions.centerOnCanvas": "Center on canvas",
  "imageImportOptions.trimTransparentBounds": "Trim transparent bounds",
  "imageImportOptions.createGroupForImportedLayers": "Create group for imported layers",
  "imageImportOptions.autoGenerateMesh": "Auto-generate mesh",
  "imageImportOptions.dragDropUsesDefaults":
    "PNG drag and drop continues to use the default import options.",
  "imageImportOptions.largeImageAutoCentered":
    "The imported image is much larger than the current canvas. Center on canvas was applied automatically.",
  "imageImportOptions.transparentPaddingWarning":
    "The imported image has large transparent padding. Enable Trim transparent bounds if it appears off-screen.",
  "imageImportOptions.focusedViewportOnImport":
    "Focused the viewport on the imported layer.",
  "imageImportOptions.focusedViewportOnImportMultiple":
    "Focused the viewport on the imported layers.",
  "imageImportOptions.emptyPngFolder":
    "Selected folder does not contain any PNG files.",
  "imageImportOptions.projectRequiredForLayer":
    "A project must be open before importing an image layer.",
  "imageImportOptions.projectRequiredForLayers":
    "A project must be open before importing image layers.",
  "imageImportOptions.failedToBuildPngProject": "Failed to build PNG project.",
  "imageImportOptions.reimportProjectRequired":
    "A project must be open before reimporting an image layer.",
  "imageImportOptions.reimportEligibility":
    "Select a manual PNG-imported ViviMesh before reimporting.",
  "imageImportOptions.reimportSourceMissing":
    "The selected imported PNG layer does not have a source path to reimport.",
  "imageImportOptions.reimportMismatch":
    "The reimported PNG no longer matches the current layer bounds. Import it as a new layer instead.",
  "imageImportOptions.reimportedPrefix": "Reimported",

  "autoSetup.detectDescription":
    "Analyze the current project and generate a starting point for bones, meshes, weights, and helper rig setup.",
  "autoSetup.title": "Auto Setup",
  "autoSetup.recommendedFlow": "Recommended flow",
  "autoSetup.projectSummary": "Project summary",
  "autoSetup.helperActions": "Helper fixes",
  "autoSetup.settings": "Settings",
  "autoSetup.generationPlan": "Generation plan",
  "autoSetup.detailLevel": "Detect detail level",
  "autoSetup.modeBeginner": "Beginner",
  "autoSetup.modeAdvanced": "Advanced",
  "autoSetup.advancedSettingsActive": "Advanced settings are active.",
  "autoSetup.resumed": "Resumed from a previous auto-setup session.",
  "autoSetup.startOver": "Start over",
  "autoSetup.weightProgress": "Weight calculation progress",
  "autoSetup.target": "Target",
  "autoSetup.seeThroughAssistedSetup": "See-through assisted setup",
  "autoSetup.importedViviMeshes": "Imported ViviMeshes",
  "autoSetup.classifiedRoles": "Classified roles",
  "autoSetup.unknownRoles": "Unknown roles",
  "autoSetup.accessories": "Accessories",
  "autoSetup.errors": "Errors",
  "autoSetup.warnings": "Warnings",
  "autoSetup.info": "Info",
  "autoSetup.projectIssues": "Project issues",
  "autoSetup.importedLayersNeedReview": "imported layer(s) need review.",
  "autoSetup.setupChecklist": "Setup checklist",
  "autoSetup.checklistAriaSuffix": "setup checklist",
  "autoSetup.depthRigAriaSuffix": "depth-to-rig hints",
  "autoSetup.occlusionAwareMeshDensity": "Occlusion-aware mesh density",
  "autoSetup.useOcclusionAwareMeshDensity": "Use occlusion-aware mesh density",
  "autoSetup.eyeClippingRelationsApplied": "eye clipping relation(s) applied.",
  "autoSetup.noEyeClippingChanges": "No eye clipping changes were needed.",
  "autoSetup.blinkParametersCreated": "blink parameter(s) created.",
  "autoSetup.eyeControlBonesCreated": "eye control bone(s) created.",
  "autoSetup.legacyEyeRigAssetsRelinked": "legacy eye rig asset(s) re-linked.",
  "autoSetup.noEyeRigChanges": "No eye rig changes were needed.",
  "autoSetup.mouthParametersCreated": "mouth parameter(s) created.",
  "autoSetup.mouthControlBonesCreated": "mouth control bone(s) created.",
  "autoSetup.lipSyncTargetAssigned": "Lip-sync target assigned to Mouth Open.",
  "autoSetup.noMouthRigChanges": "No mouth rig changes were needed.",
  "autoSetup.leftRightRoleAssignmentsAdded": "left/right role assignment(s) added.",
  "autoSetup.leftRightRoleRepairsApplied": "left/right role repair(s) applied.",
  "autoSetup.noLeftRightRoleChanges": "No left/right role changes were needed.",
  "autoSetup.recommendationsApplied": "See-through recommendations applied",
  "autoSetup.useRecommendations": "Use See-through recommendations",
  "autoSetup.applyEyeClipping": "Apply automatic eye clipping",
  "autoSetup.createEyeRig": "Create basic eye rig",
  "autoSetup.repairLeftRightRoles": "Repair left/right roles",
  "autoSetup.createMouthRig": "Create basic mouth rig",
  "autoSetup.readyPreparing": "Preparing rigging setup...",
  "autoSetup.readyToRig": "Ready to Rig",
  "autoSetup.openDepthInspector": "Open Depth Inspector",
  "autoSetup.openPhysicsPanel": "Open Physics Panel",
  "autoSetup.planUnsupported": "Auto Setup plan contains unsupported operations.",
  "autoSetup.previewStale":
    "Preview was not updated because the selected exclusions changed. Please preview again.",
  "autoSetup.unsupportedHost":
    "This host does not provide the required SHA-256 audit hash capability.",
  "autoSetup.applyFailed": "Auto Setup apply failed.",
  "autoSetup.skippedRiskyWeights":
    "Auto Setup skipped risky weights to preserve the source image.",
  "autoSetup.skippedManagedObjects":
    "Auto Setup skipped managed objects that were edited or came from a different source.",
  "autoSetup.warning.side.left": "left",
  "autoSetup.warning.side.right": "right",
  "autoSetup.warning.family.eye": "Eye",
  "autoSetup.warning.family.eyebrow": "Eyebrow",
  "autoSetup.warning.family.arm": "Arm",
  "autoSetup.warning.family.hand": "Hand",
  "autoSetup.warning.family.leg": "Leg",
  "autoSetup.warning.faceHeadMissing": "Face/head layers are missing.",
  "autoSetup.warning.mouthMissing": "Mouth layers are missing.",
  "autoSetup.warning.bodyMissing": "Body layers are missing.",
  "autoSetup.warning.eyeMissing": "One or both eye layers are missing.",
  "autoSetup.warning.readyNameEmpty":
    'Skipped imported name cleanup for "{layer}" because the stripped name would be empty.',
  "autoSetup.warning.readyNameCollision":
    'Skipped imported name cleanup for "{layer}" because "{target}" would collide with another layer name.',
  "autoSetup.warning.readySingletonAmbiguous":
    "Skipped automatic assignment for {role} because {count} imported layers match that singleton role.",
  "autoSetup.warning.leftRightMultipleSide":
    "{family} {side} still appears multiple times.",
  "autoSetup.warning.leftRightOnlyOneSide":
    "{family} roles still cover only one side.",
  "autoSetup.warning.leftRightLowConfidence":
    'Skipped left/right repair for "{layer}" because import confidence is below {threshold}.',
  "autoSetup.warning.leftRightSideConflict":
    'Skipped left/right repair for "{layer}" because import side metadata conflicts with the raw label.',
  "autoSetup.warning.leftRightUnsupportedRole":
    'Preserved "{layer}" because its current role {role} is outside the supported left/right families.',
  "autoSetup.warning.leftRightDifferentFamily":
    'Preserved "{layer}" because its current role {role} belongs to a different semantic family.',
  "autoSetup.warning.leftRightProtectedRole":
    'Preserved "{layer}" because its current {role} role is protected from automatic left/right override.',
  "autoSetup.warning.eyeClippingNoIris":
    "Skipped {side} eye clipping because no imported iris layer was found.",
  "autoSetup.warning.eyeClippingMultipleIris":
    "Skipped {side} eye clipping because {count} imported iris layers were found.",
  "autoSetup.warning.eyeClippingNoWhite":
    "Skipped {side} eye clipping because no imported eye-white layer was found.",
  "autoSetup.warning.eyeClippingMultipleWhite":
    "Skipped {side} eye clipping because {count} imported eye-white layers were found.",
  "autoSetup.warning.eyeClippingAlreadyMasked":
    "Skipped {side} eye clipping because {layer} already has clip masks.",
  "autoSetup.warning.eyeControlsNoIris":
    "Skipped {side} eye controls because no imported iris layer was found.",
  "autoSetup.warning.eyeControlsMultipleIris":
    "Skipped {side} eye controls because {count} imported iris layers were found.",
  "autoSetup.warning.eyeControlsNoWhite":
    "Skipped {side} eye controls because no imported eye-white layer was found.",
  "autoSetup.warning.eyeControlsMultipleWhite":
    "Skipped {side} eye controls because {count} imported eye-white layers were found.",
  "autoSetup.warning.eyeControlsNotClipped":
    "Skipped {side} eye controls because {layer} is not clipped by {mask}.",
  "autoSetup.warning.eyeControlsMultipleManagedParameters":
    "Skipped {side} eye controls because multiple managed blink parameters were found.",
  "autoSetup.warning.eyeControlsMultipleManagedBones":
    "Skipped {side} eye controls because multiple managed control bones were found.",
  "autoSetup.warning.eyeControlsParameterExists":
    "Skipped {side} eye controls because {parameter} already exists as a user-owned parameter.",
  "autoSetup.warning.mouthControlsMultipleLayers":
    "Skipped mouth controls because {count} imported mouth layers were found.",
  "autoSetup.warning.mouthControlsMultipleManagedParameters":
    "Skipped mouth controls because multiple managed mouth parameters were found.",
  "autoSetup.warning.mouthControlsMultipleManagedBones":
    "Skipped mouth controls because multiple managed mouth control bones were found.",
  "autoSetup.warning.mouthControlsParameterExists":
    "Skipped mouth controls because {parameter} already exists as a user-owned parameter.",
  "autoSetup.warning.mouthControlsPreservedLipSyncTarget":
    "Preserved existing lip-sync parameter target and did not rewire Mouth Open automatically.",
  "autoSetup.generateBones": "Generate bones",
  "autoSetup.generateMeshes": "Auto-generate mesh",
  "autoSetup.generateWeights": "Auto-calculate weights",
  "autoSetup.generatePhysics": "Generate physics settings",
  "autoSetup.meshDensity": "Mesh density",
  "autoSetup.minConfidence": "Minimum confidence",
  "autoSetup.processing": "Processing...",
  "autoSetup.detectStart": "Start detection",
  "autoSetup.detectedResults": "Detection results",
  "autoSetup.itemCountSuffix": "item(s)",
  "autoSetup.recommendedExclusionsApplied":
    "Recommended exclusions are applied for accessory and unknown parts.",
  "autoSetup.restoreRecommendedExclusions": "Restore recommended exclusions",
  "autoSetup.importedNamesNormalized": "imported name(s) normalized.",
  "autoSetup.roleAssignmentsAdded": "role assignment(s) added.",
  "autoSetup.noCleanupChanges": "No cleanup changes were needed.",
  "autoSetup.enabledColumn": "Enabled",
  "autoSetup.layerNameColumn": "Layer name",
  "autoSetup.typeColumn": "Type",
  "autoSetup.confidenceColumn": "Confidence",
  "autoSetup.noPartsDetected":
    "No parts were detected. Check the layer names and try again.",
  "autoSetup.back": "Back",
  "autoSetup.preview": "Preview",
  "autoSetup.generatedPreview": "Generated preview",
  "autoSetup.debugTitle": "Auto Setup debug",
  "autoSetup.debugToggleTitle": "Detailed diagnostics",
  "autoSetup.debugToggleDescription":
    "Open this when recording or reviewing the safe auto-setup pipeline.",
  "autoSetup.debugShow": "Show details",
  "autoSetup.debugHide": "Hide details",
  "autoSetup.debugDescription":
    "Visible debug overlay for the new Layer Graph -> Safe Plan -> audited apply pipeline.",
  "autoSetup.debugBadge": "new visible diagnostics",
  "autoSetup.debugFlowAria": "Auto Setup safety pipeline flow",
  "autoSetup.debugFlowLayerGraph": "Layer Graph",
  "autoSetup.debugFlowSafetyGates": "Safety gates",
  "autoSetup.debugFlowSafePlan": "Safe Plan",
  "autoSetup.debugFlowAudit": "Audit trace",
  "autoSetup.debugFlowMotionHandles": "Motion Handles",
  "autoSetup.debugVisibleChange":
    "Debug overlay enabled: this is the visible marker for the new safe auto-setup path.",
  "autoSetup.debugMapTitle": "Rig map preview",
  "autoSetup.debugMapDescription":
    "Colored boxes are detected target layers; bright points and links are generated bones.",
  "autoSetup.debugMapParts": "detected layer boxes",
  "autoSetup.debugMapBones": "generated bones",
  "autoSetup.debugGeneratedBones": "generated bones",
  "autoSetup.debugTargetLayers": "target layers",
  "autoSetup.debugSkinSolvers": "skin operation modes",
  "autoSetup.debugSolverRigid": "rigid",
  "autoSetup.debugSolverSecondary": "secondary",
  "autoSetup.debugSolverBbw": "review-gated",
  "autoSetup.debugBlockedBbw": "held advanced ops",
  "autoSetup.debugFromSafePlan": "from SafeAutoSetupPlan",
  "autoSetup.debugMoreTargets": "+{count} more",
  "autoSetup.debugNoTargets": "no target layers",
  "autoSetup.debugBbwHeld": "waiting for review gate",
  "autoSetup.debugBbwClear": "no holdback",
  "autoSetup.debugAuditHash": "audit hash",
  "autoSetup.debugAuditNodes": "accepted / rejected nodes",
  "autoSetup.debugAuditOperations": "traced operations",
  "autoSetup.bones": "Bones",
  "autoSetup.parameters": "Parameters",
  "autoSetup.meshes": "Meshes",
  "autoSetup.layersUnit": "layer(s)",
  "autoSetup.verticesUnit": "vertices",
  "autoSetup.trianglesUnit": "triangles",
  "autoSetup.weights": "Weights",
  "autoSetup.weightSolverInfo":
    "Static skin weights are compiled through controller-rig Safe Auto Setup.",
  "autoSetup.bbwReviewGate":
    "Advanced skin output is held back until the review gate is complete; safe rigid/controller operations can still apply.",
  "autoSetup.weightModeBadge": "review-gated",
  "autoSetup.layerGraphReview": "Layer graph safety review",
  "autoSetup.layerGraphNodes": "proposal nodes",
  "autoSetup.layerGraphOcclusionEdges": "occlusion edges",
  "autoSetup.layerGraphBlockingGates": "blocking gates",
  "autoSetup.auditTraceReady": "Audit trace:",
  "autoSetup.motionHandleReview": "Motion handle review",
  "autoSetup.motionHandleDescription":
    "Accepted split layers are converted into motion regions. Moving regions compile to ordinary bones and static skin weights only.",
  "autoSetup.motionRegions": "motion regions",
  "autoSetup.motionHandles": "motion handles",
  "autoSetup.motionProtectedRegions": "protected regions",
  "autoSetup.motionProtected": "protected",
  "autoSetup.motionSuggestionStats": "auto / review",
  "autoSetup.motionSuggestionWarnings": "suggestion warnings",
  "autoSetup.motionSuggestionStatus.apply": "auto-applicable",
  "autoSetup.motionSuggestionStatus.review": "needs review",
  "autoSetup.motionSuggestionStatus.rejected": "no suggestion",
  "autoSetup.motionSuggestionConfidence.low": "low confidence",
  "autoSetup.motionSuggestionConfidence.medium": "medium confidence",
  "autoSetup.motionSuggestionConfidence.high": "high confidence",
  "autoSetup.motionSuggestionWarning.roundMask": "ambiguous shape",
  "autoSetup.motionSuggestionWarning.smallMask": "small region",
  "autoSetup.motionSuggestionWarning.multiLobeMask": "multiple lobes",
  "autoSetup.motionSuggestionWarning.protectedFaceAdjacent": "near face",
  "autoSetup.motionSuggestionWarning.weakAdjacency": "weak attachment",
  "autoSetup.motionSuggestionWarning.lowConfidence": "low confidence",
  "autoSetup.motionSuggestionWarning.manualReviewRequired": "manual review required",
  "autoSetup.motionSuggestionSource.acceptedMask": "accepted split mask",
  "autoSetup.motionSuggestionSource.pseudoMask": "bounds fallback",
  "autoSetup.motionSuggestionSource.invalidMask": "mask unavailable",
  "autoSetup.motionDiscardNote":
    "Saved output contains only bones, static skin weights, physics groups, and managed signatures. Preview vertices and experimental helpers are discarded.",
  "autoSetup.safeOperationsSummary": "Saved safe operations",
  "autoSetup.safeOperation.addBone": "bones",
  "autoSetup.safeOperation.parentBone": "bone links",
  "autoSetup.safeOperation.createSkin": "static skins",
  "autoSetup.safeOperation.createPhysicsGroup": "physics groups",
  "autoSetup.safeOperation.rigidLayer": "rigid layers",
  "autoSetup.safeOperation.cleanup": "cleanup pairs",
  "autoSetup.discardedPreviewCategories": "Discarded preview-only data",
  "autoSetup.motionStressChecks": "Motion stress checks",
  "autoSetup.discardedPreviewCategory.motionPreviewData": "motion preview",
  "autoSetup.discardedPreviewCategory.previewGeometryData": "temporary preview information",
  "autoSetup.discardedPreviewCategory.internalAlgorithmData": "internal helper data",
  "autoSetup.discardedPreviewCategory.stressDiagnosticData": "stress diagnostics",
  "autoSetup.motionStressCheck.protectedArea": "Protected area",
  "autoSetup.motionStressCheck.duplicateOutline": "Duplicate outline",
  "autoSetup.motionStressCheck.hiddenReveal": "Hidden reveal",
  "autoSetup.motionStressCheck.restConsistency": "Rest consistency",
  "autoSetup.motionStressCheck.incompleteCheck": "Incomplete check",
  "autoSetup.motionStressAction.pass": "No extra action is needed.",
  "autoSetup.motionStressAction.protectedArea": "Review face-adjacent motion or reduce motion.",
  "autoSetup.motionStressAction.duplicateOutline": "Review duplicate-outline cleanup.",
  "autoSetup.motionStressAction.hiddenReveal": "Accept underpaint or reduce motion.",
  "autoSetup.motionStressAction.restConsistency": "Review handles or motion strength.",
  "autoSetup.motionStressAction.incompleteCheck": "Use a smaller motion range and retry.",
  "autoSetup.cleanupComparisonTitle": "Cleanup comparison",
  "autoSetup.cleanupComparison.none": "No cleanup",
  "autoSetup.cleanupComparison.lowerHoldout": "Lower holdout",
  "autoSetup.cleanupComparison.featherHoldout": "Feather holdout",
  "autoSetup.cleanupComparison.duplicateOutlineSuppression": "Duplicate outline suppression",
  "autoSetup.cleanupComparison.acceptedUnderpaintReveal": "Accepted underpaint reveal",
  "autoSetup.cleanupComparisonStatus.preferred": "preferred",
  "autoSetup.cleanupComparisonStatus.recommended": "candidate",
  "autoSetup.cleanupComparisonStatus.available": "available",
  "autoSetup.cleanupComparisonStatus.blocked": "not recommended",
  "autoSetup.motionHandleEditor": "Motion handle editor",
  "autoSetup.motionHandleEditorDescription":
    "Move root/tip handles inside each region. Apply converts them to ordinary bones and static skin weights.",
  "autoSetup.motionHandleMap": "Motion handle map",
  "autoSetup.motionSelectedHandle": "Selected handle",
  "autoSetup.motionHandleX": "Horizontal position",
  "autoSetup.motionHandleY": "Vertical position",
  "autoSetup.motionNoEditableHandles":
    "No editable motion handles are available for the current split layers.",
  "autoSetup.qualityGate.restRecomposeDelta": "Rest recomposition",
  "autoSetup.qualityGate.protectedCropDelta": "Protected crop",
  "autoSetup.qualityGate.stressPoseDelta": "Stress pose",
  "autoSetup.qualityGate.duplicateContourScore": "Duplicate contour",
  "autoSetup.qualityGate.duplicateOutline": "Duplicate outline",
  "autoSetup.qualityGate.alphaHaloScore": "Alpha halo",
  "autoSetup.qualityGate.hiddenRevealScore": "Hidden reveal",
  "autoSetup.qualityGate.runtimeProfileScan": "Runtime profile",
  "autoSetup.qualityGate.providerBoundaryScan": "Provider boundary",
  "autoSetup.gateStatus.pass": "Passed",
  "autoSetup.gateStatus.warning": "Needs review",
  "autoSetup.gateStatus.fail": "Blocked",
  "autoSetup.gateStatus.notRun": "Not run",
  "autoSetup.motionRisk": "Motion safety score",
  "autoSetup.motionRiskDescription":
    "Vivi2D checks overlap with face/body layers and automatically reduces secondary motion when duplicate-line or hole risk is high.",
  "autoSetup.riskScore": "risk",
  "autoSetup.motionScale": "motion scale",
  "autoSetup.occlusionCleanupReport": "Duplicate-line and underpaint preview",
  "autoSetup.occlusionCleanupDescription":
    "Compare no cleanup, holdout, feathering, duplicate-outline suppression, and underpaint.",
  "autoSetup.cleanupPairs": "cleanup pairs",
  "autoSetup.cleanupForegrounds": "foregrounds",
  "autoSetup.cleanupMaxStrength": "max strength",
  "autoSetup.cleanupStrength": "cleanup strength",
  "autoSetup.cleanupOperation.foreground-edge": "foreground edge fix",
  "autoSetup.cleanupOperation.lower-holdout": "lower holdout",
  "autoSetup.cleanupOperation.underpaint": "underpaint",
  "autoSetup.cleanupOperation.motion-sweep": "motion sweep",
  "autoSetup.cleanupOperation.duplicate-contour": "duplicate contour",
  "autoSetup.physicsGroups": "Physics groups",
  "autoSetup.boneCountUnit": "bone(s)",
  "autoSetup.parameterCountUnit": "parameter(s)",
  "autoSetup.groupCountUnit": "group(s)",
  "autoSetup.stiffness": "stiffness",
  "autoSetup.gravity": "gravity",
  "autoSetup.damping": "damping",
  "autoSetup.status.done": "Done",
  "autoSetup.status.partial": "Partial",
  "autoSetup.status.pending": "Pending",
  "autoSetup.status.blocked": "Blocked",
  "autoSetup.status.na": "N/A",
  "dialog.loading": "Loading dialog",
} as const;
