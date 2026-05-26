export const dialog = {
  "export.spineTitle": "Spine JSON エクスポート",
  "export.noViviMesh": "ViviMesh がありません",
  "export.outputFiles": "出力ファイル",
  "export.bonesSkinAnims": "ボーン・スキン・アニメーション",
  "export.textureAtlas": "テクスチャアトラス",
  "export.selectingDest": "保存先を選択しています...",
  "export.generatingData": "書き出しデータを生成しています...",
  "export.writingFiles": "ファイルを書き出しています...",
  "export.layers": "レイヤー",
  "export.animations": "アニメーション",
  "export.fileCountSuffix": "ファイル",
  "export.writingFileCountSuffix": "ファイルを書き出しています...",
  "export.completedPrefix": "エクスポート完了:",
  "export.failedPrefix": "エクスポート失敗:",

  "media.title": "メディア書き出し",
  "media.pngSequence": "PNG 連番",
  "media.video": "動画 (WebM/MP4)",
  "media.clip": "クリップ",
  "media.noClips": "書き出せるクリップがありません",
  "media.format": "形式",
  "media.rendering": "レンダリング中",
  "media.encoding": "エンコード中",
  "media.saving": "保存中",
  "media.pixiMissing": "PixiJS アプリケーションが見つかりません",
  "media.pngExportedSuffix": "枚の PNG をエクスポートしました",
  "media.videoExported": "動画をエクスポートしました",
  "media.exportFailedPrefix": "エクスポート失敗:",
  "media.unknownError": "不明なエラー",
  "media.duration": "再生時間",
  "media.seconds": "秒",
  "media.frameCount": "フレーム数",
  "media.framesShort": "フレーム",
  "media.fps": "FPS",
  "media.output": "出力",
  "media.pngFileCountSuffix": "枚の PNG ファイル",
  "media.webmVideoFile": "WebM 動画ファイル",

  "validation.title": "モデル検証",
  "validation.noIssues": "問題は見つかりませんでした",
  "validation.category.emptyMesh": "空メッシュ",
  "validation.category.meshIndexBounds": "メッシュインデックス範囲外",
  "validation.category.orphanSkin": "孤立スキン",
  "validation.category.unboundVertices": "未バインド頂点",
  "validation.category.unusedBone": "未使用ボーン",
  "validation.category.weightNormalization": "ウェイト正規化",

  "reimport.title": "PSD 再読み込み",
  "reimport.info1": "差分を確認する PSD ファイルを選択してください。",
  "reimport.info2": "レイヤー名で対応付けし、テクスチャと位置を更新します。",
  "reimport.info3": "パラメータ、制御ガイド、バインディングポイントは保持されます。",
  "reimport.analyzing": "解析中...",
  "reimport.selectPsd": "PSD ファイルを選択",
  "reimport.noChanges": "変更はありません。",
  "reimport.keptNote": "以下はプロジェクトに残ります（削除されません）",
  "reimport.parseFailedPrefix": "PSD解析失敗:",
  "reimport.completedPrefix": "PSD再インポート完了:",
  "reimport.updatedCountSuffix": "件更新",
  "reimport.addedCountSuffix": "件追加",
  "reimport.failedPrefix": "再インポート失敗:",
  "reimport.updated": "更新",
  "reimport.added": "新規追加",
  "reimport.removedFromPsd": "PSDから消失",

  "integration.settings": "設定...",
  "integration.obsTitle": "OBS Studio WebSocket 接続",
  "integration.obsDialogTitle": "OBS Studio 接続設定",
  "integration.obsUrl": "OBS WebSocket 接続先",
  "integration.obsPassword": "パスワード",
  "integration.obsPasswordPlaceholder": "未設定なら空欄のままにします",
  "integration.obsNotice":
    "OBS Studio で WebSocket サーバーを有効にしてください（ツール > WebSocket Server Settings）。",
  "integration.vtsTitle": "VTube Studio API 接続",
  "integration.vtsDialogTitle": "VTube Studio 接続設定",
  "integration.vtsUrl": "VTube Studio API 接続先",
  "integration.vtsNotice":
    "VTube Studio が起動していることを確認してください。初回接続時はプラグイン認可が必要です。",

  "ai.menuLabel": "ComfyUI",
  "ai.generate": "モデル生成...",
  "ai.generateTitle": "画像またはプロンプトからモデルを自動生成",
  "ai.comfyuiSettings": "ComfyUI 設定...",
  "ai.comfyuiSettingsTitle": "ComfyUI 接続設定",
  "ai.dialogTitle": "自動モデル生成",
  "ai.tabImage": "画像から",
  "ai.tabPrompt": "プロンプトから",
  "ai.imageModeNotice":
    "画像ファイルを選択すると、See-through 分解から自動モデル生成まで開始します。",
  "ai.prompt": "プロンプト",
  "ai.promptDefault": "アニメ風の女の子、全身、白背景、シンプルな服装",
  "ai.promptPlaceholder": "アニメ風の女の子、全身、白背景...",
  "ai.negativePrompt": "ネガティブプロンプト",
  "ai.negativePromptDefault": "低品質、最低品質、ぼやけ",
  "ai.seed": "シード",
  "ai.resolution": "解像度",
  "ai.steps": "ステップ数",
  "ai.recommended": "推奨",
  "ai.licenseNotice":
    "ComfyUI が必要です。Vivi2D compat または従来の See-through workflow を使用します。",
  "ai.selectImageAndGenerate": "画像を選んで生成",
  "ai.startGenerate": "生成を開始",
  "ai.generating": "生成中...",
  "ai.uploading": "画像をアップロードしています...",
  "ai.decomposing": "See-through 分解を開始しています...",
  "ai.processing": "処理中...",
  "ai.downloading": "結果をダウンロードしています...",
  "ai.loadingPsd": "PSD を読み込んでいます...",
  "ai.complete": "完了",
  "ai.modelGenerated": "モデル生成が完了しました",
  "ai.error": "エラー",
  "ai.timeout": "タイムアウト: 10 分以内に処理が完了しませんでした",
  "ai.workflowError": "ComfyUI ワークフローがエラーで終了しました",
  "ai.psdNotFound": "PSD ファイルが見つかりません",
  "ai.noOutput": "ComfyUI から出力を取得できませんでした",
  "ai.comfyuiTitle": "ComfyUI 接続設定",
  "ai.comfyuiUrl": "ComfyUI 接続先",
  "ai.testConnection": "接続を確認",
  "ai.testing": "確認中...",
  "ai.connectionSuccess": "接続できました",
  "ai.connectionFailed": "接続できませんでした",
  "ai.comfyuiNotice":
    "ComfyUI が起動していることを確認してください。Vivi2D compat または従来の See-through workflow を使用します。",
  "ai.compatChecking": "Vivi2D compat プラグインを確認しています...",
  "ai.compatReady":
    "Vivi2D compat プラグインを検出しました。Vivi2D compat ワークフローを使用します。",
  "ai.compatFallback":
    "Vivi2D compat プラグインが見つかりませんでした。従来の See-through ワークフローへ切り替えます。",
  "ai.compatFallbackRuntimeNotice":
    "生成中に Vivi2D compat ワークフローが利用できなくなりました。従来の See-through ワークフローへ切り替えます。",
  "ai.nativeImportFallbackNotice":
    "ネイティブ See-through import に失敗したため、compat PSD import に切り替えます。",
  "ai.compatSchema": "マニフェストスキーマ",
  "ai.compatIssue": "Compat 確認の問題",
  "ai.compatPluginVersion": "プラグインバージョン",
  "ai.compatCapability": "対応機能",
  "ai.compatNodes": "Compat ノード",
  "ai.compatNode.decompose": "分解",
  "ai.compatNode.export": "書き出し",
  "ai.compatNode.ok": "あり",
  "ai.compatNode.missing": "なし",
  "ai.promptStarting": "画像生成と See-through 分解を開始しています...",

  "manualPngSplit.title": "PNG レイヤー分割ウィザード",
  "manualPngSplit.open": "分割ウィザードを開く",
  "manualPngSplit.description":
    "独立して動かしたいパーツのマスクを塗ってください。Vivi2D は元画像のピクセルだけを切り抜き、役割付きレイヤーとして作成します。",
  "manualPngSplit.canvasLabel": "手動 PNG 分割用マスクキャンバス",
  "manualPngSplit.noSource":
    "分割ウィザードを使う前に、手動 PNG レイヤーを選択するか PNG プロジェクトを開いてください。",
  "manualPngSplit.sourceLayer": "元レイヤー",
  "manualPngSplit.reviewTitle": "確認",
  "manualPngSplit.reviewNeedMasks": "適用する前に、2つ以上の空でないマスクを作成してください。",
  "manualPngSplit.reviewOverlap": "一部のマスクが重なっています。適用はできますが、自動セットアップ前に重なりを確認してください。",
  "manualPngSplit.reviewReady": "非破壊の分割を適用できます。",
  "manualPngSplit.showSource": "元画像を表示",
  "manualPngSplit.showStressPreview": "動きの確認プレビューを表示",
  "manualPngSplit.brushSize": "ブラシサイズ",
  "manualPngSplit.stressOffset": "確認オフセット",
  "manualPngSplit.paint": "塗る",
  "manualPngSplit.erase": "消す",
  "manualPngSplit.toolBrush": "ブラシ",
  "manualPngSplit.toolLasso": "投げ縄",
  "manualPngSplit.toolWand": "ワンド",
  "manualPngSplit.lassoSmoothing": "投げ縄スムージング",
  "manualPngSplit.lassoSmoothing.off": "オフ",
  "manualPngSplit.lassoSmoothing.low": "弱",
  "manualPngSplit.lassoSmoothing.medium": "中",
  "manualPngSplit.lassoSmoothing.high": "強",
  "manualPngSplit.lassoPrecision": "精密モード",
  "manualPngSplit.lassoWarning.tooFewPoints":
    "投げ縄の範囲が短すぎます。もう少し大きく閉じた範囲を描いてください。",
  "manualPngSplit.lassoWarning.pointLimitReduced":
    "点が多かったため、投げ縄の線を簡略化しました。",
  "manualPngSplit.lassoWarning.detailReducedForSmoothing":
    "スムージングのため細部を少し減らしました。細かい境界は弱めるか、拡大して描いてください。",
  "manualPngSplit.lassoWarning.areaDeltaTooLarge":
    "選択範囲が変わりすぎたため、スムージングを弱めました。",
  "manualPngSplit.lassoWarning.boundsDriftTooLarge":
    "線が元のストロークから離れすぎたため、スムージングを弱めました。",
  "manualPngSplit.lassoWarning.selfIntersectionSuspected":
    "投げ縄の線が交差していたため、このストロークは適用しませんでした。",
  "manualPngSplit.lassoWarning.smoothingFallbackToRaw":
    "このストロークではスムージングを使わず、元の投げ縄線を適用しました。",
  "manualPngSplit.lassoWarning.degenerateStroke":
    "投げ縄の面積が小さすぎるため、適用しませんでした。",
  "manualPngSplit.lassoWarning.nonFinitePointDropped":
    "無効なポインター座標を無視しました。",
  "manualLayerSplit.lassoSmoothing": "投げ縄スムージング",
  "manualLayerSplit.lassoSmoothing.off": "オフ",
  "manualLayerSplit.lassoSmoothing.low": "弱",
  "manualLayerSplit.lassoSmoothing.medium": "中",
  "manualLayerSplit.lassoSmoothing.high": "強",
  "manualLayerSplit.lassoPrecision": "精密モード",
  "manualLayerSplit.lassoWarning.tooFewPoints":
    "投げ縄の範囲が短すぎます。もう少し大きく閉じた範囲を描いてください。",
  "manualLayerSplit.lassoWarning.pointLimitReduced":
    "点が多かったため、投げ縄の線を簡略化しました。",
  "manualLayerSplit.lassoWarning.detailReducedForSmoothing":
    "スムージングのため細部を少し減らしました。細かい境界は弱めるか、拡大して描いてください。",
  "manualLayerSplit.lassoWarning.areaDeltaTooLarge":
    "選択範囲が変わりすぎたため、スムージングを弱めました。",
  "manualLayerSplit.lassoWarning.boundsDriftTooLarge":
    "線が元のストロークから離れすぎたため、スムージングを弱めました。",
  "manualLayerSplit.lassoWarning.selfIntersectionSuspected":
    "投げ縄の線が交差していたため、このストロークは適用しませんでした。",
  "manualLayerSplit.lassoWarning.smoothingFallbackToRaw":
    "このストロークではスムージングを使わず、元の投げ縄線を適用しました。",
  "manualLayerSplit.lassoWarning.degenerateStroke":
    "投げ縄の面積が小さすぎるため、適用しませんでした。",
  "manualLayerSplit.lassoWarning.nonFinitePointDropped":
    "無効なポインター座標を無視しました。",
  "manualPngSplit.modeAdd": "追加",
  "manualPngSplit.modeSubtract": "削除",
  "manualPngSplit.modeReplace": "置換",
  "manualPngSplit.refineRadius": "調整半径",
  "manualPngSplit.wandTolerance": "ワンド許容差",
  "manualPngSplit.growMask": "広げる",
  "manualPngSplit.shrinkMask": "縮める",
  "manualPngSplit.featherMask": "ぼかす",
  "manualPngSplit.fillHoles": "穴を埋める",
  "manualPngSplit.removeIslands": "小島を除去",
  "manualPngSplit.resolveOverlap": "重なりをここへ割当",
  "manualPngSplit.undo": "元に戻す",
  "manualPngSplit.redo": "やり直す",
  "manualPngSplit.clearActive": "選択マスクを消去",
  "manualPngSplit.clearAll": "すべて消去",
  "manualPngSplit.pixels": "ピクセル",
  "manualPngSplit.createLayers": "分割レイヤーを作成",
  "manualPngSplit.needAtLeastTwoMasks":
    "分割レイヤーを作成する前に、2つ以上のパーツマスクを塗ってください。",
  "manualPngSplit.noUsableMasks":
    "使用できる分割レイヤーを作成できませんでした。より大きなマスクを塗って再試行してください。",
  "manualPngSplit.created": "手動分割レイヤーを作成しました。",

  "autoSetup.detectDescription":
    "現在のプロジェクトを解析し、ボーン、メッシュ、ウェイト、補助リグ設定のたたき台を生成します。",
  "autoSetup.title": "自動セットアップ",
  "autoSetup.recommendedFlow": "おすすめフロー",
  "autoSetup.projectSummary": "状態サマリ",
  "autoSetup.helperActions": "補助修正",
  "autoSetup.settings": "設定",
  "autoSetup.generationPlan": "生成するもの",
  "autoSetup.detailLevel": "検出の詳細度",
  "autoSetup.modeBeginner": "かんたん",
  "autoSetup.modeAdvanced": "詳細",
  "autoSetup.advancedSettingsActive": "詳細設定が有効です。",
  "autoSetup.resumed": "前回の自動セットアップ作業から再開しました。",
  "autoSetup.startOver": "最初からやり直す",
  "autoSetup.weightProgress": "ウェイト計算の進捗",
  "autoSetup.target": "対象",
  "autoSetup.seeThroughAssistedSetup": "See-through 支援セットアップ",
  "autoSetup.importedViviMeshes": "取り込み ViviMesh",
  "autoSetup.classifiedRoles": "分類済みロール",
  "autoSetup.unknownRoles": "未確定ロール",
  "autoSetup.accessories": "アクセサリ",
  "autoSetup.errors": "エラー",
  "autoSetup.warnings": "警告",
  "autoSetup.info": "情報",
  "autoSetup.projectIssues": "プロジェクトの問題",
  "autoSetup.importedLayersNeedReview": "件の取り込みレイヤーに確認が必要です。",
  "autoSetup.setupChecklist": "セットアップチェックリスト",
  "autoSetup.checklistAriaSuffix": "セットアップチェックリスト",
  "autoSetup.depthRigAriaSuffix": "depth-to-rig ヒント",
  "autoSetup.occlusionAwareMeshDensity": "遮蔽を考慮したメッシュ密度",
  "autoSetup.useOcclusionAwareMeshDensity": "遮蔽を考慮したメッシュ密度を使う",
  "autoSetup.eyeClippingRelationsApplied": "件の目クリッピング関係を適用しました。",
  "autoSetup.noEyeClippingChanges": "目クリッピングの変更は不要でした。",
  "autoSetup.blinkParametersCreated": "件のまばたきパラメータを作成しました。",
  "autoSetup.eyeControlBonesCreated": "件の目コントロールボーンを作成しました。",
  "autoSetup.legacyEyeRigAssetsRelinked": "件の旧目リグアセットを再リンクしました。",
  "autoSetup.noEyeRigChanges": "目リグの変更は不要でした。",
  "autoSetup.mouthParametersCreated": "件の口パラメータを作成しました。",
  "autoSetup.mouthControlBonesCreated": "件の口コントロールボーンを作成しました。",
  "autoSetup.lipSyncTargetAssigned": "リップシンク対象を Mouth Open に設定しました。",
  "autoSetup.noMouthRigChanges": "口リグの変更は不要でした。",
  "autoSetup.leftRightRoleAssignmentsAdded": "件の左右ロール割り当てを追加しました。",
  "autoSetup.leftRightRoleRepairsApplied": "件の左右ロール修復を適用しました。",
  "autoSetup.noLeftRightRoleChanges": "左右ロールの変更は不要でした。",
  "autoSetup.recommendationsApplied": "See-through 推奨設定を適用済み",
  "autoSetup.useRecommendations": "See-through 推奨設定を使う",
  "autoSetup.applyEyeClipping": "自動目クリッピングを適用",
  "autoSetup.createEyeRig": "基本の目リグを作成",
  "autoSetup.repairLeftRightRoles": "左右ロールを修復",
  "autoSetup.createMouthRig": "基本の口リグを作成",
  "autoSetup.readyPreparing": "リギング準備中...",
  "autoSetup.readyToRig": "リグ準備を実行",
  "autoSetup.openDepthInspector": "深度インスペクターを開く",
  "autoSetup.openPhysicsPanel": "物理パネルを開く",
  "autoSetup.planUnsupported":
    "自動セットアップ計画に未対応の操作が含まれています。",
  "autoSetup.previewStale":
    "除外設定が変更されたため、プレビューを更新しませんでした。もう一度プレビューしてください。",
  "autoSetup.unsupportedHost":
    "この実行環境では監査ハッシュに必要なSHA-256機能を利用できません。",
  "autoSetup.applyFailed": "自動セットアップの適用に失敗しました。",
  "autoSetup.skippedRiskyWeights":
    "元画像を保護するため、リスクの高いウェイトをスキップしました。",
  "autoSetup.skippedManagedObjects":
    "編集済み、または別ソース由来の管理オブジェクトをスキップしました。",
  "autoSetup.warning.side.left": "左",
  "autoSetup.warning.side.right": "右",
  "autoSetup.warning.family.eye": "目",
  "autoSetup.warning.family.eyebrow": "眉",
  "autoSetup.warning.family.arm": "腕",
  "autoSetup.warning.family.hand": "手",
  "autoSetup.warning.family.leg": "脚",
  "autoSetup.warning.faceHeadMissing": "顔または頭のレイヤーが見つかりません。",
  "autoSetup.warning.mouthMissing": "口レイヤーが見つかりません。",
  "autoSetup.warning.bodyMissing": "体レイヤーが見つかりません。",
  "autoSetup.warning.eyeMissing": "左右どちらか、または両方の目レイヤーが見つかりません。",
  "autoSetup.warning.readyNameEmpty":
    "取り込み名の整理をスキップしました: 「{layer}」は整理後の名前が空になります。",
  "autoSetup.warning.readyNameCollision":
    "取り込み名の整理をスキップしました: 「{layer}」を「{target}」にすると別レイヤー名と重複します。",
  "autoSetup.warning.readySingletonAmbiguous":
    "{role} は単一ロールですが、該当する取り込みレイヤーが {count} 件あるため自動割り当てをスキップしました。",
  "autoSetup.warning.leftRightMultipleSide":
    "{family}の{side}側が複数残っています。",
  "autoSetup.warning.leftRightOnlyOneSide":
    "{family}の左右ロールが片側だけに偏っています。",
  "autoSetup.warning.leftRightLowConfidence":
    "「{layer}」は取り込み確信度が {threshold} 未満のため、左右修復をスキップしました。",
  "autoSetup.warning.leftRightSideConflict":
    "「{layer}」は取り込み側メタデータと元ラベルが矛盾しているため、左右修復をスキップしました。",
  "autoSetup.warning.leftRightUnsupportedRole":
    "「{layer}」は現在のロール {role} が左右修復の対象外のため保持しました。",
  "autoSetup.warning.leftRightDifferentFamily":
    "「{layer}」は現在のロール {role} が別のセマンティック系統のため保持しました。",
  "autoSetup.warning.leftRightProtectedRole":
    "「{layer}」は現在の {role} ロールが自動左右上書きから保護されているため保持しました。",
  "autoSetup.warning.eyeClippingNoIris":
    "{side}目のクリッピングをスキップしました: 取り込み虹彩レイヤーが見つかりません。",
  "autoSetup.warning.eyeClippingMultipleIris":
    "{side}目のクリッピングをスキップしました: 取り込み虹彩レイヤーが {count} 件あります。",
  "autoSetup.warning.eyeClippingNoWhite":
    "{side}目のクリッピングをスキップしました: 取り込み白目レイヤーが見つかりません。",
  "autoSetup.warning.eyeClippingMultipleWhite":
    "{side}目のクリッピングをスキップしました: 取り込み白目レイヤーが {count} 件あります。",
  "autoSetup.warning.eyeClippingAlreadyMasked":
    "{side}目のクリッピングをスキップしました: {layer} には既にクリップマスクがあります。",
  "autoSetup.warning.eyeControlsNoIris":
    "{side}目コントロールをスキップしました: 取り込み虹彩レイヤーが見つかりません。",
  "autoSetup.warning.eyeControlsMultipleIris":
    "{side}目コントロールをスキップしました: 取り込み虹彩レイヤーが {count} 件あります。",
  "autoSetup.warning.eyeControlsNoWhite":
    "{side}目コントロールをスキップしました: 取り込み白目レイヤーが見つかりません。",
  "autoSetup.warning.eyeControlsMultipleWhite":
    "{side}目コントロールをスキップしました: 取り込み白目レイヤーが {count} 件あります。",
  "autoSetup.warning.eyeControlsNotClipped":
    "{side}目コントロールをスキップしました: {layer} が {mask} でクリップされていません。",
  "autoSetup.warning.eyeControlsMultipleManagedParameters":
    "{side}目コントロールをスキップしました: 管理まばたきパラメータが複数あります。",
  "autoSetup.warning.eyeControlsMultipleManagedBones":
    "{side}目コントロールをスキップしました: 管理コントロールボーンが複数あります。",
  "autoSetup.warning.eyeControlsParameterExists":
    "{side}目コントロールをスキップしました: {parameter} がユーザー所有パラメータとして既に存在します。",
  "autoSetup.warning.mouthControlsMultipleLayers":
    "口コントロールをスキップしました: 取り込み口レイヤーが {count} 件あります。",
  "autoSetup.warning.mouthControlsMultipleManagedParameters":
    "口コントロールをスキップしました: 管理口パラメータが複数あります。",
  "autoSetup.warning.mouthControlsMultipleManagedBones":
    "口コントロールをスキップしました: 管理口コントロールボーンが複数あります。",
  "autoSetup.warning.mouthControlsParameterExists":
    "口コントロールをスキップしました: {parameter} がユーザー所有パラメータとして既に存在します。",
  "autoSetup.warning.mouthControlsPreservedLipSyncTarget":
    "既存のリップシンク対象パラメータを保持し、Mouth Open への自動付け替えは行いませんでした。",
  "autoSetup.generateBones": "ボーン生成",
  "autoSetup.generateMeshes": "メッシュ自動生成",
  "autoSetup.generateWeights": "ウェイト自動計算",
  "autoSetup.generatePhysics": "物理設定生成",
  "autoSetup.meshDensity": "メッシュ密度",
  "autoSetup.minConfidence": "最低確信度",
  "autoSetup.processing": "処理中…",
  "autoSetup.detectStart": "検出開始",
  "autoSetup.detectedResults": "検出結果",
  "autoSetup.itemCountSuffix": "件",
  "autoSetup.recommendedExclusionsApplied":
    "アクセサリと未確定パーツの推奨除外を適用しています。",
  "autoSetup.restoreRecommendedExclusions": "推奨除外を復元",
  "autoSetup.importedNamesNormalized": "件の取り込み名を正規化しました。",
  "autoSetup.roleAssignmentsAdded": "件のロール割り当てを追加しました。",
  "autoSetup.noCleanupChanges": "クリーンアップ変更は不要でした。",
  "autoSetup.enabledColumn": "有効",
  "autoSetup.layerNameColumn": "レイヤー名",
  "autoSetup.typeColumn": "種別",
  "autoSetup.confidenceColumn": "確信度",
  "autoSetup.noPartsDetected":
    "パーツが検出されませんでした。レイヤー名を確認してください。",
  "autoSetup.back": "戻る",
  "autoSetup.preview": "プレビュー",
  "autoSetup.generatedPreview": "生成プレビュー",
  "autoSetup.debugTitle": "自動セットアップ デバッグ",
  "autoSetup.debugToggleTitle": "詳細診断",
  "autoSetup.debugToggleDescription":
    "安全な自動セットアップ経路を録画・レビューするときに開きます。",
  "autoSetup.debugShow": "詳細を表示",
  "autoSetup.debugHide": "詳細を隠す",
  "autoSetup.debugDescription":
    "新しい Layer Graph -> Safe Plan -> 監査付き適用パイプラインを、録画で見える形にします。",
  "autoSetup.debugBadge": "新デバッグ表示",
  "autoSetup.debugFlowAria": "自動セットアップ安全パイプラインの流れ",
  "autoSetup.debugFlowLayerGraph": "Layer Graph",
  "autoSetup.debugFlowSafetyGates": "安全ゲート",
  "autoSetup.debugFlowSafePlan": "Safe Plan",
  "autoSetup.debugFlowAudit": "監査トレース",
  "autoSetup.debugFlowMotionHandles": "モーションハンドル",
  "autoSetup.debugVisibleChange":
    "デバッグオーバーレイ有効: 新しい安全な自動セットアップ経路の目印です。",
  "autoSetup.debugMapTitle": "リグマップ プレビュー",
  "autoSetup.debugMapDescription":
    "色付きの枠が検出した対象レイヤー、明るい点と線が生成ボーンです。",
  "autoSetup.debugMapParts": "検出レイヤー枠",
  "autoSetup.debugMapBones": "生成ボーン",
  "autoSetup.debugGeneratedBones": "生成ボーン",
  "autoSetup.debugTargetLayers": "対象レイヤー",
  "autoSetup.debugSkinSolvers": "スキン処理モード",
  "autoSetup.debugSolverRigid": "剛体",
  "autoSetup.debugSolverSecondary": "二次揺れ",
  "autoSetup.debugSolverBbw": "レビュー保留",
  "autoSetup.debugBlockedBbw": "保留中の高度処理",
  "autoSetup.debugFromSafePlan": "SafeAutoSetupPlan由来",
  "autoSetup.debugMoreTargets": "ほか{count}件",
  "autoSetup.debugNoTargets": "対象レイヤーなし",
  "autoSetup.debugBbwHeld": "レビューゲート待ち",
  "autoSetup.debugBbwClear": "保留なし",
  "autoSetup.debugAuditHash": "監査ハッシュ",
  "autoSetup.debugAuditNodes": "採用 / 除外ノード",
  "autoSetup.debugAuditOperations": "追跡操作",
  "autoSetup.bones": "ボーン",
  "autoSetup.parameters": "パラメータ",
  "autoSetup.meshes": "メッシュ",
  "autoSetup.layersUnit": "レイヤー",
  "autoSetup.verticesUnit": "頂点",
  "autoSetup.trianglesUnit": "三角形",
  "autoSetup.weights": "ウェイト",
  "autoSetup.weightSolverInfo":
    "静的スキンウェイトは controller-rig Safe Auto Setup としてコンパイルされます。",
  "autoSetup.bbwReviewGate":
    "高度なスキン出力はレビューゲート完了まで保留します。安全な剛体/コントローラ操作は適用できます。",
  "autoSetup.weightModeBadge": "レビュー保留",
  "autoSetup.layerGraphReview": "レイヤーグラフ安全レビュー",
  "autoSetup.layerGraphNodes": "提案ノード",
  "autoSetup.layerGraphOcclusionEdges": "遮蔽エッジ",
  "autoSetup.layerGraphBlockingGates": "ブロック中ゲート",
  "autoSetup.auditTraceReady": "監査トレース:",
  "autoSetup.motionHandleReview": "モーションハンドル確認",
  "autoSetup.motionHandleDescription":
    "分割済みレイヤーをモーション領域として扱います。動かす領域は通常のボーンと静的スキンウェイトだけに変換します。",
  "autoSetup.motionRegions": "モーション領域",
  "autoSetup.motionHandles": "モーションハンドル",
  "autoSetup.motionProtectedRegions": "保護領域",
  "autoSetup.motionProtected": "保護中",
  "autoSetup.motionSuggestionStats": "自動 / 要確認",
  "autoSetup.motionSuggestionWarnings": "候補の警告",
  "autoSetup.motionSuggestionStatus.apply": "自動適用候補",
  "autoSetup.motionSuggestionStatus.review": "要確認",
  "autoSetup.motionSuggestionStatus.rejected": "候補なし",
  "autoSetup.motionSuggestionConfidence.low": "低信頼",
  "autoSetup.motionSuggestionConfidence.medium": "中信頼",
  "autoSetup.motionSuggestionConfidence.high": "高信頼",
  "autoSetup.motionSuggestionWarning.roundMask": "形状が曖昧",
  "autoSetup.motionSuggestionWarning.smallMask": "領域が小さい",
  "autoSetup.motionSuggestionWarning.multiLobeMask": "複数の塊",
  "autoSetup.motionSuggestionWarning.protectedFaceAdjacent": "顔周辺",
  "autoSetup.motionSuggestionWarning.weakAdjacency": "接続が弱い",
  "autoSetup.motionSuggestionWarning.lowConfidence": "信頼度が低い",
  "autoSetup.motionSuggestionWarning.manualReviewRequired": "手動確認が必要",
  "autoSetup.motionSuggestionSource.acceptedMask": "承認済み分割マスク",
  "autoSetup.motionSuggestionSource.pseudoMask": "範囲ベースの代替",
  "autoSetup.motionSuggestionSource.invalidMask": "マスク利用不可",
  "autoSetup.motionDiscardNote":
    "保存されるのはボーン、静的スキンウェイト、物理グループ、管理署名だけです。プレビュー頂点や実験的な補助情報は破棄されます。",
  "autoSetup.safeOperationsSummary": "保存される安全な操作",
  "autoSetup.safeOperation.addBone": "ボーン",
  "autoSetup.safeOperation.parentBone": "ボーン接続",
  "autoSetup.safeOperation.createSkin": "静的スキン",
  "autoSetup.safeOperation.createPhysicsGroup": "物理グループ",
  "autoSetup.safeOperation.rigidLayer": "剛体レイヤー",
  "autoSetup.safeOperation.cleanup": "補正ペア",
  "autoSetup.discardedPreviewCategories": "破棄されるプレビュー専用データ",
  "autoSetup.motionStressChecks": "モーション負荷チェック",
  "autoSetup.discardedPreviewCategory.motionPreviewData": "モーションプレビュー",
  "autoSetup.discardedPreviewCategory.previewGeometryData": "一時的なプレビュー情報",
  "autoSetup.discardedPreviewCategory.internalAlgorithmData": "内部補助データ",
  "autoSetup.discardedPreviewCategory.stressDiagnosticData": "ストレス診断",
  "autoSetup.motionStressCheck.protectedArea": "保護領域",
  "autoSetup.motionStressCheck.duplicateOutline": "重複輪郭",
  "autoSetup.motionStressCheck.hiddenReveal": "隠れ領域の露出",
  "autoSetup.motionStressCheck.restConsistency": "静止時の整合性",
  "autoSetup.motionStressCheck.incompleteCheck": "未完了チェック",
  "autoSetup.motionStressAction.pass": "追加の対応は不要です。",
  "autoSetup.motionStressAction.protectedArea": "顔まわりを確認し、揺れを弱めてください。",
  "autoSetup.motionStressAction.duplicateOutline": "二重線対策の候補を確認してください。",
  "autoSetup.motionStressAction.hiddenReveal": "下地補完を承認するか、揺れを弱めてください。",
  "autoSetup.motionStressAction.restConsistency": "ハンドル位置か揺れ幅を見直してください。",
  "autoSetup.motionStressAction.incompleteCheck": "揺れを小さくして再確認してください。",
  "autoSetup.cleanupComparisonTitle": "クリーンアップ比較",
  "autoSetup.cleanupComparison.none": "処理なし",
  "autoSetup.cleanupComparison.lowerHoldout": "下地holdout",
  "autoSetup.cleanupComparison.featherHoldout": "フェザーholdout",
  "autoSetup.cleanupComparison.duplicateOutlineSuppression": "重複輪郭抑制",
  "autoSetup.cleanupComparison.acceptedUnderpaintReveal": "承認済み下地補完",
  "autoSetup.cleanupComparisonStatus.preferred": "推奨",
  "autoSetup.cleanupComparisonStatus.recommended": "候補",
  "autoSetup.cleanupComparisonStatus.available": "比較可",
  "autoSetup.cleanupComparisonStatus.blocked": "非推奨",
  "autoSetup.motionHandleEditor": "モーションハンドル編集",
  "autoSetup.motionHandleEditorDescription":
    "各領域のroot/tipハンドルを動かします。適用時は通常のボーンと静的スキンウェイトだけに変換します。",
  "autoSetup.motionHandleMap": "モーションハンドルマップ",
  "autoSetup.motionSelectedHandle": "選択中のハンドル",
  "autoSetup.motionHandleX": "横位置",
  "autoSetup.motionHandleY": "縦位置",
  "autoSetup.motionNoEditableHandles":
    "現在の分割レイヤーには編集できるモーションハンドルがありません。",
  "autoSetup.qualityGate.restRecomposeDelta": "静止時の再合成差分",
  "autoSetup.qualityGate.protectedCropDelta": "保護クロップ差分",
  "autoSetup.qualityGate.stressPoseDelta": "大きめ動作の差分",
  "autoSetup.qualityGate.duplicateContourScore": "重複輪郭スコア",
  "autoSetup.qualityGate.duplicateOutline": "重複輪郭",
  "autoSetup.qualityGate.alphaHaloScore": "アルファ境界のにじみ",
  "autoSetup.qualityGate.hiddenRevealScore": "隠れ領域の露出",
  "autoSetup.qualityGate.runtimeProfileScan": "ランタイムプロファイル確認",
  "autoSetup.qualityGate.providerBoundaryScan": "プロバイダ境界確認",
  "autoSetup.gateStatus.pass": "通過",
  "autoSetup.gateStatus.warning": "要確認",
  "autoSetup.gateStatus.fail": "ブロック",
  "autoSetup.gateStatus.notRun": "未実行",
  "autoSetup.motionRisk": "モーション安全スコア",
  "autoSetup.motionRiskDescription":
    "顔/体レイヤーとの重なりを確認し、重複線や穴あきリスクが高い二次モーションを自動で弱めます。",
  "autoSetup.riskScore": "リスク",
  "autoSetup.motionScale": "揺れ係数",
  "autoSetup.occlusionCleanupReport": "重複線・下地補完プレビュー",
  "autoSetup.occlusionCleanupDescription":
    "処理なし、holdout、フェザー、重複線抑制、下地補完を比較します。",
  "autoSetup.cleanupPairs": "処理ペア",
  "autoSetup.cleanupForegrounds": "前景",
  "autoSetup.cleanupMaxStrength": "最大強度",
  "autoSetup.cleanupStrength": "cleanup 強度",
  "autoSetup.cleanupOperation.foreground-edge": "前景エッジ補正",
  "autoSetup.cleanupOperation.lower-holdout": "下地holdout",
  "autoSetup.cleanupOperation.underpaint": "下地補完",
  "autoSetup.cleanupOperation.motion-sweep": "揺れ範囲",
  "autoSetup.cleanupOperation.duplicate-contour": "重複輪郭抑制",
  "autoSetup.physicsGroups": "物理グループ",
  "autoSetup.boneCountUnit": "本",
  "autoSetup.parameterCountUnit": "個",
  "autoSetup.groupCountUnit": "個",
  "autoSetup.stiffness": "剛性",
  "autoSetup.gravity": "重力",
  "autoSetup.damping": "減衰",
  "autoSetup.status.done": "完了",
  "autoSetup.status.partial": "一部完了",
  "autoSetup.status.pending": "未処理",
  "autoSetup.status.blocked": "ブロック中",
  "autoSetup.status.na": "対象外",
  "seethrough.depthRig.summary":
    "Depth-to-rig ヒント: blocking {blocking} | warning {warning} | info {info}",
  "seethrough.depthRig.blockingQualityErrors":
    "rigging 前に {count} 件の import 品質エラーを修正してください。",
  "seethrough.depthRig.cleanupUnknownRole":
    "{layerName} の役割が未確定です。auto-rig の前に役割を決めてください。",
  "seethrough.depthRig.coarseBackLayer":
    "{layerName} は軽めの cleanup 経路のままでも問題ない可能性があります。",
  "seethrough.depthRig.eyeRigReady": "目パーツは eye rig helper を適用できる状態です。",
  "seethrough.depthRig.frontFineControl":
    "{layerName} はより細かい変形制御が必要になりやすいレイヤーです。",
  "seethrough.depthRig.incompleteEyebrowFamily":
    "片側の眉レイヤーが不足しています。左右対称の顔 rig は不安定になる可能性があります。",
  "seethrough.depthRig.incompleteEyeFamily":
    "片側の目レイヤーが不足しています。左右対称の顔 rig は不安定になる可能性があります。",
  "seethrough.depthRig.mouthRigReady":
    "口パーツは mouth rig helper を適用できる状態です。",
  "seethrough.depthRig.physicsBackLayer":
    "{layerName} は後から physics を入れる候補として適しています。",

  "errorBoundary.title": "予期しないエラーが発生しました",
  "errorBoundary.description": "アプリケーションでエラーが発生しました。",
  "errorBoundary.reload": "再読み込み",
  "errorBoundary.tryAgain": "再試行",
  "errorBoundary.errorId": "エラー ID:",
  "errorBoundary.panelTitle": "パネルエラー:",

  "notifications.regionLabel": "通知",
  "notifications.closeLabel": "通知を閉じる",

  "quickActions.title": "クイックアクション",
  "quickActions.searchLabel": "アクションを検索",
  "quickActions.searchPlaceholder": "アクション名を入力...",
  "quickActions.noResults": "現在の検索条件に一致するアクションはありません。",
  "quickActions.dialogActionBadge": "ダイアログ",
  "quickActions.section.project": "プロジェクト / セットアップ",
  "quickActions.section.timeline": "タイムライン / モーション",
  "quickActions.section.view": "表示 / ツール",
  "quickActions.section.workspace": "ワークスペース",
  "quickActions.requiresProject": "先にプロジェクトを読み込んでください。",
  "quickActions.requiresClip": "先にアクティブなクリップを選択してください。",
  "quickActions.reason.referenceOverlaySelection":
    "参照と比較する ViviMesh を選択してください。",
  "quickActions.reason.referenceOverlayImportedBounds":
    "選択中の ViviMesh には See-through の取り込みメタデータが必要です。",
  "quickActions.reason.meshHeatmapSelection":
    "メッシュヒートマップをプレビューするには、ViviMesh を選択してクリップ対象のメッシュ編集に切り替えてください。",
  "quickActions.reason.autoMeshSelection":
    "自動メッシュを再構築する ViviMesh を選択してください。",
  "quickActions.reason.autoMeshTexture":
    "再構築する前に、選択中の ViviMesh にテクスチャデータが必要です。",
  "quickActions.reason.autoWeightSkin":
    "選択中の ViviMesh には既存のスキンバインディングが必要です。",
  "quickActions.reason.boneSelection": "削除するボーンを選択してください。",
  "quickActions.reason.orphanSkinsMissing": "孤立したスキンは見つかりませんでした。",
  "quickActions.reason.parameterBindingCleanup":
    "整理が必要な古いパラメータバインディングはありません。",
  "quickActions.reason.stateMachineCleanup":
    "整理が必要な古いステートマシン参照はありません。",
  "quickActions.reason.sceneBlendCleanup": "整理が必要な古いシーンブレンドはありません。",
  "quickActions.reason.animationTrackCleanup":
    "整理が必要な古いアニメーショントラックはありません。",
  "quickActions.reason.seeThroughProjectRequired":
    "See-through 取り込み済みプロジェクトが必要です。",
  "quickActions.reason.autoSetupQuickActionRunning":
    "別の自動セットアップクイックアクションが実行中です。",
  "quickActions.reason.seeThroughImportedLayerRequired":
    "See-through 取り込み済みレイヤーが必要です。",
  "quickActions.action.readyToRig.title": "リグ準備を実行",
  "quickActions.action.readyToRig.description":
    "自動セットアップを開いて、See-through クリーンアップと検出フローを実行します。",
  "quickActions.action.refineImportedMeshes.title": "取り込みメッシュを改善",
  "quickActions.action.refineImportedMeshes.description":
    "自動セットアップを開いて、標準クアッド以上の取り込みメッシュを再構築します。",
  "quickActions.action.applyAutomaticEyeClipping.title": "自動アイクリッピングを適用",
  "quickActions.action.applyAutomaticEyeClipping.description":
    "自動セットアップを開いて、虹彩と目のクリッピングペアを作成します。",
  "quickActions.action.createBasicEyeRig.title": "基本の目リグを作成",
  "quickActions.action.createBasicEyeRig.description":
    "自動セットアップを開いて、管理されたまばたきリグのアセットを生成します。",
  "quickActions.action.repairLeftRightRoles.title": "左右ロールを修復",
  "quickActions.action.repairLeftRightRoles.description":
    "自動セットアップを開いて、See-through のロール割り当てを修復します。",
  "quickActions.action.createBasicMouthRig.title": "基本の口リグを作成",
  "quickActions.action.createBasicMouthRig.description":
    "自動セットアップを開いて、管理された口開きリグを作成します。",
  "quickActions.action.openPhysicsPanel.title": "物理演算パネルを開く",
  "quickActions.action.openPhysicsPanel.description":
    "リギングワークスペースに切り替えて、セカンダリ物理ツールを表示します。",
  "quickActions.action.openPropertiesPanel.title": "プロパティパネルを開く",
  "quickActions.action.openPropertiesPanel.description":
    "標準ワークスペースに切り替えて、レイヤープロパティとバインディングを確認します。",
  "quickActions.action.openStateMachinePanel.title": "ステートマシンパネルを開く",
  "quickActions.action.openStateMachinePanel.description":
    "アニメーションワークスペースに切り替えて、アニメーションのステートマシンを確認します。",
  "quickActions.action.openSceneBlendPanel.title": "シーンブレンドパネルを開く",
  "quickActions.action.openSceneBlendPanel.description":
    "標準ワークスペースに切り替えて、シーンブレンド遷移を確認します。",
  "quickActions.action.openTimelinePanel.title": "タイムラインパネルを開く",
  "quickActions.action.openTimelinePanel.description":
    "アニメーションワークスペースに切り替えて、タイムライントラックを確認します。",
  "quickActions.action.cleanParameterBindings.title": "パラメータバインディングを整理",
  "quickActions.action.cleanParameterBindings.description":
    "古い、または空のパラメータバインディングを削除します。",
  "quickActions.action.cleanStateMachines.title": "ステートマシンを整理",
  "quickActions.action.cleanStateMachines.description":
    "古いステートマシン参照を削除して、壊れた初期状態をリセットします。",
  "quickActions.action.cleanSceneBlends.title": "シーンブレンドを整理",
  "quickActions.action.cleanSceneBlends.description":
    "無効なシーンブレンドを削除して、古い長さ設定を正規化します。",
  "quickActions.action.cleanAnimationTracks.title": "アニメーショントラックを整理",
  "quickActions.action.cleanAnimationTracks.description":
    "クリップ内の古いトラック参照を削除し、壊れたリップシンク対象をクリアします。",
  "quickActions.action.removeOrphanSkins.title": "孤立したスキンを削除",
  "quickActions.action.removeOrphanSkins.description":
    "存在しないレイヤーを参照しているスキンデータを削除します。",
  "quickActions.action.rebuildSelectedMesh.title": "選択中のメッシュを再構築",
  "quickActions.action.rebuildSelectedMesh.description":
    "選択中の ViviMesh に標準の自動メッシュを生成します。",
  "quickActions.action.autoWeightSelectedMesh.title": "選択中のメッシュを自動ウェイト",
  "quickActions.action.autoWeightSelectedMesh.description":
    "選択中の ViviMesh のスキンウェイトを再計算します。",
  "quickActions.action.normalizeSelectedSkinWeights.title":
    "選択中のスキンウェイトを正規化",
  "quickActions.action.normalizeSelectedSkinWeights.description":
    "選択中の ViviMesh のスキンウェイト合計が 1 になるよう正規化します。",
  "quickActions.action.deleteSelectedBone.title": "選択中のボーンを削除",
  "quickActions.action.deleteSelectedBone.description":
    "選択中のボーンをプロジェクトから削除します。",
  "quickActions.action.referenceOverlayToggle.enable": "参照オーバーレイを有効化",
  "quickActions.action.referenceOverlayToggle.disable": "参照オーバーレイを無効化",
  "quickActions.action.referenceOverlayToggle.description":
    "選択中のメッシュに対する参照比較オーバーレイを切り替えます。",
  "quickActions.action.referenceOverlaySource.title": "参照オーバーレイ: ソース",
  "quickActions.action.referenceOverlaySource.description":
    "変形前のソーステクスチャ矩形を表示します。",
  "quickActions.action.referenceOverlayCurrentBounds.title":
    "参照オーバーレイ: 現在の bounds",
  "quickActions.action.referenceOverlayCurrentBounds.description":
    "現在のメッシュ bounds 矩形を表示します。",
  "quickActions.action.referenceOverlayImportedBounds.title":
    "参照オーバーレイ: 取り込み時 bounds",
  "quickActions.action.referenceOverlayImportedBounds.description":
    "See-through 取り込み時の境界ボックスを表示します。",
  "quickActions.action.referenceOverlayBoundsCompare.title":
    "参照オーバーレイ: bounds 比較",
  "quickActions.action.referenceOverlayBoundsCompare.description":
    "現在のメッシュ bounds と See-through 取り込み bounds を重ねて表示します。",
  "quickActions.action.referenceOverlayComparePrefix": "参照オーバーレイ比較:",
  "quickActions.action.referenceOverlayComparePreset.description":
    "bounds 比較を {label} に切り替えます。",
  "quickActions.action.referenceOverlayCompareSwap.title":
    "参照オーバーレイ比較: A/B を入れ替え",
  "quickActions.action.referenceOverlayCompareSwap.description":
    "現在の比較 A と比較 B を入れ替えます。",
  "quickActions.action.referenceOverlayPinCompareSummary.enable":
    "参照オーバーレイ比較サマリーを固定",
  "quickActions.action.referenceOverlayPinCompareSummary.disable":
    "参照オーバーレイ比較サマリーの固定を解除",
  "quickActions.action.referenceOverlayPinCompareSummary.description":
    "オーバーレイモードを比較以外に切り替えても、比較サマリーを表示したままにします。",
  "quickActions.action.referenceOverlayOpacity25.title": "参照オーバーレイ不透明度: 25%",
  "quickActions.action.referenceOverlayOpacity25.description":
    "現在のモードを保ったまま、参照オーバーレイの不透明度を 25% にします。",
  "quickActions.action.referenceOverlayOpacity50.title": "参照オーバーレイ不透明度: 50%",
  "quickActions.action.referenceOverlayOpacity50.description":
    "現在のモードを保ったまま、参照オーバーレイの不透明度を 50% にします。",
  "quickActions.action.referenceOverlayOpacity75.title": "参照オーバーレイ不透明度: 75%",
  "quickActions.action.referenceOverlayOpacity75.description":
    "現在のモードを保ったまま、参照オーバーレイの不透明度を 75% にします。",
  "quickActions.action.referenceOverlayOpacity100.title":
    "参照オーバーレイ不透明度: 100%",
  "quickActions.action.referenceOverlayOpacity100.description":
    "現在のモードを保ったまま、参照オーバーレイの不透明度を 100% にします。",
  "quickActions.action.meshHeatmapToggle.enable": "メッシュヒートマップを有効化",
  "quickActions.action.meshHeatmapToggle.disable": "メッシュヒートマップを無効化",
  "quickActions.action.meshHeatmapToggle.description":
    "クリップ対象メッシュのヒートマップオーバーレイを切り替えます。",
  "quickActions.action.meshHeatmapIntensity50.title": "メッシュヒートマップ強度: 50%",
  "quickActions.action.meshHeatmapIntensity50.description":
    "ヒートマップを有効化して、強度を 50% に設定します。",
  "quickActions.action.meshHeatmapIntensity100.title": "メッシュヒートマップ強度: 100%",
  "quickActions.action.meshHeatmapIntensity100.description":
    "ヒートマップを有効化して、強度を 100% に設定します。",
  "quickActions.action.meshHeatmapIntensity150.title": "メッシュヒートマップ強度: 150%",
  "quickActions.action.meshHeatmapIntensity150.description":
    "ヒートマップを有効化して、強度を 150% に設定します。",
  "quickActions.action.meshHeatmapIntensity200.title": "メッシュヒートマップ強度: 200%",
  "quickActions.action.meshHeatmapIntensity200.description":
    "ヒートマップを有効化して、強度を 200% に設定します。",

  "dialog.loading": "ダイアログを読み込んでいます",
  "imageImportOptions.title.openProject": "画像オープン設定",
  "imageImportOptions.title.importLayer": "画像インポート設定",
  "imageImportOptions.title.importLayers": "複数画像インポート設定",
  "imageImportOptions.title.importFolder": "フォルダインポート設定",
  "imageImportOptions.description.openProject":
    "PNG を新規プロジェクトとして開くときの配置方法を選びます。",
  "imageImportOptions.description.importLayer":
    "PNG を現在のプロジェクトへ読み込むときの配置方法を選びます。",
  "imageImportOptions.description.importLayers":
    "複数 PNG を現在のプロジェクトへ読み込むときの配置方法を選びます。",
  "imageImportOptions.description.importFolder":
    "選択したフォルダ内の PNG を現在のプロジェクトへ読み込むときの配置方法を選びます。",
  "imageImportOptions.centerOnCanvas": "キャンバス中央に配置",
  "imageImportOptions.trimTransparentBounds": "透明余白をトリム",
  "imageImportOptions.createGroupForImportedLayers": "読み込みレイヤーをグループ化",
  "imageImportOptions.autoGenerateMesh": "自動メッシュを生成",
  "imageImportOptions.dragDropUsesDefaults":
    "PNG のドラッグ&ドロップは引き続き既定の読み込み設定を使います。",
  "imageImportOptions.largeImageAutoCentered":
    "読み込む画像が現在のキャンバスよりかなり大きいため、自動でキャンバス中央に配置しました。",
  "imageImportOptions.transparentPaddingWarning":
    "読み込む画像には大きい透明余白があります。画面外に見える場合は「透明余白をトリム」を有効にしてください。",
  "imageImportOptions.focusedViewportOnImport":
    "読み込んだレイヤーが見える位置へ表示を移動しました。",
  "imageImportOptions.focusedViewportOnImportMultiple":
    "読み込んだレイヤー群が見える位置へ表示を移動しました。",
  "imageImportOptions.emptyPngFolder":
    "選択したフォルダに PNG ファイルがありません。",
  "imageImportOptions.projectRequiredForLayer":
    "画像レイヤーを読み込む前にプロジェクトを開いてください。",
  "imageImportOptions.projectRequiredForLayers":
    "画像レイヤー群を読み込む前にプロジェクトを開いてください。",
  "imageImportOptions.failedToBuildPngProject": "PNG プロジェクトの作成に失敗しました。",
  "imageImportOptions.reimportProjectRequired":
    "画像レイヤーを再読み込みする前にプロジェクトを開いてください。",
  "imageImportOptions.reimportEligibility":
    "再読み込みする手動 PNG 取り込み済み ViviMesh を選択してください。",
  "imageImportOptions.reimportSourceMissing":
    "選択中の取り込み済み PNG レイヤーには、再読み込み元のパスがありません。",
  "imageImportOptions.reimportMismatch":
    "再読み込みした PNG は現在のレイヤー境界と一致しません。新しいレイヤーとして読み込んでください。",
  "imageImportOptions.reimportedPrefix": "再読み込みしました:",
} as const;
