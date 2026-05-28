import { layer as enLayer } from "../en/layer";

export const layer = {
  ...enLayer,
  "layer.title": "레이어",
  "layer.openPsd": "PSD 파일을 열어 주세요",
  "layer.addBone": "본 추가",
  "layer.boneName": "본",
  "layer.hide": "숨기기",
  "layer.show": "표시",
  "layer.soloView": "단독 보기 (Ctrl+클릭으로 추가)",
  "layer.clippingApplied": "클리핑 마스크 적용됨",
  "layer.expand": "펼치기",
  "layer.collapse": "접기",
  "layer.dragReorder": "드래그하여 순서 변경",
} as const satisfies Record<keyof typeof enLayer, string>;
