import { timeline as enTimeline } from "../en/timeline";

export const timeline = {
  ...enTimeline,
  "timeline.noClip": "创建或选择一个剪辑",
  "timeline.sceneNone": "没有场景",
  "timeline.clipNone": "没有剪辑",
  "timeline.stopTitle": "停止",
  "timeline.stopButton": "停止",
  "timeline.playTitle": "播放",
  "timeline.playButton": "播放",
  "timeline.loopTitle": "循环",
  "timeline.loopButton": "循环",
  "timeline.switchToGraphEditor": "切换到曲线编辑器",
  "timeline.graphButton": "曲线",
  "timeline.motionPresetButtonTitle": "打开动作预设",
  "timeline.motionPresetButtonLabel": "预设...",
  "timeline.firstMotionButtonTitle": "创建初始动作剪辑",
  "timeline.firstMotionButtonLabel": "初始动作...",
  "timeline.idleSynthButtonTitle": "打开待机动作生成",
  "timeline.idleSynthButtonLabel": "待机动作...",
} as const satisfies Record<keyof typeof enTimeline, string>;
