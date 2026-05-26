import { describe, expect, it, vi } from "vitest";
import { exportForSpine } from "@/lib/export";
import { createEmptyProject } from "@/test/fixtures";

vi.mock("@/lib/export/texture-exporter", () => ({
  exportTextures: vi.fn().mockResolvedValue([]),
}));

describe("export persistence boundary", () => {
  it("rejects editor-only local motion preview data before export", async () => {
    const project = createEmptyProject() as ReturnType<typeof createEmptyProject> & {
      previewOnly?: boolean;
    };
    project.previewOnly = true;

    await expect(exportForSpine(project, [])).rejects.toThrow(
      /local motion preview guard failed/,
    );
  });
});
