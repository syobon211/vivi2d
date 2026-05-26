import {
  applyLipSyncTemplate,
  applyParameterTemplate,
  applyPhysicsTemplate,
  applyTemplate,
  BUILTIN_TEMPLATES,
} from "@vivi2d/core/templates";
import type { ParameterTemplateEntry, ProjectData, Template } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { createEmptyProject } from "@/test/fixtures";


function emptyProject(): ProjectData {
  return { ...createEmptyProject(), sceneBlends: [] };
}

// ============================================================
// applyParameterTemplate
// ============================================================

describe("applyParameterTemplate", () => {
  it("パラメータが正しく追加される", () => {
    const project = emptyProject();
    const entries: ParameterTemplateEntry[] = [
      { name: "テストX", minValue: -10, maxValue: 10, defaultValue: 0 },
      { name: "テストY", minValue: -5, maxValue: 5, defaultValue: 1 },
    ];
    const result = applyParameterTemplate(project, entries);

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(project.parameters).toHaveLength(2);
    expect(project.parameters[0]!.name).toBe("テストX");
    expect(project.parameters[1]!.name).toBe("テストY");
    expect(project.parameters[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("同名パラメータが存在する場合はスキップされる", () => {
    const project = emptyProject();
    project.parameters.push({
      id: "existing-id",
      name: "重複パラメータ",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
    });

    const entries: ParameterTemplateEntry[] = [
      { name: "重複パラメータ", minValue: -10, maxValue: 10, defaultValue: 0 },
      { name: "新規パラメータ", minValue: 0, maxValue: 100, defaultValue: 50 },
    ];
    const result = applyParameterTemplate(project, entries);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(project.parameters).toHaveLength(2);
    expect(project.parameters[0]!.id).toBe("existing-id");
  });

  it("ペアパラメータ(pairedParameterId)が名前で解決される", () => {
    const project = emptyProject();
    const entries: ParameterTemplateEntry[] = [
      {
        name: "角度 X",
        minValue: -30,
        maxValue: 30,
        defaultValue: 0,
        pairedName: "角度 Y",
      },
      { name: "角度 Y", minValue: -30, maxValue: 30, defaultValue: 0 },
    ];
    applyParameterTemplate(project, entries);

    const paramX = project.parameters.find((p) => p.name === "角度 X")!;
    const paramY = project.parameters.find((p) => p.name === "角度 Y")!;
    expect(paramX.pairedParameterId).toBe(paramY.id);
    expect(paramY.pairedParameterId).toBeUndefined();
  });

  it("added/skipped カウントが正しい", () => {
    const project = emptyProject();
    project.parameters.push({
      id: "a",
      name: "既存A",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
    });
    project.parameters.push({
      id: "b",
      name: "既存B",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0,
    });

    const entries: ParameterTemplateEntry[] = [
      { name: "既存A", minValue: 0, maxValue: 1, defaultValue: 0 },
      { name: "既存B", minValue: 0, maxValue: 1, defaultValue: 0 },
      { name: "新規C", minValue: 0, maxValue: 1, defaultValue: 0 },
    ];
    const result = applyParameterTemplate(project, entries);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
    expect(project.parameters).toHaveLength(3);
  });

  it("グループ情報が引き継がれる", () => {
    const project = emptyProject();
    const entries: ParameterTemplateEntry[] = [
      { name: "目 開閉", minValue: 0, maxValue: 1, defaultValue: 1, group: "目" },
    ];
    applyParameterTemplate(project, entries);

    expect(project.parameters[0]!.group).toBe("目");
  });
});

// ============================================================
// applyPhysicsTemplate
// ============================================================

describe("applyPhysicsTemplate", () => {
  it("物理グループが新規IDで追加される", () => {
    const project = emptyProject();
    const groups = [
      {
        name: "前髪",
        enabled: true,
        pendulums: [{ length: 0.8, mass: 1.0, damping: 0.05 }],
        inputs: [],
        outputs: [],
        gravityDirection: 0,
        gravityStrength: 9.8,
        wind: 0,
      },
    ];
    const ids = applyPhysicsTemplate(project, groups);

    expect(ids).toHaveLength(1);
    expect(project.physicsGroups).toHaveLength(1);
    expect(project.physicsGroups[0]!.id).toBe(ids[0]);
    expect(project.physicsGroups[0]!.name).toBe("前髪");
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("複数グループが同時に追加される", () => {
    const project = emptyProject();
    const groups = [
      {
        name: "前髪",
        enabled: true,
        pendulums: [{ length: 0.8, mass: 1.0, damping: 0.05 }],
        inputs: [],
        outputs: [],
        gravityDirection: 0,
        gravityStrength: 9.8,
        wind: 0,
      },
      {
        name: "横髪",
        enabled: true,
        pendulums: [{ length: 1.0, mass: 0.8, damping: 0.04 }],
        inputs: [],
        outputs: [],
        gravityDirection: 0,
        gravityStrength: 9.8,
        wind: 0,
      },
    ];
    const ids = applyPhysicsTemplate(project, groups);

    expect(ids).toHaveLength(2);
    expect(project.physicsGroups).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(project.physicsGroups[0]!.name).toBe("前髪");
    expect(project.physicsGroups[1]!.name).toBe("横髪");
  });
});

// ============================================================
// applyLipSyncTemplate
// ============================================================

describe("applyLipSyncTemplate", () => {
  it("リップシンク設定がマージされる", () => {
    const project = emptyProject();
    expect(project.lipsyncConfig.enabled).toBe(false);

    applyLipSyncTemplate(project, {
      enabled: true,
      mode: "viseme",
      visemeSmoothing: 0.3,
    });

    expect(project.lipsyncConfig.enabled).toBe(true);
    expect(project.lipsyncConfig.mode).toBe("viseme");
    expect(project.lipsyncConfig.visemeSmoothing).toBe(0.3);
    expect(project.lipsyncConfig.threshold).toBeDefined();
    expect(project.lipsyncConfig.smoothing).toBeDefined();
  });
});


describe("applyTemplate", () => {
  it("parameter カテゴリのディスパッチが正しく動作する", () => {
    const project = emptyProject();
    const template: Template = {
      id: "test-param",
      name: "テスト",
      category: "parameter",
      description: "テスト用",
      data: {
        type: "parameter",
        entries: [{ name: "テストP", minValue: 0, maxValue: 1, defaultValue: 0 }],
      },
    };
    const result = applyTemplate(project, template);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(project.parameters).toHaveLength(1);
  });

  it("physics カテゴリのディスパッチが正しく動作する", () => {
    const project = emptyProject();
    const template: Template = {
      id: "test-physics",
      name: "テスト物理",
      category: "physics",
      description: "テスト用",
      data: {
        type: "physics",
        groups: [
          {
            name: "揺れ",
            enabled: true,
            pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
            inputs: [],
            outputs: [],
            gravityDirection: 0,
            gravityStrength: 9.8,
            wind: 0,
          },
        ],
      },
    };
    const result = applyTemplate(project, template);

    expect(result.groupIds).toHaveLength(1);
    expect(project.physicsGroups).toHaveLength(1);
  });

  it("lipsync カテゴリのディスパッチが正しく動作する", () => {
    const project = emptyProject();
    const template: Template = {
      id: "test-lipsync",
      name: "テストリップシンク",
      category: "lipsync",
      description: "テスト用",
      data: {
        type: "lipsync",
        config: { enabled: true, mode: "rms" },
      },
    };
    const result = applyTemplate(project, template);

    expect(result.added).toBeUndefined();
    expect(result.groupIds).toBeUndefined();
    expect(project.lipsyncConfig.enabled).toBe(true);
  });
});

// ============================================================
// BUILTIN_TEMPLATES
// ============================================================

describe("BUILTIN_TEMPLATES", () => {
  it("全テンプレートが一意のIDを持つ", () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("category と data.type が一致する", () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.data.type).toBe(template.category);
    }
  });

  it("テンプレート数が7以上存在する", () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(7);
  });

  it("各テンプレートにname/descriptionが設定されている", () => {
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.name).toMatch(/\S/);
      expect(template.description).toMatch(/\S/);
    }
  });
});
