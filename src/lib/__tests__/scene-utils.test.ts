import { findClipInProject } from "@vivi2d/core/scene-utils";
import { describe, expect, it } from "vitest";
import { createProject } from "@/test/fixtures";

describe("findClipInProject", () => {
  it("空のプロジェクトでは undefined を返す", () => {
    const project = createProject();
    expect(findClipInProject(project, "nonexistent")).toBeUndefined();
  });

  it("scenes 内のクリップを検索できる", () => {
    const project = createProject({
      scenes: [
        {
          id: "s1",
          name: "シーン1",
          clips: [{ id: "c1", name: "クリップ1", duration: 30, fps: 30, tracks: [] }],
        },
      ],
    });
    const clip = findClipInProject(project, "c1");
    expect(clip).toBeDefined();
    expect(clip!.name).toBe("クリップ1");
  });

  it("存在しないIDでは undefined を返す", () => {
    const project = createProject({
      scenes: [
        {
          id: "s1",
          name: "シーン1",
          clips: [{ id: "c1", name: "クリップ1", duration: 30, fps: 30, tracks: [] }],
        },
      ],
    });
    expect(findClipInProject(project, "no-such-id")).toBeUndefined();
  });
});
