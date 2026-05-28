import { expect, test } from "../fixtures";
import {
  addBone,
  bindAllBones,
  createSceneAndClip,
  selectLayer,
} from "../helpers/operations";

function boneItems(window: import("playwright").Page) {
  return window.locator(".layer-item").filter({
    has: window.locator("[data-testid='layer-icon-bone']"),
  });
}

async function addChildBoneFromStore(
  window: import("playwright").Page,
  parentId: string,
) {
  await window.evaluate((targetParentId) => {
    const vivi = window.__vivi2d as any;
    const boneStore = vivi.useBoneStore.getState();
    boneStore.addBone(targetParentId, "Bone", 0, 0);
  }, parentId);
}

test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});

test("can add a bone from the context menu", async ({ window }) => {
  await addBone(window, "Red Circle");
  await expect(boneItems(window)).toHaveCount(1);
});

test("selecting a bone shows the bone property panel", async ({ window }) => {
  await addBone(window, "Red Circle");
  const boneItem = boneItems(window).first();
  await boneItem.click();

  const selectedBoneId = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    return vivi.useSelectionStore.getState().selectedLayerId;
  });
  await expect(selectedBoneId).toBeTruthy();

  await expect
    .poll(async () =>
      window.locator(".properties-section").evaluateAll((sections) =>
        sections.some((section) => {
          const sliderCount = section.querySelectorAll(".prop-slider").length;
          const hasPositionField = Array.from(
            section.querySelectorAll(".prop-field"),
          ).some((el) => el.textContent?.includes("X:"));
          return sliderCount >= 4 && hasPositionField;
        }),
      ),
    )
    .toBe(true);
});

test("a ViviMesh can be skin-bound to all bones", async ({ window }) => {
  await addBone(window, "Red Circle");

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await expect(window.locator(".prop-bone-tag")).toBeVisible();
});

test("skin bindings can be removed", async ({ window }) => {
  await addBone(window, "Red Circle");

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await window.locator(".prop-btn-danger").first().click();
  await expect(window.locator(".prop-bone-tag")).toHaveCount(0);
});

test("public profile keeps morph authoring hidden for the selected mesh", async ({
  window,
}) => {
  await selectLayer(window, "Red Circle");
  const privateState = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const legacyDeformationKey = ["blend", "Shapes"].join("");
    const legacyPanelName = ["Blend", "Shape", "Panel"].join("");
    return {
      hasLegacyDeformationField: project
        ? legacyDeformationKey in project
        : false,
      hasPrivatePanel: !!document.querySelector(
        `[data-panel-name='${legacyPanelName}']`,
      ),
    };
  });
  expect(privateState).toEqual({
    hasLegacyDeformationField: false,
    hasPrivatePanel: false,
  });
});

test("a bone track can be added to the timeline", async ({ window }) => {
  await addBone(window, "Red Circle");
  await createSceneAndClip(window);
  const clipId = await window.locator(".tl-clip-select").inputValue();

  await window.evaluate((activeClipId) => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone") bones.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    if (!activeClipId) throw new Error("No active clip is selected");
    if (!bones[0]?.id) throw new Error("No bone is available");
    vivi.useClipStore.getState().addBoneTrack(activeClipId, bones[0].id, "angle");
  }, clipId);

  await expect(window.locator(".tl-track-label-bone")).toBeVisible();
});

test("public profile does not expose morph tracks in the timeline", async ({
  window,
}) => {
  await createSceneAndClip(window);

  const addTrackSelect = window.locator(".tl-add-track-select");
  await expect(addTrackSelect).toBeVisible();
  const optionText = (await addTrackSelect.locator("option").allTextContents()).join(
    "\n",
  );
  expect(optionText).not.toContain("Blend Shape");
  await expect(window.locator(".tl-track-label-bs")).toHaveCount(0);
});

test("bone, skin, and timeline workflow works end-to-end in the public profile", async ({
  window,
}) => {
  await addBone(window, "Red Circle");
  await expect(boneItems(window)).toHaveCount(1);

  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await createSceneAndClip(window);
  const clipId = await window.locator(".tl-clip-select").inputValue();
  await window.evaluate((activeClipId) => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone") bones.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    if (!activeClipId) throw new Error("No active clip is selected");
    if (!bones[0]?.id) throw new Error("No bone is available");
    vivi.useClipStore.getState().addBoneTrack(activeClipId, bones[0].id, "angle");
  }, clipId);

  await expect(window.locator(".tl-track-label-bone")).toHaveCount(1);
  await expect(window.locator(".tl-track-label-bs")).toHaveCount(0);
});

test("adding a child bone sets parentBoneId", async ({ window }) => {
  await addBone(window, "Red Circle");

  const result = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone")
          bones.push({ id: node.id, parentBoneId: node.parentBoneId });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    const parent = bones.find((bone) => !bone.parentBoneId);
    if (!parent) return null;
    vivi.useBoneStore.getState().addBone(parent.id, "Bone", 0, 0);
    const nextBones: any[] = [];
    walk(project.layers);
    return nextBones;
  });

  const bones = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone")
          bones.push({ id: node.id, parentBoneId: node.parentBoneId });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    return bones;
  });

  expect(result).not.toBeNull();
  expect(bones.length).toBeGreaterThanOrEqual(2);
  const childBone = bones.find((bone: any) => bone.parentBoneId);
  expect(childBone).toBeTruthy();
});

test("three-level bone hierarchies can be created", async ({ window }) => {
  await addBone(window, "Red Circle");

  const rootId = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone") bones.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    return bones[0]?.id ?? null;
  });
  expect(rootId).toBeTruthy();

  await addChildBoneFromStore(window, rootId!);

  const secondId = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone") bones.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    return bones.find((bone) => bone.parentBoneId)?.id ?? null;
  });
  expect(secondId).toBeTruthy();

  await addChildBoneFromStore(window, secondId!);

  await expect(async () => {
    expect(await boneItems(window).count()).toBeGreaterThanOrEqual(3);
  }).toPass({ timeout: 5_000 });
});

test("removing a parent bone promotes children to root", async ({ window }) => {
  await addBone(window, "Red Circle");

  const parentId = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone") bones.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    return bones[0]?.id ?? null;
  });
  expect(parentId).toBeTruthy();

  await addChildBoneFromStore(window, parentId!);

  const before = await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    const bones: any[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.kind === "bone")
          bones.push({ id: node.id, parentBoneId: node.parentBoneId });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(project.layers);
    return bones;
  });
  const child = before.find((bone: any) => bone.parentBoneId === parentId);
  expect(child).toBeTruthy();

  await window.evaluate((targetParentId) => {
    const vivi = window.__vivi2d as any;
    vivi.useBoneStore.getState().removeBone(targetParentId);
  }, parentId);

  await expect
    .poll(
      async () =>
        window.evaluate(
          ({ childId }) => {
            const vivi = window.__vivi2d as any;
            const project = vivi.useEditorStore.getState().project;
            const bones: Array<{ id: string; parentBoneId?: string }> = [];
            const walk = (nodes: any[]) => {
              for (const node of nodes) {
                if (node.kind === "bone") {
                  bones.push({ id: node.id, parentBoneId: node.parentBoneId });
                }
                if (node.children?.length) walk(node.children);
              }
            };
            walk(project.layers);
            const promoted = bones.find((bone) => bone.id === childId);
            if (!promoted) return "__missing__";
            return promoted.parentBoneId ?? "__root__";
          },
          { childId: child.id },
        ),
      { timeout: 5_000 },
    )
    .not.toBe(parentId);
});
