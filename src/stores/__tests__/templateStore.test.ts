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
          const angleX = project.parameters.find((p) => p.name === "顔 X");
          const angleY = project.parameters.find((p) => p.name === "顔 Y");
          expect(angleX).toBeDefined();
          expect(angleY).toBeDefined();
          expect(angleX!.pairedParameterId).toBe(angleY!.id);
          const count = project.parameters.length;
          const repeated = useTemplateStore.getState().applyTemplate("builtin-param-face");
          expect(repeated!.added).toBe(0);
          expect(repeated!.skipped).toBe(result!.added);
          expect(useEditorStore.getState().project!.parameters).toEqual(project.parameters);
          expect(useEditorStore.getState().project!.parameters).toHaveLength(count);
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


  });

  describe("getTemplatesByCategory", () => {
    it("各カテゴリの非空・所属と全カテゴリの合計を検証する", () => {
      let total = 0;
      for (const category of ["parameter", "physics", "lipsync"] as const) {
        const templates = useTemplateStore.getState().getTemplatesByCategory(category);
        expect(templates.length).toBeGreaterThan(0);
        expect(templates.every((template) => template.category === category)).toBe(true);
        total += templates.length;
      }
      expect(total).toBe(BUILTIN_TEMPLATES.length);
    });






  });
});
