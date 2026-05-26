import { beforeEach, describe, expect, it } from "vitest";
import { setupProjectWithParameters } from "@/test/helpers";
import { useEditorStore } from "../editorStore";
import { useExpressionPresetStore } from "../expressionPresetStore";
import { useParameterStore } from "../parameterStore";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("expressionPresetStore", () => {
  beforeEach(() => {
    setupProjectWithParameters([
      { id: "p-eye-open", name: "目の開閉", min: 0, max: 1, defaultValue: 1 },
      { id: "p-mouth", name: "口の開閉", min: 0, max: 1, defaultValue: 0 },
      { id: "p-brow", name: "眉の角度", min: -30, max: 30, defaultValue: 0 },
    ]);
  });


  describe("createPreset", () => {
    it("現在のパラメータ値からプリセットを作成する", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.3);
      useParameterStore.getState().setParameterValue("p-mouth", 0.8);
      useParameterStore.getState().setParameterValue("p-brow", 15);

      const presetId = useExpressionPresetStore.getState().createPreset("笑顔");

      const project = useEditorStore.getState().project!;
      expect(project.expressionPresets).toBeDefined();
      expect(project.expressionPresets!.length).toBe(1);

      const preset = project.expressionPresets![0]!;
      expect(preset.id).toBe(presetId);
      expect(preset.values["p-eye-open"]).toBe(0.3);
      expect(preset.values["p-mouth"]).toBe(0.8);
      expect(preset.values["p-brow"]).toBe(15);
    });

    it("返されるIDがUUID形式である", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("テスト");
      expect(presetId).toMatch(UUID_RE);
    });

    it("returns an empty id when no project is loaded", () => {
      useEditorStore.setState({ project: null });

      const presetId = useExpressionPresetStore.getState().createPreset("missing");

      expect(presetId).toBe("");
    });

    it("名前が正しく設定される", () => {
      useExpressionPresetStore.getState().createPreset("怒り顔");

      const project = useEditorStore.getState().project!;
      const preset = project.expressionPresets![0]!;
      expect(preset.name).toBe("怒り顔");
    });
  });


  describe("applyPreset", () => {
    it("プリセットの値がパラメータに適用される", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.2);
      useParameterStore.getState().setParameterValue("p-mouth", 0.9);
      useParameterStore.getState().setParameterValue("p-brow", -10);
      const presetId = useExpressionPresetStore.getState().createPreset("泣き顔");

      useParameterStore.getState().setParameterValue("p-eye-open", 1);
      useParameterStore.getState().setParameterValue("p-mouth", 0);
      useParameterStore.getState().setParameterValue("p-brow", 0);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(1);

      useExpressionPresetStore.getState().applyPreset(presetId);

      const values = useParameterStore.getState().parameterValues;
      expect(values["p-eye-open"]).toBe(0.2);
      expect(values["p-mouth"]).toBe(0.9);
      expect(values["p-brow"]).toBe(-10);
    });

    it("存在しないIDで何もしない", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.5);
      useExpressionPresetStore.getState().applyPreset("nonexistent-id");

      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });


  describe("removePreset", () => {
    it("プリセットが削除される", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("削除対象");
      expect(useEditorStore.getState().project!.expressionPresets!.length).toBe(1);

      useExpressionPresetStore.getState().removePreset(presetId);
      expect(useEditorStore.getState().project!.expressionPresets!.length).toBe(0);
    });

    it("存在しないIDで何もしない", () => {
      useExpressionPresetStore.getState().createPreset("残る");
      expect(() =>
        useExpressionPresetStore.getState().removePreset("nonexistent"),
      ).not.toThrow();
      expect(useEditorStore.getState().project!.expressionPresets!.length).toBe(1);
    });
  });


  describe("renamePreset", () => {
    it("プリセット名が変更される", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("旧名");

      useExpressionPresetStore.getState().renamePreset(presetId, "新名");

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.name).toBe("新名");
    });
  });


  describe("updatePresetValues", () => {
    it("現在のパラメータ値でプリセットが上書きされる", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.5);
      const presetId = useExpressionPresetStore.getState().createPreset("上書き対象");

      const before = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(before.values["p-eye-open"]).toBe(0.5);

      useParameterStore.getState().setParameterValue("p-eye-open", 0.1);
      useParameterStore.getState().setParameterValue("p-mouth", 0.7);
      useExpressionPresetStore.getState().updatePresetValues(presetId);

      const after = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(after.values["p-eye-open"]).toBe(0.1);
      expect(after.values["p-mouth"]).toBe(0.7);
    });
  });


  describe("setHotkey", () => {
    it("ホットキーが設定される", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("ホットキー設定");

      useExpressionPresetStore.getState().setHotkey(presetId, 3);

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.hotkey).toBe(3);
    });

    it("同じホットキーが他のプリセットから解除される", () => {
      const idA = useExpressionPresetStore.getState().createPreset("プリセットA");
      const idB = useExpressionPresetStore.getState().createPreset("プリセットB");

      useExpressionPresetStore.getState().setHotkey(idA, 1);
      expect(useEditorStore.getState().project!.expressionPresets![0]!.hotkey).toBe(1);

      useExpressionPresetStore.getState().setHotkey(idB, 1);

      const presets = useEditorStore.getState().project!.expressionPresets!;
      const presetA = presets.find((p) => p.id === idA)!;
      const presetB = presets.find((p) => p.id === idB)!;
      expect(presetA.hotkey).toBeUndefined();
      expect(presetB.hotkey).toBe(1);
    });

    it("undefinedでホットキーが解除される", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("解除対象");
      useExpressionPresetStore.getState().setHotkey(presetId, 5);
      expect(useEditorStore.getState().project!.expressionPresets![0]!.hotkey).toBe(5);

      useExpressionPresetStore.getState().setHotkey(presetId, undefined);

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.hotkey).toBeUndefined();
    });
  });


  describe("applyByHotkey", () => {
    it("ホットキー番号でプリセットが適用される", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.2);
      useParameterStore.getState().setParameterValue("p-mouth", 0.6);
      const presetId = useExpressionPresetStore.getState().createPreset("ホットキー適用");
      useExpressionPresetStore.getState().setHotkey(presetId, 7);

      useParameterStore.getState().setParameterValue("p-eye-open", 1);
      useParameterStore.getState().setParameterValue("p-mouth", 0);

      useExpressionPresetStore.getState().applyByHotkey(7);

      const values = useParameterStore.getState().parameterValues;
      expect(values["p-eye-open"]).toBe(0.2);
      expect(values["p-mouth"]).toBe(0.6);
    });

    it("存在しないホットキーで何もしない", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.5);

      useExpressionPresetStore.getState().applyByHotkey(9);

      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });


  describe("複数プリセットの管理", () => {
    it("作成、適用、削除の組み合わせ", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.1);
      const idSmile = useExpressionPresetStore.getState().createPreset("笑顔");

      useParameterStore.getState().setParameterValue("p-eye-open", 0.8);
      const idAngry = useExpressionPresetStore.getState().createPreset("怒り");

      useParameterStore.getState().setParameterValue("p-eye-open", 0.5);
      const idSad = useExpressionPresetStore.getState().createPreset("悲しみ");

      expect(useEditorStore.getState().project!.expressionPresets!.length).toBe(3);

      useExpressionPresetStore.getState().applyPreset(idAngry);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.8);

      useExpressionPresetStore.getState().removePreset(idSmile);
      expect(useEditorStore.getState().project!.expressionPresets!.length).toBe(2);

      useExpressionPresetStore.getState().applyPreset(idSad);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);

      useExpressionPresetStore.getState().applyPreset(idSmile);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });


  describe("applyPreset — プロジェクトがnullの場合", () => {
    it("プロジェクトがnullの場合は何もしない", () => {
      useEditorStore.setState({ project: null });
      useParameterStore.setState({ parameterValues: { "p-eye-open": 0.5 } });

      useExpressionPresetStore.getState().applyPreset("any-id");
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });

  describe("applyPreset — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedの場合は何もしない", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });
      useParameterStore.setState({ parameterValues: { "p-eye-open": 0.5 } });

      useExpressionPresetStore.getState().applyPreset("any-id");
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });

  describe("removePreset — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedでもエラーにならない", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });

      expect(() =>
        useExpressionPresetStore.getState().removePreset("any-id"),
      ).not.toThrow();
    });
  });

  describe("renamePreset — 存在しないプリセットIDの場合", () => {
    it("存在しないIDでrenamePresetを呼んでも何もしない", () => {
      useExpressionPresetStore.getState().createPreset("残る名前");

      useExpressionPresetStore.getState().renamePreset("nonexistent-id", "新名");

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.name).toBe("残る名前");
    });
  });

  describe("renamePreset — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedでもエラーにならない", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });

      expect(() =>
        useExpressionPresetStore.getState().renamePreset("any-id", "名前"),
      ).not.toThrow();
    });
  });

  describe("updatePresetValues — 存在しないプリセットIDの場合", () => {
    it("存在しないIDでupdatePresetValuesを呼んでも何もしない", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.9);
      useExpressionPresetStore.getState().createPreset("変更されない");

      useExpressionPresetStore.getState().updatePresetValues("nonexistent-id");

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.values["p-eye-open"]).toBe(0.9);
    });
  });

  describe("updatePresetValues — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedでもエラーにならない", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });

      expect(() =>
        useExpressionPresetStore.getState().updatePresetValues("any-id"),
      ).not.toThrow();
    });
  });

  describe("setHotkey — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedでもエラーにならない", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });

      expect(() =>
        useExpressionPresetStore.getState().setHotkey("any-id", 1),
      ).not.toThrow();
    });
  });

  describe("setHotkey — 同じプリセットに同じホットキーを再設定", () => {
    it("同じプリセットに同じホットキーを設定しても変化しない", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("同一設定");
      useExpressionPresetStore.getState().setHotkey(presetId, 5);

      useExpressionPresetStore.getState().setHotkey(presetId, 5);

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.hotkey).toBe(5);
    });
  });

  describe("setHotkey — 存在しないプリセットIDの場合", () => {
    it("存在しないIDでsetHotkeyを呼んでも何もしない", () => {
      const presetId = useExpressionPresetStore.getState().createPreset("既存");
      useExpressionPresetStore.getState().setHotkey(presetId, 3);

      useExpressionPresetStore.getState().setHotkey("nonexistent-id", 3);

      const preset = useEditorStore.getState().project!.expressionPresets![0]!;
      expect(preset.hotkey).toBe(3);
    });
  });

  describe("applyByHotkey — プロジェクトがnullの場合", () => {
    it("プロジェクトがnullの場合は何もしない", () => {
      useEditorStore.setState({ project: null });
      useParameterStore.setState({ parameterValues: { "p-eye-open": 0.5 } });

      useExpressionPresetStore.getState().applyByHotkey(1);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });

  describe("applyByHotkey — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedの場合は何もしない", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });
      useParameterStore.setState({ parameterValues: { "p-eye-open": 0.5 } });

      useExpressionPresetStore.getState().applyByHotkey(1);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.5);
    });
  });

  describe("applyByHotkey — ホットキーが一致するプリセットがない場合", () => {
    it("一致するホットキーがなければ何もしない", () => {
      useParameterStore.getState().setParameterValue("p-eye-open", 0.7);
      useExpressionPresetStore.getState().createPreset("ホットキーなし");

      useExpressionPresetStore.getState().applyByHotkey(5);
      expect(useParameterStore.getState().parameterValues["p-eye-open"]).toBe(0.7);
    });
  });

  describe("createPreset — expressionPresetsがundefinedの場合", () => {
    it("expressionPresetsがundefinedの場合に初回プリセットが作成される", () => {
      useEditorStore.setState((s) => {
        if (s.project) {
          delete (s.project as Record<string, unknown>).expressionPresets;
        }
      });
      useParameterStore.setState({ parameterValues: { "p-eye-open": 0.5 } });

      const presetId = useExpressionPresetStore.getState().createPreset("初回プリセット");

      const project = useEditorStore.getState().project!;
      expect(project.expressionPresets).toBeDefined();
      expect(project.expressionPresets!.length).toBe(1);
      expect(project.expressionPresets![0]!.id).toBe(presetId);
      expect(project.expressionPresets![0]!.name).toBe("初回プリセット");
      expect(project.expressionPresets![0]!.values["p-eye-open"]).toBe(0.5);
    });
  });
});
