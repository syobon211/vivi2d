import { timeline as enTimeline } from "../en/timeline";

export const timeline = {
  ...enTimeline,
  "timeline.noClip": "클립을 만들거나 선택하세요",
  "timeline.sceneNone": "장면 없음",
  "timeline.clipNone": "클립 없음",
  "timeline.stopTitle": "정지",
  "timeline.stopButton": "정지",
  "timeline.playTitle": "재생",
  "timeline.playButton": "재생",
  "timeline.loopTitle": "반복",
  "timeline.loopButton": "반복",
  "timeline.switchToGraphEditor": "그래프 편집기로 전환",
  "timeline.graphButton": "그래프",
  "timeline.motionPresetButtonTitle": "모션 프리셋 열기",
  "timeline.motionPresetButtonLabel": "프리셋...",
  "timeline.firstMotionButtonTitle": "첫 모션 클립 만들기",
  "timeline.firstMotionButtonLabel": "첫 모션...",
  "timeline.idleSynthButtonTitle": "대기 모션 생성 열기",
  "timeline.idleSynthButtonLabel": "대기 모션...",
} as const satisfies Record<keyof typeof enTimeline, string>;
