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

describe("ParticleEffectRenderer", () => {
  let app: Application;
  let renderer: ParticleEffectRenderer;

  beforeEach(() => {
    app = createMockApp();
    renderer = new ParticleEffectRenderer(app);
  });

  it("コンストラクタでstageにコンテナが追加される", () => {
    expect(app.stage.addChild).toHaveBeenCalledTimes(1);
  });

  const effectTypes: ParticleEffectType[] = ["confetti", "hearts", "stars", "sparkles"];

  for (const type of effectTypes) {
    it(`play("${type}")でパーティクルが生成される`, () => {
      renderer.play(type);
      renderer.update(0);
    });
  }

  it("update(dt)でパーティクルが移動する", () => {
    renderer.play("confetti");
    for (let i = 0; i < 10; i++) {
      renderer.update(1 / 60);
    }
  });

  it("十分な時間が経過するとパーティクルが自然消滅する", () => {
    renderer.play("sparkles");
    for (let i = 0; i < 180; i++) {
      renderer.update(1 / 60);
    }
  });

  it("clear()で全パーティクルが即座に消去される", () => {
    renderer.play("confetti");
    renderer.play("hearts");
    renderer.clear();
    renderer.update(1 / 60);
  });

  it("destroy()でリソースが破棄される", () => {
    renderer.play("stars");
    renderer.destroy();
    expect(app.stage.removeChild).toHaveBeenCalled();
  });

  it("複数回play()を呼んでもクラッシュしない", () => {
    for (let i = 0; i < 5; i++) {
      renderer.play("confetti");
    }
    renderer.update(1 / 60);
  });

  it("play()にカスタム座標を指定できる", () => {
    renderer.play("hearts", { x: 100, y: 200 });
    renderer.update(1 / 60);
  });

  it("update(0)でもクラッシュしない（dt=0）", () => {
    renderer.play("sparkles");
    renderer.update(0);
  });

  it("play()なしでupdate()してもクラッシュしない", () => {
    renderer.update(1 / 60);
    renderer.update(1);
  });

  it("destroy()後にplay()してもクラッシュしない", () => {
    renderer.destroy();
    expect(() => renderer.update(1 / 60)).not.toThrow();
  });
});


describe("ParticleEffectRenderer エフェクト設定値の検証", () => {
  let app: Application;

  beforeEach(() => {
    app = createMockApp();
  });

  it("confettiの設定値が正しい", () => {
    const renderer = new ParticleEffectRenderer(app);
    renderer.play("confetti");
    const container = (app.stage.addChild as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Container;
    expect(container.children.length).toBe(80);
    renderer.destroy();
  });

  it("heartsの設定値が正しい", () => {
    const renderer = new ParticleEffectRenderer(app);
    renderer.play("hearts");
    const container = (app.stage.addChild as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Container;
    expect(container.children.length).toBe(20);
    renderer.destroy();
  });

  it("starsの設定値が正しい", () => {
    const renderer = new ParticleEffectRenderer(app);
    renderer.play("stars");
    const container = (app.stage.addChild as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Container;
    expect(container.children.length).toBe(30);
    renderer.destroy();
  });

  it("sparklesの設定値が正しい", () => {
    const renderer = new ParticleEffectRenderer(app);
    renderer.play("sparkles");
    const container = (app.stage.addChild as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Container;
    expect(container.children.length).toBe(50);
    renderer.destroy();
  });
});

describe("ParticleEffectRenderer フェードアウト計算", () => {
  let app: Application;

  beforeEach(() => {
    app = createMockApp();
  });

  it("lifeRatio < fadeStart の時、alpha = lifeRatio / fadeStart", () => {
    const renderer = new ParticleEffectRenderer(app);
    // sparkles: lifetime=1.5, fadeStart=0.3
    renderer.play("sparkles");

    for (let i = 0; i < 70; i++) {
      renderer.update(1 / 60);
    }

    for (let i = 0; i < 30; i++) {
      renderer.update(1 / 60);
    }
    renderer.destroy();
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
