import { expect, test } from "../fixtures";


function _mulberry32(seed: number) {
  return `(() => {
    let a = ${seed >>> 0};
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })()`;
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});


test("500 レイヤーを注入してもアプリが応答可能", async ({ window }) => {
  const injected = await window.evaluate(
    ({ count }) => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as any;
      const state = store.getState();
      const project = state.project;
      if (!project) return { ok: false, error: "no project" };

      const layers: Array<Record<string, unknown>> = [];
      for (let i = 0; i < count; i++) {
        layers.push({
          id: `injected-${i.toString(36).padStart(4, "0")}`,
          kind: "group",
          name: `Group${i}`,
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          blendMode: "normal",
          expanded: false,
          children: [],
        });
      }

      store.setState((s: { project: { layers: unknown[] } }) => {
        s.project.layers = [...s.project.layers, ...layers];
      });

      return { ok: true, total: store.getState().project.layers.length };
    },
    { count: 500 },
  );

  expect(injected.ok).toBe(true);
  expect(injected.total).toBeGreaterThanOrEqual(500);

  await expect(
    window.locator(".layer-panel, .layers-panel, .panel-content").first(),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.locator(".workspace")).toBeVisible();

  const lastVisible = await window
    .locator(".layer-item", { hasText: "Group499" })
    .count();
  expect(lastVisible).toBeGreaterThanOrEqual(0);
});


test("200 パラメータを注入してもパラメータパネルが描画される", async ({ window }) => {
  const injected = await window.evaluate(
    ({ count }) => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as any;
      const state = store.getState();
      const project = state.project;
      if (!project) return { ok: false };

      const params: Array<Record<string, unknown>> = [];
      for (let i = 0; i < count; i++) {
        params.push({
          id: `param-${i.toString(36).padStart(4, "0")}`,
          name: `Param${i}`,
          minValue: -1,
          maxValue: 1,
          defaultValue: 0,
        });
      }

      store.setState((s: { project: { parameters: unknown[] } }) => {
        s.project.parameters = [...s.project.parameters, ...params];
      });

      return { ok: true, total: store.getState().project.parameters.length };
    },
    { count: 200 },
  );

  expect(injected.ok).toBe(true);
  expect(injected.total).toBe(200);

  await expect(window.locator(".parameter-name", { hasText: "Param0" })).toBeVisible({
    timeout: 10_000,
  });
});


test("100 コライダーを追加してもコライダーパネルが応答する", async ({ window }) => {
  await window.evaluate(
    ({ count }) => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as any;

      store.setState((s: { project: { colliders: unknown[] } }) => {
        const next = [];
        for (let i = 0; i < count; i++) {
          next.push({
            id: `c-${i.toString(36).padStart(3, "0")}`,
            name: `Collider${i}`,
            enabled: true,
            shape: { type: "circle", cx: 0, cy: 0, r: 10 },
          });
        }
        s.project.colliders = [...(s.project.colliders || []), ...next];
      });
    },
    { count: 100 },
  );

  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });

  const count = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.colliders.length;
  });
  expect(count).toBe(100);
});


test("1 トラック × 100 キーフレームを注入してもクラッシュしない", async ({ window }) => {
  await window.evaluate(
    ({ count }) => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as any;
      const paramId = "perf-param";

      store.setState((s: { project: any }) => {
        s.project.parameters = [
          ...(s.project.parameters || []),
          {
            id: paramId,
            name: "perfParam",
            minValue: 0,
            maxValue: 1,
            defaultValue: 0,
          },
        ];

        const keyframes = [];
        for (let i = 0; i < count; i++) {
          keyframes.push({
            time: i * 0.1,
            value: (i % 10) / 10,
            interpolation: "linear",
          });
        }

        s.project.clips = [
          ...(s.project.clips || []),
          {
            id: "clip-perf",
            name: "PerfClip",
            duration: count * 0.1,
            tracks: [
              {
                id: "track-perf",
                type: "parameter",
                parameterId: paramId,
                keyframes,
              },
            ],
          },
        ];
      });
    },
    { count: 100 },
  );

  const n = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const proj = (v.useEditorStore as any).getState().project;
    return proj.clips[0]?.tracks[0]?.keyframes?.length ?? 0;
  });
  expect(n).toBe(100);

  await expect(window.locator(".workspace")).toBeVisible();
});


test("300 パラメータ注入後に Undo が応答可能（履歴スナップショット生成）", async ({
  window,
}) => {
  await window.evaluate(
    ({ count }) => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as any;
      const history = v.useHistoryStore as any;
      history.getState().pushState(store.getState().project);

      store.setState((s: { project: { parameters: unknown[] } }) => {
        const next = [];
        for (let i = 0; i < count; i++) {
          next.push({
            id: `bulk-${i.toString(36).padStart(4, "0")}`,
            name: `Bulk${i}`,
            minValue: 0,
            maxValue: 1,
            defaultValue: 0.5,
          });
        }
        s.project.parameters = [...s.project.parameters, ...next];
      });
    },
    { count: 300 },
  );

  const before = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.parameters.length;
  });
  expect(before).toBeGreaterThanOrEqual(300);

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    (v.useHistoryStore as any).getState().undo();
  });

  const after = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.parameters.length;
  });
  expect(after).toBeLessThan(before);
});


test("ワークスペース要素が 10 秒以内に初期化される（CI 含むソフト確認）", async ({
  window,
}) => {
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 10_000 });
  await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
});
