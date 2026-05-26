import { shortcut as enShortcut } from "../en/shortcut";

export const shortcut = {
  ...enShortcut,
  "shortcut.title": "快捷键设置",
  "shortcut.action": "操作",
  "shortcut.shortcutCol": "快捷键",
  "shortcut.clickToChange": "点击更改按键",
  "shortcut.pressKey": "按下一个键...",
  "shortcut.restoreDefault": "恢复默认",
  "shortcut.resetAll": "全部重置",
  "shortcut.conflictPrefix": "冲突：",
  "shortcut.action.undo": "撤销",
  "shortcut.action.redo": "重做",
  "shortcut.action.save": "保存",
  "shortcut.action.saveAs": "另存为",
  "shortcut.action.moveLayerUp": "上移图层",
  "shortcut.action.moveLayerDown": "下移图层",
  "shortcut.action.selectAll": "全选",
  "shortcut.action.toolSelect": "选择工具",
  "shortcut.action.toolPan": "平移工具",
  "shortcut.action.toolMeshEdit": "网格编辑工具",
  "shortcut.action.tempPan": "临时平移（按住）",
} as const satisfies Record<keyof typeof enShortcut, string>;
