import type { ParameterTemplateEntry, Template } from "@vivi2d/core/types";
import type { Locale } from "./i18n";

const TEMPLATE_TEXT_JA: Record<string, { name: string; description: string }> = {
  "builtin-param-face": {
    name: "標準顔パラメータ",
    description: "目、眉、口、角度向けの標準的な顔パラメータセットです。",
  },
  "builtin-param-body": {
    name: "体パラメータ",
    description: "体の回転、呼吸、腕のパラメータです。",
  },
  "builtin-param-full": {
    name: "フルセット（顔 + 体）",
    description: "顔と体のパラメータをまとめて追加します。",
  },
  "builtin-physics-hair": {
    name: "髪揺れ（3段チェーン）",
    description: "頭パラメータで動かす3段の振り子式ヘア物理です。",
  },
  "builtin-physics-accessory": {
    name: "リボン / アクセサリ（2段チェーン）",
    description: "リボンや小物向けの軽く減衰した物理設定です。",
  },
  "builtin-lipsync-japanese": {
    name: "日本語リップシンク（あ/い/う/え/お）",
    description: "音量ベースの口開きと母音形状ターゲットを設定します。",
  },
  "builtin-lipsync-simple": {
    name: "シンプルリップシンク（音量のみ）",
    description: "RMS 音量だけで口開きを制御する簡易設定です。",
  },
};

const PARAMETER_NAME_JA: Record<string, string> = {
  "Face X": "顔 X",
  "Face Y": "顔 Y",
  "Face Z": "顔 Z",
  "Left Eye Open": "左目 開閉",
  "Right Eye Open": "右目 開閉",
  "Eye Ball X": "瞳 X",
  "Eye Ball Y": "瞳 Y",
  "Left Brow": "左眉",
  "Right Brow": "右眉",
  "Mouth Open": "口 開閉",
  "Mouth A": "口 あ",
  "Mouth I": "口 い",
  "Mouth U": "口 う",
  "Mouth E": "口 え",
  "Mouth O": "口 お",
  "Body Rotation X": "体 回転 X",
  "Body Rotation Y": "体 回転 Y",
  "Body Rotation Z": "体 回転 Z",
  Breath: "呼吸",
  "Left Arm": "左腕",
  "Right Arm": "右腕",
};

const PARAMETER_GROUP_JA: Record<string, string> = {
  Face: "顔",
  Eyes: "目",
  Brows: "眉",
  Mouth: "口",
  Body: "体",
  Arms: "腕",
};

const PHYSICS_GROUP_JA: Record<string, string> = {
  "Front Hair": "前髪",
  "Left Side Hair": "左横髪",
  "Right Side Hair": "右横髪",
  Ribbon: "リボン",
};

function localizeParameterEntryJa(entry: ParameterTemplateEntry): ParameterTemplateEntry {
  return {
    ...entry,
    name: PARAMETER_NAME_JA[entry.name] ?? entry.name,
    group: entry.group ? PARAMETER_GROUP_JA[entry.group] ?? entry.group : entry.group,
    pairedName: entry.pairedName
      ? PARAMETER_NAME_JA[entry.pairedName] ?? entry.pairedName
      : entry.pairedName,
  };
}

export function localizeTemplateForLocale(template: Template, locale: Locale): Template {
  if (locale !== "ja") return template;
  const text = TEMPLATE_TEXT_JA[template.id];

  switch (template.data.type) {
    case "parameter":
      return {
        ...template,
        name: text?.name ?? template.name,
        description: text?.description ?? template.description,
        data: {
          type: "parameter",
          entries: template.data.entries.map(localizeParameterEntryJa),
        },
      };
    case "physics":
      return {
        ...template,
        name: text?.name ?? template.name,
        description: text?.description ?? template.description,
        data: {
          type: "physics",
          groups: template.data.groups.map((group) => ({
            ...group,
            name: PHYSICS_GROUP_JA[group.name] ?? group.name,
          })),
        },
      };
    case "lipsync":
      return {
        ...template,
        name: text?.name ?? template.name,
        description: text?.description ?? template.description,
      };
  }
}
