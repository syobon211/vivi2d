import { beforeEach, describe, expect, it } from "vitest";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { resetAllStores } from "@/test/store-reset";

describe("quickActionsStore", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("opens and closes the palette", () => {
    useQuickActionsStore.getState().openPalette();
    expect(useQuickActionsStore.getState().open).toBe(true);

    useQuickActionsStore.getState().closePalette();
    expect(useQuickActionsStore.getState().open).toBe(false);
  });

  it("toggles the palette state", () => {
    useQuickActionsStore.getState().togglePalette();
    expect(useQuickActionsStore.getState().open).toBe(true);

    useQuickActionsStore.getState().togglePalette();
    expect(useQuickActionsStore.getState().open).toBe(false);
  });
});
