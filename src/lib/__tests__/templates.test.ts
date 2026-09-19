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
    const existingA = {
      id: "a",
      name: "既存A",
      minValue: -3,
      maxValue: 7,
      defaultValue: 2,
      group: "既存",
    };
    const existingB = {
      id: "b",
      name: "既存B",
      minValue: 4,
      maxValue: 8,
      defaultValue: 5,
    };
    project.parameters.push(existingA, existingB);
    const entries: ParameterTemplateEntry[] = [
      { name: "既存A", minValue: 0, maxValue: 100, defaultValue: 50 },
      { name: "新規C", minValue: -10, maxValue: 10, defaultValue: 1, group: "目" },
      { name: "既存B", minValue: -100, maxValue: 0, defaultValue: -50 },
      { name: "新規D", minValue: 0, maxValue: 2, defaultValue: 0.5 },
    ];
    expect(applyParameterTemplate(project, entries)).toEqual({ added: 2, skipped: 2 });
    expect(project.parameters).toHaveLength(4);
    expect(project.parameters[0]).toBe(existingA);
    expect(project.parameters[1]).toBe(existingB);
    expect(existingA).toEqual({
      id: "a",
      name: "既存A",
      minValue: -3,
      maxValue: 7,
      defaultValue: 2,
      group: "既存",
    });
    expect(existingB).toEqual({
      id: "b",
      name: "既存B",
      minValue: 4,
      maxValue: 8,
      defaultValue: 5,
    });
    const [addedC, addedD] = project.parameters.slice(2);
    expect(addedC).toEqual({
      id: expect.any(String),
      name: "新規C",
      minValue: -10,
      maxValue: 10,
      defaultValue: 1,
      group: "目",
    });
    expect(addedD).toEqual({
      id: expect.any(String),
      name: "新規D",
      minValue: 0,
      maxValue: 2,
      defaultValue: 0.5,
      group: undefined,
    });
    expect(addedC!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(addedD!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(new Set(project.parameters.map((parameter) => parameter.id)).size).toBe(4);
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
});

// ============================================================
// applyPhysicsTemplate
// ============================================================

describe("applyPhysicsTemplate", () => {
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
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(ids[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(project.physicsGroups).toEqual([
      { ...groups[0], id: ids[0] },
      { ...groups[1], id: ids[1] },
    ]);
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
