import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { resetAllStores } from "@/test/store-reset";

describe("quickActionRegistryStore", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("registers and unregisters actions", () => {
    const run = vi.fn();
    useQuickActionRegistryStore.getState().registerAction({
      id: "test.action",
      section: "project",
      title: "Test action",
      keywords: ["test"],
      order: 10,
      run,
      getAvailability: () => ({ enabled: true }),
    });

    expect(useQuickActionRegistryStore.getState().actions["test.action"]?.title).toBe(
      "Test action",
    );

    useQuickActionRegistryStore.getState().unregisterAction("test.action");
    expect(useQuickActionRegistryStore.getState().actions["test.action"]).toBeUndefined();
  });
});
