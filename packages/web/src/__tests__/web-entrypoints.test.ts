import { afterEach, describe, expect, it, vi } from "vitest";

describe("@vivi2d/web entrypoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("keeps the root import side-effect free", async () => {
    const defineSpy = vi
      .spyOn(customElements, "define")
      .mockImplementation(() => undefined);

    await import("../index");

    expect(defineSpy).not.toHaveBeenCalled();
  });

  it("exports the programmatic SDK surface from the root entrypoint", async () => {
    const module = await import("../index");

    expect(module.createViviWebPlayer).toBeTypeOf("function");
    expect(module.loadViviWebModel).toBeTypeOf("function");
    expect(module.isViviWebError).toBeTypeOf("function");
    expect(module.isViviWebModel).toBeTypeOf("function");
    expect(module.ViviWebError).toBeTypeOf("function");
  });

  it("registers explicitly through defineViviModelElement", async () => {
    vi.spyOn(customElements, "get").mockReturnValue(undefined);
    const defineSpy = vi
      .spyOn(customElements, "define")
      .mockImplementation(() => undefined);
    const { defineViviModelElement, ViviModelElement } = await import("../index");

    const result = defineViviModelElement("vivi-model-explicit");

    expect(result).toBe(ViviModelElement);
    expect(defineSpy).toHaveBeenCalledWith("vivi-model-explicit", ViviModelElement);
  });

  it("registers the default element through the auto-register entrypoint", async () => {
    vi.spyOn(customElements, "get").mockReturnValue(undefined);
    const defineSpy = vi
      .spyOn(customElements, "define")
      .mockImplementation(() => undefined);

    await import("../auto-register");
    const { ViviModelElement } = await import("../index");

    expect(defineSpy).toHaveBeenCalledWith("vivi-model", ViviModelElement);
  });

  it("does not redefine an existing element through auto-register", async () => {
    vi.spyOn(customElements, "get").mockReturnValue(
      class ExistingViviModelElement extends HTMLElement {},
    );
    const defineSpy = vi
      .spyOn(customElements, "define")
      .mockImplementation(() => undefined);

    await import("../auto-register");

    expect(defineSpy).not.toHaveBeenCalled();
  });
});
