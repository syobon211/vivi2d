import { dialog as enDialog } from "../en/dialog";

export const dialog = {
  ...enDialog,
  "runtimePreview.title": "Runtime 미리 보기",
  "runtimePreview.scope":
    "이 복제본에 해당하는 .vivi 스냅샷을 선택하여 표시합니다. 프로젝트를 편집, 저장 또는 게시하지 않습니다.",
  "runtimePreview.open": "프로젝트 미리 보기",
  "runtimePreview.reload": "다시 불러오기",
  "runtimePreview.close": "미리 보기 닫기",
  "runtimePreview.loading": "미리 보기 준비 중…",
  "runtimePreview.ready": "미리 보기 준비 완료",
  "runtimePreview.warning":
    "미리 보기 상태는 적용되었지만 표시 또는 정리가 완료되지 않았습니다. 다시 불러오세요.",
  "runtimePreview.missing": "필요한 에셋이 없습니다. 현재 화면은 유지됩니다.",
  "runtimePreview.failed": "미리 보기에 실패했습니다. 다시 불러와 재시도하세요.",
  "runtimePreview.parameter": "매개변수",
  "runtimePreview.preset": "표정 프리셋",
  "runtimePreview.generation": "Runtime 세대",
  "localExchange.title": "영구 로컬 Job 및 데이터 교환",
  "localAssetCopy.title": "참조형 프로젝트를 로컬로 복사",
  "localAssetCopy.scope":
    "승인된 정규화 프로젝트와 PNG 에셋을 로컬 복제본 사이에 복사합니다. 편집기에서 열거나 내용을 변경하거나 Sync 리비전을 게시하지 않습니다.",
  "localAssetCopy.source": "원본 복제본",
  "localAssetCopy.receiver": "대상 복제본",
  "localAssetCopy.prepare": "프로젝트 선택",
  "localAssetCopy.commit": "에셋 복사 및 다른 이름으로 저장",
  "localAssetCopy.cancel": "남은 작업 취소",
  "localAssetCopy.consent":
    "현재 선택한 프로젝트와 에셋을 대상 로컬 복제본에 복사할까요? 다음 단계에서 저장 위치를 선택합니다. 이후 실패하거나 취소해도 이미 복사된 불변 에셋은 남습니다.",
  "localAssetCopy.unavailable": "현재 실행 구성에서는 복사할 수 없습니다.",
  "localAssetCopy.failed":
    "복사 결과를 확인할 수 없습니다. 재시도하기 전에 선택한 출력 위치를 확인하세요. 복사된 불변 에셋은 남을 수 있습니다.",
  "localAssetCopy.ambiguous":
    "작업이 완료되었을 수 있지만 결과를 확인할 수 없습니다. 선택한 출력 위치를 확인한 후 같은 프로젝트를 다시 선택하여 명시적으로 재시도하세요.",
  "localAssetCopy.committed": "정규화 복사본이 저장된 문서:",
  "localExchange.scope":
    "내부 로컬 모드입니다. 요청과 결과는 이 컴퓨터에 저장되며 재시작 후 자동 실행되지 않습니다.",
  "localExchange.refresh": "새로 고침",
  "localExchange.createWorkspace": "로컬 작업 영역 만들기",
  "localExchange.workspace": "작업 영역",
  "localExchange.replica": "대응 복제본 만들기",
  "localExchange.publish": "현재 완전한 v11 게시",
  "localExchange.target": "대상 복제본",
  "localExchange.queue": "대상 현재 헤드 기준으로 v11 예약",
  "localExchange.deliver": "전달 / 동일 요청 재전송",
  "localExchange.queuePrompt": "프롬프트 Job 예약",
  "localExchange.queueImage": "이미지 선택 후 Job 예약",
  "localExchange.job": "Job",
  "localExchange.retry": "명시적으로 재시도",
  "localExchange.start": "시작",
  "localExchange.cancel": "취소",
  "localExchange.selection": "정확한 결과 아티팩트 선택",
  "localExchange.consent":
    "보관된 후보로 현재 편집 내용을 바꾸시겠습니까? 저장하지 않은 변경 내용이 대체됩니다.",
  "localExchange.approve": "일반 가져오기 승인",
  "localExchange.reject": "제안 거부",
  "localExchange.psd": "별도 PSD 변환 예약 (서버 의존)",
  "localExchange.openCandidate": "보관된 승인 후보 열기",
  "localExchange.legacy":
    "일반 Provider 가져오기는 지원되는 데이터를 유지합니다. v11 Sync 리비전이나 직접 Project 아티팩트 승인 증명은 아닙니다.",
  "localExchange.failed":
    "작업이 실패했거나 상태가 변경되었습니다. 새로 고친 후 다시 명시적으로 작업하세요.",
  "localExchange.unavailable": "로컬 데이터 교환을 사용할 수 없습니다.",
  "localExchange.integrity": "무결성 검사에 실패한 저장 셀은 사용할 수 없습니다.",
  "media.title": "미디어 내보내기",
  "media.pngSequence": "PNG 시퀀스",
  "media.video": "비디오 (WebM/MP4)",
  "media.clip": "클립",
  "media.noClips": "내보낼 수 있는 클립 없음",
  "media.format": "형식",
  "media.rendering": "렌더링 중",
  "media.encoding": "인코딩 중",
  "media.saving": "저장 중",
  "media.pixiMissing": "PixiJS 애플리케이션을 찾을 수 없습니다",
  "media.pngExportedSuffix": "개의 PNG 프레임을 내보냈습니다",
  "media.videoExported": "비디오를 내보냈습니다",
  "media.exportFailedPrefix": "내보내기 실패:",
  "media.unknownError": "알 수 없는 오류",
  "media.duration": "길이",
  "media.seconds": "초",
  "media.frameCount": "프레임",
  "media.framesShort": "f",
  "media.fps": "FPS",
  "media.output": "출력",
  "media.pngFileCountSuffix": "개의 PNG 파일",
  "media.webmVideoFile": "WebM 비디오 파일",
  "validation.title": "모델 검증",
  "validation.noIssues": "문제가 없습니다",
  "ai.comfyuiSettings": "ComfyUI 설정...",
  "ai.comfyuiSettingsTitle": "ComfyUI 연결 구성",
  "ai.comfyuiTitle": "ComfyUI 연결 설정",
  "ai.comfyuiUrl": "ComfyUI URL",
  "ai.testConnection": "연결 테스트",
  "ai.testing": "테스트 중...",
  "ai.connectionSuccess": "✓ 연결됨",
  "ai.connectionFailed": "✗ 연결 실패",
  "ai.comfyuiNotice":
    "ComfyUI가 실행 중인지 확인하세요. Vivi2D compat 또는 기존 See-through 워크플로를 사용합니다.",
  "ai.dialogTitle": "자동 모델 생성",
  "ai.tabImage": "이미지에서",
  "ai.tabPrompt": "프롬프트에서",
  "ai.prompt": "프롬프트",
  "ai.negativePrompt": "네거티브 프롬프트",
  "ai.seed": "시드",
  "ai.resolution": "해상도",
  "ai.steps": "스텝",
  "ai.recommended": "권장",
  "ai.selectImageAndGenerate": "이미지 선택 후 생성",
  "ai.startGenerate": "생성 시작",
  "ai.generating": "생성 중...",
  "ai.uploading": "이미지 업로드 중...",
  "ai.processing": "처리 중...",
  "ai.downloading": "결과 다운로드 중...",
  "ai.complete": "완료!",
  "manualPngSplit.title": "PNG 레이어 분할 마법사",
  "manualPngSplit.open": "분할 마법사 열기",
  "manualPngSplit.reviewTitle": "검토",
  "manualPngSplit.showSource": "원본 이미지 표시",
  "manualPngSplit.brushSize": "브러시 크기",
  "manualPngSplit.paint": "칠하기",
  "manualPngSplit.erase": "지우기",
  "manualPngSplit.toolBrush": "브러시",
  "manualPngSplit.toolLasso": "올가미",
  "manualPngSplit.toolWand": "마술봉",
  "manualPngSplit.lassoSmoothing": "올가미 스무딩",
  "manualPngSplit.lassoSmoothing.off": "끔",
  "manualPngSplit.lassoSmoothing.low": "낮음",
  "manualPngSplit.lassoSmoothing.medium": "중간",
  "manualPngSplit.lassoSmoothing.high": "높음",
  "manualPngSplit.modeAdd": "추가",
  "manualPngSplit.modeSubtract": "빼기",
  "manualPngSplit.modeReplace": "교체",
  "manualPngSplit.undo": "실행 취소",
  "manualPngSplit.redo": "다시 실행",
  "manualPngSplit.createLayers": "분할 레이어 만들기",
  "autoSetup.title": "자동 설정",
  "autoSetup.recommendedFlow": "권장 흐름",
  "autoSetup.detectDescription":
    "현재 프로젝트를 분석하고 뼈, 메시, 가중치, 보조 리그 설정의 시작점을 만듭니다.",
  "autoSetup.projectSummary": "프로젝트 요약",
  "autoSetup.settings": "설정",
  "autoSetup.generationPlan": "생성 계획",
  "autoSetup.detailLevel": "감지 세부 수준",
  "autoSetup.modeBeginner": "초급",
  "autoSetup.modeAdvanced": "고급",
  "autoSetup.errors": "오류",
  "autoSetup.warnings": "경고",
  "autoSetup.info": "정보",
  "autoSetup.preview": "미리보기",
  "autoSetup.back": "뒤로",
  "autoSetup.detectStart": "감지 시작",
  "autoSetup.processing": "처리 중...",
  "autoSetup.generateBones": "뼈 생성",
  "autoSetup.generateMeshes": "메시 자동 생성",
  "autoSetup.generateWeights": "가중치 자동 계산",
  "autoSetup.generatePhysics": "물리 설정 생성",
  "autoSetup.meshDensity": "메시 밀도",
  "autoSetup.minConfidence": "최소 신뢰도",
  "autoSetup.weightModeBadge": "검토 필요",
  "autoSetup.motionHandleReview": "모션 핸들 검토",
  "autoSetup.safeOperationsSummary": "저장되는 안전 작업",
  "autoSetup.discardedPreviewCategories": "버려지는 미리보기 전용 데이터",
  "autoSetup.motionStressChecks": "모션 스트레스 검사",
  "autoSetup.cleanupComparisonTitle": "클린업 효과 비교",
  "autoSetup.motionHandleEditor": "모션 핸들 편집기",
  "autoSetup.motionStressAction.duplicateOutline": "중복 윤곽선 클린업을 확인하세요.",
  "autoSetup.motionStressAction.hiddenReveal":
    "언더페인트를 승인하거나 움직임을 줄이세요.",
  "autoSetup.motionStressCheck.protectedArea": "보호 영역",
  "autoSetup.motionStressCheck.duplicateOutline": "중복 윤곽선",
  "autoSetup.motionStressCheck.hiddenReveal": "숨은 영역 노출",
  "autoSetup.motionStressCheck.restConsistency": "정지 상태 일관성",
  "autoSetup.gateStatus.pass": "통과",
  "autoSetup.gateStatus.warning": "검토 필요",
  "autoSetup.gateStatus.fail": "차단됨",
  "autoSetup.gateStatus.notRun": "미실행",
  "errorBoundary.title": "예기치 않은 오류가 발생했습니다",
  "errorBoundary.reload": "다시 로드",
  "dialog.loading": "대화 상자 로드 중",
  "manualPngSplit.description":
    "독립적으로 리깅할 파트에 마스크를 칠합니다. Vivi2D는 새 그림을 생성하지 않고 원본 픽셀을 역할이 지정된 레이어로 나눕니다.",
  "manualPngSplit.canvasLabel": "수동 PNG 분할 마스크 캔버스",
  "manualPngSplit.noSource":
    "분할 마법사를 사용하기 전에 수동 PNG 레이어를 선택하거나 PNG 프로젝트를 열어 주세요.",
  "manualPngSplit.sourceLayer": "원본 레이어",
  "manualPngSplit.reviewNeedMasks":
    "적용하기 전에 비어 있지 않은 마스크를 두 개 이상 만들어 주세요.",
  "manualPngSplit.reviewOverlap":
    "일부 마스크가 겹칩니다. 적용할 수는 있지만 자동 설정 전에 겹침을 확인하세요.",
  "manualPngSplit.reviewReady": "비파괴 분할을 적용할 준비가 되었습니다.",
  "manualPngSplit.showStressPreview": "움직임 스트레스 미리보기 표시",
  "manualPngSplit.stressOffset": "스트레스 오프셋",
  "manualPngSplit.lassoPrecision": "정밀 모드",
  "manualPngSplit.lassoWarning.tooFewPoints":
    "올가미 선이 너무 짧습니다. 더 넓은 닫힌 영역을 그려 주세요.",
  "manualPngSplit.lassoWarning.pointLimitReduced":
    "점이 많아 올가미 선을 단순화했습니다.",
  "manualPngSplit.lassoWarning.detailReducedForSmoothing":
    "스무딩을 위해 일부 세부가 줄었습니다. 세밀한 가장자리는 스무딩을 낮추거나 확대해 주세요.",
  "manualPngSplit.lassoWarning.areaDeltaTooLarge":
    "선택 영역이 너무 많이 바뀌어 스무딩을 줄였습니다.",
  "manualPngSplit.lassoWarning.boundsDriftTooLarge":
    "경로가 선에서 너무 멀어져 스무딩을 줄였습니다.",
  "manualPngSplit.lassoWarning.selfIntersectionSuspected":
    "올가미가 서로 교차하여 이 선은 적용하지 않았습니다.",
  "manualPngSplit.lassoWarning.smoothingFallbackToRaw":
    "이 선은 스무딩을 건너뛰고 원본 올가미 경로를 사용했습니다.",
  "manualPngSplit.lassoWarning.degenerateStroke":
    "올가미 영역이 너무 작아 적용할 수 없습니다.",
  "manualPngSplit.lassoWarning.nonFinitePointDropped":
    "일부 잘못된 포인터 샘플을 무시했습니다.",
  "manualLayerSplit.lassoSmoothing": "올가미 스무딩",
  "manualLayerSplit.lassoSmoothing.off": "끔",
  "manualLayerSplit.lassoSmoothing.low": "낮음",
  "manualLayerSplit.lassoSmoothing.medium": "중간",
  "manualLayerSplit.lassoSmoothing.high": "높음",
  "manualLayerSplit.lassoPrecision": "정밀 모드",
  "manualLayerSplit.lassoWarning.tooFewPoints":
    "올가미 선이 너무 짧습니다. 더 넓은 닫힌 영역을 그려 주세요.",
  "manualLayerSplit.lassoWarning.pointLimitReduced":
    "점이 많아 올가미 선을 단순화했습니다.",
  "manualLayerSplit.lassoWarning.detailReducedForSmoothing":
    "스무딩을 위해 일부 세부가 줄었습니다. 세밀한 가장자리는 스무딩을 낮추거나 확대해 주세요.",
  "manualLayerSplit.lassoWarning.areaDeltaTooLarge":
    "선택 영역이 너무 많이 바뀌어 스무딩을 줄였습니다.",
  "manualLayerSplit.lassoWarning.boundsDriftTooLarge":
    "경로가 선에서 너무 멀어져 스무딩을 줄였습니다.",
  "manualLayerSplit.lassoWarning.selfIntersectionSuspected":
    "올가미가 서로 교차하여 이 선은 적용하지 않았습니다.",
  "manualLayerSplit.lassoWarning.smoothingFallbackToRaw":
    "이 선은 스무딩을 건너뛰고 원본 올가미 경로를 사용했습니다.",
  "manualLayerSplit.lassoWarning.degenerateStroke":
    "올가미 영역이 너무 작아 적용할 수 없습니다.",
  "manualLayerSplit.lassoWarning.nonFinitePointDropped":
    "일부 잘못된 포인터 샘플을 무시했습니다.",
  "manualPngSplit.refineRadius": "보정 반경",
  "manualPngSplit.wandTolerance": "마술봉 허용 범위",
  "manualPngSplit.growMask": "확장",
  "manualPngSplit.shrinkMask": "축소",
  "manualPngSplit.featherMask": "페더",
  "manualPngSplit.fillHoles": "구멍 채우기",
  "manualPngSplit.removeIslands": "작은 섬 제거",
  "manualPngSplit.resolveOverlap": "겹침을 여기에 할당",
  "manualPngSplit.clearActive": "선택 마스크 지우기",
  "manualPngSplit.clearAll": "모두 지우기",
  "manualPngSplit.pixels": "px",
  "manualPngSplit.needAtLeastTwoMasks":
    "분할 레이어를 만들기 전에 파트 마스크를 두 개 이상 칠해 주세요.",
  "manualPngSplit.noUsableMasks":
    "사용 가능한 분할 레이어가 만들어지지 않았습니다. 더 큰 마스크를 칠한 뒤 다시 시도하세요.",
  "manualPngSplit.created": "수동 분할 레이어를 만들었습니다.",
  "quickActions.title": "빠른 작업",
  "quickActions.searchLabel": "작업 검색",
  "quickActions.searchPlaceholder": "작업 이름 입력...",
  "quickActions.noResults": "현재 검색어와 일치하는 작업이 없습니다.",
  "quickActions.dialogActionBadge": "대화상자",
  "quickActions.section.project": "프로젝트 / 설정",
  "quickActions.section.timeline": "타임라인 / 모션",
  "quickActions.section.view": "보기 / 도구",
  "quickActions.section.workspace": "작업 영역",
  "quickActions.requiresProject": "먼저 프로젝트를 불러와야 합니다.",
  "quickActions.requiresClip": "먼저 활성 클립을 선택하세요.",
  "quickActions.reason.referenceOverlaySelection":
    "참조 오버레이를 사용하려면 ViviMesh를 선택하세요.",
  "quickActions.reason.referenceOverlayImportedBounds":
    "선택한 ViviMesh에는 See-through 가져오기 메타데이터가 필요합니다.",
  "quickActions.reason.meshHeatmapSelection":
    "메시 히트맵을 미리 보려면 ViviMesh를 선택하고 클립 대상 메시 편집으로 전환하세요.",
  "quickActions.reason.autoMeshSelection": "자동 메시를 다시 만들 ViviMesh를 선택하세요.",
  "quickActions.reason.autoMeshTexture": "선택한 ViviMesh에는 텍스처가 필요합니다.",
  "quickActions.reason.autoWeightSkin":
    "선택한 ViviMesh에는 기존 스킨 바인딩이 필요합니다.",
  "quickActions.reason.boneSelection": "제거할 본을 선택하세요.",
  "quickActions.reason.orphanSkinsMissing": "고아 스킨이 없습니다.",
  "quickActions.reason.parameterBindingCleanup":
    "정리할 오래된 파라미터 바인딩이 없습니다.",
  "quickActions.reason.stateMachineCleanup": "정리할 오래된 상태 머신 참조가 없습니다.",
  "quickActions.reason.sceneBlendCleanup": "정리할 오래된 씬 블렌드가 없습니다.",
  "quickActions.reason.animationTrackCleanup":
    "정리할 오래된 애니메이션 트랙이 없습니다.",
  "quickActions.reason.seeThroughProjectRequired":
    "See-through로 가져온 프로젝트가 필요합니다.",
  "quickActions.reason.autoSetupQuickActionRunning": "자동 설정 작업이 실행 중입니다.",
  "quickActions.reason.seeThroughImportedLayerRequired":
    "See-through로 가져온 레이어가 필요합니다.",
  "quickActions.action.readyToRig.title": "리깅 준비 검사 실행",
  "quickActions.action.readyToRig.description":
    "자동 설정을 열고 See-through 정리 및 감지 흐름을 실행합니다.",
  "quickActions.action.refineImportedMeshes.title": "가져온 메시 다듬기",
  "quickActions.action.refineImportedMeshes.description":
    "자동 설정을 열고 가져온 메시를 기본 사각형보다 세밀하게 다시 만듭니다.",
  "quickActions.action.applyAutomaticEyeClipping.title": "자동 눈 클리핑 적용",
  "quickActions.action.applyAutomaticEyeClipping.description":
    "자동 설정을 열고 홍채와 눈 흰자 사이의 클리핑 관계를 만듭니다.",
  "quickActions.action.createBasicEyeRig.title": "기본 눈 리그 만들기",
  "quickActions.action.createBasicEyeRig.description":
    "자동 설정을 열고 관리형 깜빡임 리그 자산을 생성합니다.",
  "quickActions.action.repairLeftRightRoles.title": "좌우 역할 복구",
  "quickActions.action.repairLeftRightRoles.description":
    "자동 설정을 열고 See-through 역할 할당을 복구합니다.",
  "quickActions.action.createBasicMouthRig.title": "기본 입 리그 만들기",
  "quickActions.action.createBasicMouthRig.description":
    "자동 설정을 열고 관리형 입 벌림 리그를 만듭니다.",
  "quickActions.action.openPhysicsPanel.title": "물리 패널 열기",
  "quickActions.action.openPhysicsPanel.description":
    "리깅 작업 영역으로 전환하고 보조 물리 도구를 표시합니다.",
  "quickActions.action.openPropertiesPanel.title": "속성 패널 열기",
  "quickActions.action.openPropertiesPanel.description":
    "기본 작업 영역으로 전환해 레이어 속성과 바인딩을 확인합니다.",
  "quickActions.action.openStateMachinePanel.title": "상태 머신 패널 열기",
  "quickActions.action.openStateMachinePanel.description":
    "애니메이션 작업 영역으로 전환해 애니메이션 상태 머신을 확인합니다.",
  "quickActions.action.openSceneBlendPanel.title": "씬 블렌드 패널 열기",
  "quickActions.action.openSceneBlendPanel.description":
    "기본 작업 영역으로 전환해 씬 블렌드 전환을 확인합니다.",
  "quickActions.action.openTimelinePanel.title": "타임라인 패널 열기",
  "quickActions.action.openTimelinePanel.description":
    "애니메이션 작업 영역으로 전환해 타임라인 트랙을 확인합니다.",
  "quickActions.action.cleanParameterBindings.title": "파라미터 바인딩 정리",
  "quickActions.action.cleanParameterBindings.description":
    "오래되었거나 빈 파라미터 바인딩을 제거합니다.",
  "quickActions.action.cleanStateMachines.title": "상태 머신 정리",
  "quickActions.action.cleanStateMachines.description":
    "오래된 상태 머신 참조를 제거하고 손상된 기본값을 재설정합니다.",
  "quickActions.action.cleanSceneBlends.title": "씬 블렌드 정리",
  "quickActions.action.cleanSceneBlends.description":
    "잘못된 씬 블렌드를 제거하고 오래된 지속 시간을 정규화합니다.",
  "quickActions.action.cleanAnimationTracks.title": "애니메이션 트랙 정리",
  "quickActions.action.cleanAnimationTracks.description":
    "클립의 오래된 트랙 참조를 제거하고 손상된 립싱크 대상을 지웁니다.",
  "quickActions.action.removeOrphanSkins.title": "고아 스킨 제거",
  "quickActions.action.removeOrphanSkins.description":
    "누락된 레이어를 참조하는 스킨 데이터를 삭제합니다.",
  "quickActions.action.rebuildSelectedMesh.title": "선택한 메시 다시 만들기",
  "quickActions.action.rebuildSelectedMesh.description":
    "선택한 ViviMesh에 표준 자동 메시를 생성합니다.",
  "quickActions.action.autoWeightSelectedMesh.title": "선택한 메시 자동 가중치",
  "quickActions.action.autoWeightSelectedMesh.description":
    "선택한 ViviMesh의 스킨 가중치를 다시 계산합니다.",
  "quickActions.action.normalizeSelectedSkinWeights.title": "선택한 스킨 가중치 정규화",
  "quickActions.action.normalizeSelectedSkinWeights.description":
    "선택한 ViviMesh의 스킨 가중치 합이 1이 되도록 정규화합니다.",
  "quickActions.action.deleteSelectedBone.title": "선택한 본 삭제",
  "quickActions.action.deleteSelectedBone.description":
    "프로젝트에서 선택한 본을 제거합니다.",
  "quickActions.action.referenceOverlayToggle.enable": "참조 오버레이 활성화",
  "quickActions.action.referenceOverlayToggle.disable": "참조 오버레이 비활성화",
  "quickActions.action.referenceOverlayToggle.description":
    "선택한 메시의 참조 비교 오버레이를 전환합니다.",
  "quickActions.action.referenceOverlaySource.title": "참조 오버레이: 원본",
  "quickActions.action.referenceOverlaySource.description":
    "원본 소스 텍스처 사각형을 표시합니다.",
  "quickActions.action.referenceOverlayCurrentBounds.title": "참조 오버레이: 현재 경계",
  "quickActions.action.referenceOverlayCurrentBounds.description":
    "현재 메시 경계 사각형을 표시합니다.",
  "quickActions.action.referenceOverlayImportedBounds.title":
    "참조 오버레이: 가져온 경계",
  "quickActions.action.referenceOverlayImportedBounds.description":
    "See-through 가져오기 시점의 경계 상자를 표시합니다.",
  "quickActions.action.referenceOverlayBoundsCompare.title": "참조 오버레이: 경계 비교",
  "quickActions.action.referenceOverlayBoundsCompare.description":
    "현재 메시 경계와 See-through 가져오기 경계를 함께 겹쳐 표시합니다.",
  "quickActions.action.referenceOverlayComparePrefix": "참조 오버레이 비교:",
  "quickActions.action.referenceOverlayComparePreset.description":
    "참조 오버레이 비교 프리셋을 전환합니다.",
  "quickActions.action.referenceOverlayCompareSwap.title": "참조 오버레이 비교: A/B 교체",
  "quickActions.action.referenceOverlayCompareSwap.description":
    "현재 비교 A와 비교 B 모드를 서로 바꿉니다.",
  "quickActions.action.referenceOverlayPinCompareSummary.enable":
    "참조 오버레이 비교 요약 고정",
  "quickActions.action.referenceOverlayPinCompareSummary.disable":
    "참조 오버레이 비교 요약 고정 해제",
  "quickActions.action.referenceOverlayPinCompareSummary.description":
    "오버레이 모드가 비교 모드에서 벗어나도 비교 요약을 계속 표시합니다.",
  "quickActions.action.referenceOverlayOpacity25.title": "참조 오버레이 불투명도: 25%",
  "quickActions.action.referenceOverlayOpacity25.description":
    "참조 오버레이 불투명도를 25%로 설정하고 현재 모드를 유지합니다.",
  "quickActions.action.referenceOverlayOpacity50.title": "참조 오버레이 불투명도: 50%",
  "quickActions.action.referenceOverlayOpacity50.description":
    "참조 오버레이 불투명도를 50%로 설정하고 현재 모드를 유지합니다.",
  "quickActions.action.referenceOverlayOpacity75.title": "참조 오버레이 불투명도: 75%",
  "quickActions.action.referenceOverlayOpacity75.description":
    "참조 오버레이 불투명도를 75%로 설정하고 현재 모드를 유지합니다.",
  "quickActions.action.referenceOverlayOpacity100.title": "참조 오버레이 불투명도: 100%",
  "quickActions.action.referenceOverlayOpacity100.description":
    "참조 오버레이 불투명도를 100%로 설정하고 현재 모드를 유지합니다.",
  "quickActions.action.meshHeatmapToggle.enable": "메시 히트맵 활성화",
  "quickActions.action.meshHeatmapToggle.disable": "메시 히트맵 비활성화",
  "quickActions.action.meshHeatmapToggle.description":
    "클립 대상 메시 히트맵 오버레이를 전환합니다.",
  "quickActions.action.meshHeatmapIntensity50.title": "메시 히트맵 강도: 50%",
  "quickActions.action.meshHeatmapIntensity50.description":
    "히트맵을 활성화하고 강도를 50%로 설정합니다.",
  "quickActions.action.meshHeatmapIntensity100.title": "메시 히트맵 강도: 100%",
  "quickActions.action.meshHeatmapIntensity100.description":
    "히트맵을 활성화하고 강도를 100%로 설정합니다.",
  "quickActions.action.meshHeatmapIntensity150.title": "메시 히트맵 강도: 150%",
  "quickActions.action.meshHeatmapIntensity150.description":
    "히트맵을 활성화하고 강도를 150%로 설정합니다.",
  "quickActions.action.meshHeatmapIntensity200.title": "메시 히트맵 강도: 200%",
  "quickActions.action.meshHeatmapIntensity200.description":
    "히트맵을 활성화하고 강도를 200%로 설정합니다.",
  "imageImportOptions.title.openProject": "이미지 열기 설정",
  "imageImportOptions.title.importLayer": "이미지 가져오기 설정",
  "imageImportOptions.title.importLayers": "여러 이미지 가져오기 설정",
  "imageImportOptions.title.importFolder": "폴더 가져오기 설정",
  "imageImportOptions.description.openProject":
    "PNG를 새 프로젝트로 열 때 배치 방식을 선택합니다.",
  "imageImportOptions.description.importLayer":
    "이미지를 현재 프로젝트로 가져올 때 배치 방식을 선택합니다.",
  "imageImportOptions.description.importLayers":
    "여러 이미지를 현재 프로젝트로 가져올 때 배치 방식을 선택합니다.",
  "imageImportOptions.description.importFolder":
    "폴더의 이미지를 현재 프로젝트로 가져올 때 배치 방식을 선택합니다.",
  "imageImportOptions.centerOnCanvas": "캔버스 중앙에 배치",
  "imageImportOptions.trimTransparentBounds": "투명 경계 자르기",
  "imageImportOptions.createGroupForImportedLayers": "가져온 레이어 그룹 만들기",
  "imageImportOptions.autoGenerateMesh": "자동 메시 생성",
  "imageImportOptions.dragDropUsesDefaults":
    "PNG 드래그 앤 드롭은 계속 기본 가져오기 옵션을 사용합니다.",
  "imageImportOptions.largeImageAutoCentered":
    "가져온 이미지가 현재 캔버스보다 훨씬 커서 캔버스 중앙 배치를 자동 적용했습니다.",
  "imageImportOptions.transparentPaddingWarning":
    "가져온 이미지에 큰 투명 여백이 있습니다. 화면 밖으로 보이면 투명 경계 자르기를 켜세요.",
  "imageImportOptions.focusedViewportOnImport": "가져온 이미지로 보기를 맞췄습니다.",
  "imageImportOptions.focusedViewportOnImportMultiple":
    "가져온 이미지로 보기를 맞췄습니다.",
  "imageImportOptions.emptyPngFolder": "선택한 폴더에 PNG 이미지가 없습니다.",
  "imageImportOptions.projectRequiredForLayer":
    "레이어를 가져오기 전에 프로젝트를 여세요.",
  "imageImportOptions.projectRequiredForLayers":
    "여러 레이어를 가져오기 전에 프로젝트를 여세요.",
  "imageImportOptions.failedToBuildPngProject": "PNG 프로젝트를 만들지 못했습니다.",
  "imageImportOptions.reimportProjectRequired": "다시 가져오기 전에 프로젝트를 여세요.",
  "imageImportOptions.reimportEligibility":
    "이 프로젝트에는 다시 가져올 PNG 소스가 없습니다.",
  "imageImportOptions.reimportSourceMissing": "원본 PNG 소스를 찾을 수 없습니다.",
  "imageImportOptions.reimportMismatch": "PNG 소스가 현재 프로젝트와 일치하지 않습니다.",
  "imageImportOptions.reimportedPrefix": "다시 가져옴:",
  "export.spineTitle": "외부 JSON 내보내기",
  "export.noViviMesh": "ViviMesh 없음",
  "export.outputFiles": "출력 파일",
  "export.bonesSkinAnims": "본, 스킨 및 애니메이션",
  "export.textureAtlas": "텍스처 아틀라스",
  "export.selectingDest": "대상 위치 선택 중...",
  "export.generatingData": "내보내기 데이터 생성 중...",
  "export.writingFiles": "파일 쓰는 중...",
  "export.layers": "레이어",
  "export.animations": "애니메이션",
  "export.fileCountSuffix": "개 파일",
  "export.writingFileCountSuffix": "개 파일 쓰는 중...",
  "export.completedPrefix": "내보내기 완료:",
  "export.failedPrefix": "내보내기 실패:",
} as const satisfies Record<keyof typeof enDialog, string>;
