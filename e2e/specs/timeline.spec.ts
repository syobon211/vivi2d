import { expect, test } from "../fixtures";
import { addParameter, addTrack, createClip } from "../helpers/operations";

const PLAY_BUTTON_LABEL = /^(Play|\u518d\u751f)$/;
const STOP_BUTTON_LABEL = /^(Stop|\u505c\u6b62)$/;
const LOOP_BUTTON_LABEL = /^(Loop|\u30eb\u30fc\u30d7)$/;

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("shows the empty timeline state before a clip exists", async ({ window }) => {
  await expect(window.locator(".tl-clip-select")).toHaveValue("");
  await expect(window.locator(".tl-frame-display")).toHaveText("--:--:--");
});

test("clip controls become available after creating a clip", async ({ window }) => {
  await createClip(window);

  await expect(window.locator(".tl-clip-select")).toHaveValue(/.+/);
  await expect(window.locator(".tl-frame-display")).not.toHaveText("--:--:--");
  await expect(window.getByText("Create or select a clip")).not.toBeVisible();
});

test("play stop and loop buttons are enabled after creating a clip", async ({
  window,
}) => {
  await createClip(window);

  await expect(window.getByRole("button", { name: PLAY_BUTTON_LABEL })).toBeEnabled();
  await expect(window.getByRole("button", { name: STOP_BUTTON_LABEL })).toBeEnabled();
  await expect(window.getByRole("button", { name: LOOP_BUTTON_LABEL })).toBeEnabled();
});

test("deleting the clip restores the empty state", async ({ window }) => {
  await createClip(window);

  await window.locator(".tl-btn-danger").click();

  await expect(window.locator(".tl-clip-select")).toHaveValue("");
  await expect(window.locator(".tl-frame-display")).toHaveText("--:--:--");
});

test("added parameter tracks appear in the track list", async ({ window }) => {
  await addParameter(window, "Param Y");
  await createClip(window);
  await addTrack(window, "Param Y");

  await expect(window.locator(".tl-track-name", { hasText: "Param Y" })).toBeVisible();
});

test("loop button toggles on and off", async ({ window }) => {
  await createClip(window);

  const loopButton = window.getByRole("button", { name: LOOP_BUTTON_LABEL });
  await expect(loopButton).not.toHaveClass(/active/);

  await loopButton.click();
  await expect(loopButton).toHaveClass(/active/);

  await loopButton.click();
  await expect(loopButton).not.toHaveClass(/active/);
});
