import { shortcut as enShortcut } from "../en/shortcut";

export const shortcut = {
  ...enShortcut,
  "shortcut.title": "단축키 설정",
  "shortcut.action": "작업",
  "shortcut.shortcutCol": "단축키",
  "shortcut.clickToChange": "키를 변경하려면 클릭",
  "shortcut.pressKey": "키를 누르세요...",
  "shortcut.restoreDefault": "기본값 복원",
  "shortcut.resetAll": "모두 초기화",
  "shortcut.conflictPrefix": "충돌:",
  "shortcut.action.undo": "실행 취소",
  "shortcut.action.redo": "다시 실행",
  "shortcut.action.save": "저장",
  "shortcut.action.saveAs": "다른 이름으로 저장",
  "shortcut.action.moveLayerUp": "레이어 위로 이동",
  "shortcut.action.moveLayerDown": "레이어 아래로 이동",
  "shortcut.action.selectAll": "전체 선택",
  "shortcut.action.toolSelect": "선택 도구",
  "shortcut.action.toolPan": "이동 도구",
  "shortcut.action.toolMeshEdit": "메시 편집 도구",
  "shortcut.action.tempPan": "임시 이동(누르고 있기)",
} as const satisfies Record<keyof typeof enShortcut, string>;
