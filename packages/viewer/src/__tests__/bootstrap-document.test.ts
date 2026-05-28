import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyViewerBootstrapLocale } from "../bootstrap-document";

const STORAGE_KEY = "vivi-viewer-locale";

describe("viewer bootstrap document state", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  it("defaults the document language to English", () => {
    applyViewerBootstrapLocale();
    expect(document.documentElement.lang).toBe("en");
  });

  it("restores a valid persisted locale before React renders", () => {
    localStorage.setItem(STORAGE_KEY, "ko_kr");
    applyViewerBootstrapLocale();
    expect(document.documentElement.lang).toBe("ko-KR");
  });

  it("falls back to English for an invalid persisted locale before React renders", () => {
    localStorage.setItem(STORAGE_KEY, "fr-FR");
    applyViewerBootstrapLocale();
    expect(document.documentElement.lang).toBe("en");
  });
});
