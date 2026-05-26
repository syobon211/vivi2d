import { layer as enLayer } from "../en/layer";

export const layer = {
  ...enLayer,
  "layer.title": "图层",
  "layer.openPsd": "请打开 PSD 文件",
  "layer.addBone": "添加骨骼",
  "layer.boneName": "骨骼",
  "layer.hide": "隐藏",
  "layer.show": "显示",
  "layer.soloView": "单独显示（Ctrl+点击添加）",
  "layer.clippingApplied": "已应用剪贴蒙版",
  "layer.expand": "展开",
  "layer.collapse": "折叠",
  "layer.dragReorder": "拖动以重新排序",
} as const satisfies Record<keyof typeof enLayer, string>;
