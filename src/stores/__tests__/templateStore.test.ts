import { BUILTIN_TEMPLATES } from "@vivi2d/core/templates";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestProject } from "@/test/helpers";
import { useEditorStore } from "../editorStore";
import { useTemplateStore } from "../templateStore";


describe("templateStore", () => {
  beforeEach(() => {
    setupTestProject({ parameters: [], physicsGroups: [] });
  });

  describe("applyTemplate", () => {
    it("パラメータテンプレートを適用する", () => {
      const result = useTemplateStore.getState().applyTemplate("builtin-param-face");

      expect(result).not.toBeNull();
      expect(result!.added).toBeGreaterThan(0);
      expect(result!.skipped).toBe(0);

      const project = useEditorStore.getState().project!;
      expect(project.parameters.length).toBeGreaterThan(0);
      expect(project.parameters.some((p) => p.name === "顔 X")).toBe(true);
    });

    it("体パラメータテンプレートを適用する", () => {
      const result = useTemplateStore.getState().applyTemplate("builtin-param-body");

      expect(result).not.toBeNull();
      expect(result!.added).toBeGreaterThan(0);
      const project = useEditorStore.getState().project!;
      expect(project.parameters.some((p) => p.name === "呼吸")).toBe(true);
    });

    it("フルセットテンプレートで顔+体パラメータが追加される", () => {
      const result = useTemplateStore.getState().applyTemplate("builtin-param-full");

      expect(result).not.toBeNull();
      const project = useEditorStore.getState().project!;
      expect(project.parameters.some((p) => p.name === "顔 X")).toBe(true);
      expect(project.parameters.some((p) => p.name === "呼吸")).toBe(true);
    });

    it("同名パラメータが既存の場合はスキップする", () => {
      useTemplateStore.getState().applyTemplate("builtin-param-face");
      const count1 = useEditorStore.getState().project!.parameters.length;

      const result = useTemplateStore.getState().applyTemplate("builtin-param-face");
      expect(result!.skipped).toBe(result!.added! + result!.skipped!);
      expect(result!.added).toBe(0);
      expect(useEditorStore.getState().project!.parameters.length).toBe(count1);
    });

    it("物理テンプレートを適用する", () => {
      const result = useTemplateStore.getState().applyTemplate("builtin-physics-hair");

      expect(result).not.toBeNull();
      expect(result!.groupIds).toBeDefined();
      expect(result!.groupIds!.length).toBeGreaterThan(0);

      const project = useEditorStore.getState().project!;
      expect(project.physicsGroups.length).toBeGreaterThan(0);
      expect(project.physicsGroups.some((g) => g.name === "前髪")).toBe(true);
    });

    it("リップシンクテンプレートを適用する", () => {
      const result = useTemplateStore
        .getState()
        .applyTemplate("builtin-lipsync-japanese");

      expect(result).not.toBeNull();
      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.enabled).toBe(true);
    });

    it("シンプルリップシンクテンプレートを適用する", () => {
      const result = useTemplateStore.getState().applyTemplate("builtin-lipsync-simple");

      expect(result).not.toBeNull();
      const project = useEditorStore.getState().project!;
      expect(project.lipsyncConfig.enabled).toBe(true);
    });

    it("存在しないテンプレートIDでは null を返す", () => {
      const result = useTemplateStore.getState().applyTemplate("nonexistent");
      expect(result).toBeNull();
    });

    it("ペアパラメータが正しくリンクされる", () => {
      useTemplateStore.getState().applyTemplate("builtin-param-face");

      const project = useEditorStore.getState().project!;
      const angleX = project.parameters.find((p) => p.name === "顔 X");
      const angleY = project.parameters.find((p) => p.name === "顔 Y");
      expect(angleX).toBeDefined();
      expect(angleY).toBeDefined();
      expect(angleX!.pairedParameterId).toBe(angleY!.id);
    });
  });

  describe("getTemplatesByCategory", () => {
    it("パラメータカテゴリのテンプレートを返す", () => {
      const templates = useTemplateStore.getState().getTemplatesByCategory("parameter");
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === "parameter")).toBe(true);
    });

    it("物理カテゴリのテンプレートを返す", () => {
      const templates = useTemplateStore.getState().getTemplatesByCategory("physics");
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === "physics")).toBe(true);
    });

    it("リップシンクカテゴリのテンプレートを返す", () => {
      const templates = useTemplateStore.getState().getTemplatesByCategory("lipsync");
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === "lipsync")).toBe(true);
    });

    it("全カテゴリの合計が組み込みテンプレート数と一致する", () => {
      const params = useTemplateStore.getState().getTemplatesByCategory("parameter");
      const physics = useTemplateStore.getState().getTemplatesByCategory("physics");
      const lipsync = useTemplateStore.getState().getTemplatesByCategory("lipsync");
      expect(params.length + physics.length + lipsync.length).toBe(
        BUILTIN_TEMPLATES.length,
      );
    });
  });
});
