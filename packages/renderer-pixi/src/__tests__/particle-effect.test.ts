import type { Application, Container, Sprite } from "pixi.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticleEffectType } from "../particle-effect";
import { ParticleEffectRenderer } from "../particle-effect";

vi.mock("pixi.js", () => ({
  Container: class MockContainer {
    children: unknown[] = [];
    addChild(s: unknown) {
      this.children.push(s);
    }
    removeChild(s: unknown) {
      const idx = this.children.indexOf(s);
      if (idx >= 0) this.children.splice(idx, 1);
    }
    destroy() {
      this.children = [];
    }
  },
  Sprite: class MockSprite {
    anchor = { set() {} };
    x = 0;
    y = 0;
    alpha = 1;
    rotation = 0;
    constructor(public texture: unknown) {}
    destroy() {}
  },
  Texture: {
    from: () => ({}),
  },
}));

const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  const el = originalCreateElement(tag);
  if (tag === "canvas") {
    (el as any).getContext = () => ({
      fillStyle: "",
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
    });
  }
  return el;
});

function createMockApp(): Application {
  return {
    stage: {
      addChild: vi.fn(),
      removeChild: vi.fn(),
    },
    screen: { width: 800, height: 600 },
  } as unknown as Application;
}

describe("ParticleEffectRenderer lifecycle", () => {
  it("creates, moves, appends, and clears every effect at the requested origin", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const cases: Array<[ParticleEffectType, number]> = [
      ["confetti", 80],
      ["hearts", 20],
      ["stars", 30],
      ["sparkles", 50],
    ];
    try {
      for (const [type, count] of cases) {
        const app = createMockApp();
        const renderer = new ParticleEffectRenderer(app);
        expect(app.stage.addChild).toHaveBeenCalledTimes(1);
        const container = vi.mocked(app.stage.addChild).mock.calls[0]![0] as Container;
        renderer.update(1);
        expect(container.children).toHaveLength(0);
        renderer.play(type, { x: 100, y: 200 });
        expect(container.children, type).toHaveLength(count);
        const sprites = [...container.children] as Sprite[];
        renderer.update(0);
        expect(
          sprites.every(
            (sprite) => sprite.x === 100 && sprite.y === 200 && sprite.alpha === 1,
          ),
          type,
        ).toBe(true);
        renderer.update(0.1);
        expect(
          sprites.some((sprite) => sprite.x !== 100 || sprite.y !== 200),
          type,
        ).toBe(true);
        renderer.play(type);
        expect(container.children, type).toHaveLength(count * 2);
        renderer.clear();
        expect(container.children, type).toHaveLength(0);
        renderer.update(1);
        expect(container.children, type).toHaveLength(0);
        renderer.destroy();
        expect(app.stage.removeChild).toHaveBeenCalledExactlyOnceWith(container);
        expect(() => renderer.update(1)).not.toThrow();
      }
    } finally {
      random.mockRestore();
    }
  });

  it("fades living particles before expiry removes them", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const app = createMockApp();
    const renderer = new ParticleEffectRenderer(app);
    try {
      renderer.play("sparkles");
      const container = vi.mocked(app.stage.addChild).mock.calls[0]![0] as Container;
      renderer.update(1);
      expect(container.children).toHaveLength(50);
      for (const sprite of container.children as Sprite[]) {
        expect(sprite.alpha).toBeGreaterThan(0);
        expect(sprite.alpha).toBeLessThan(1);
      }
      renderer.update(0.5);
      expect(container.children).toHaveLength(0);
    } finally {
      renderer.destroy();
      random.mockRestore();
    }
  });
});

describe("ParticleEffectRenderer 重力方向", () => {
  let app: Application;

  beforeEach(() => {
    app = createMockApp();
  });

  it("hearts(gravity=-60)のパーティクルは上に移動する傾向がある", () => {
    const renderer = new ParticleEffectRenderer(app);
    renderer.play("hearts", { x: 400, y: 300 });

    const container = (app.stage.addChild as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Container;

    const _initialY = (container.children as Sprite[]).map((s) => s.y);

    for (let i = 0; i < 30; i++) {
      renderer.update(1 / 60);
    }

    const remaining = container.children as Sprite[];
    let upwardCount = 0;
    for (let j = 0; j < remaining.length; j++) {
      if (remaining[j]!.y < 300) upwardCount++;
    }
    expect(upwardCount).toBeGreaterThan(remaining.length * 0.3);

    renderer.destroy();
  });

  it("confetti(gravity=300)のパーティクルは下に移動する傾向がある", () => {
    const renderer = new ParticleEffectRenderer(app);
    renderer.play("confetti", { x: 400, y: 100 });

    const container = (app.stage.addChild as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Container;

    for (let i = 0; i < 120; i++) {
      renderer.update(1 / 60);
    }

    const remaining = container.children as Sprite[];
    let downwardCount = 0;
    for (let j = 0; j < remaining.length; j++) {
      if (remaining[j]!.y > 100) downwardCount++;
    }
    expect(downwardCount).toBeGreaterThan(remaining.length * 0.3);

    renderer.destroy();
  });
});

describe("ParticleEffectRenderer 大量再生", () => {
  let app: Application;

  beforeEach(() => {
    app = createMockApp();
  });

  it("大量のplay()呼び出し(100回)でもクラッシュしない", () => {
    const renderer = new ParticleEffectRenderer(app);
    expect(() => {
      for (let i = 0; i < 100; i++) {
        renderer.play("confetti");
      }
    }).not.toThrow();

    expect(() => {
      for (let i = 0; i < 10; i++) {
        renderer.update(1 / 60);
      }
    }).not.toThrow();

    renderer.destroy();
  });
});
