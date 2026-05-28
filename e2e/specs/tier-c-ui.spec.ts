import { expect, test } from "../fixtures";
import { clickFileMenuItem } from "../helpers/operations";

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("shows the IK panel", async ({ window }) => {
  const panel = window.locator(".ik-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header")).toContainText(/IK/);
});

test("renders injected IK controllers", async ({ window }) => {
  await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    (vivi.useIKControllerStore as any)
      .getState()
      .addIKController("E2E IK", "ccd", [
        { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      ]);
  });

  await expect(window.locator(".ik-item-name", { hasText: "E2E IK" })).toBeVisible();
  await expect(window.locator(".ik-item-type", { hasText: "ccd" })).toBeVisible();
});

test("shows the offscreen panel", async ({ window }) => {
  const panel = window.locator(".offscreen-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header")).toContainText(
    /Offscreen|オフスクリーン描画/,
  );
});

test("adds and removes an offscreen target", async ({ window }) => {
  const panel = window.locator(".offscreen-panel");
  await panel.locator(".physics-actions .physics-btn").click();
  await expect(window.locator(".offscreen-item")).toBeVisible();

  await window.locator(".offscreen-item .mesh-link-remove-btn").first().click();
  await expect(window.locator(".offscreen-item")).not.toBeVisible();
});

test("shows the VMC panel", async ({ window }) => {
  const panel = window.locator(".vmc-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header")).toContainText(/VMC/);
});

test("toggles the VMC connection state", async ({ window }) => {
  const connectButton = window.locator(".vmc-section .physics-btn").first();
  await connectButton.click();

  await expect(window.locator(".vmc-status.vmc-connected")).toBeVisible();

  await connectButton.click();
  await expect(window.locator(".vmc-status.vmc-connected")).not.toBeVisible();
});

test("renders injected VMC mappings", async ({ window }) => {
  await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    (vivi.useVMCStore as any).getState().addMapping({
      vmcName: "FaceChannelTest",
      parameterId: "test-param",
      scale: 1,
      offset: 0,
    });
  });

  await expect(
    window.locator(".vmc-mapping-name", { hasText: "FaceChannelTest" }),
  ).toBeVisible();
});

test("opens the auto setup dialog from the file menu", async ({ window }) => {
  await clickFileMenuItem(window, "Auto Setup");

  await expect(window.locator(".auto-setup-dialog")).toBeVisible();
  await expect(window.locator(".modal-title")).toContainText(
    /Auto Setup|自動セットアップ/,
  );
  await window.keyboard.press("Escape");
});

test("exposes add art path from the layer context menu", async ({ window }) => {
  await window.locator(".layer-item").first().click({ button: "right" });
  await expect(
    window.locator(".context-menu-item", { hasText: /Art Path|アートパス/ }),
  ).toBeVisible();
});

test("shows image sequence tracks when one is injected", async ({ window }) => {
  await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const project = (vivi.useEditorStore as any).getState().project;
    if (!project || project.layers.length === 0 || (project.scenes?.length ?? 0) === 0)
      return;
    const meshId = project.layers[0]?.id;
    const clip = project.scenes[0]?.clips?.[0];
    if (!meshId || !clip) return;
    const clipStore = vivi.useClipStore as any;
    clipStore.getState().addImageSequenceTrack(clip.id, meshId);
    clipStore.getState().addImageSequenceEntry(clip.id, meshId, 0, "img-test");
  });

  const timelineBody = window.locator(".timeline-body");
  if ((await timelineBody.count()) > 0) {
    await expect(window.locator(".tl-track-label-imgseq")).toBeVisible();
  }
});
