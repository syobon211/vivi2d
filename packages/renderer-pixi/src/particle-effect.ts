import { type Application, Container, Sprite, Texture } from "pixi.js";

export type ParticleEffectType = "confetti" | "hearts" | "stars" | "sparkles";

export interface ParticleEffectOptions {
  x?: number;

  y?: number;
}

interface ParticleState {
  sprite: Sprite;
  vx: number;
  vy: number;
  gravity: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  fadeStart: number;
}

interface EffectConfig {
  count: number;
  colors: number[];
  size: number;
  lifetime: number;
  speed: number;
  gravity: number;

  spread: number;

  direction: number;

  shape: "rect" | "circle" | "heart" | "star";
}

const EFFECT_CONFIGS: Record<ParticleEffectType, EffectConfig> = {
  confetti: {
    count: 80,
    colors: [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xff6bd6, 0xffa94d],
    size: 8,
    lifetime: 2.5,
    speed: 250,
    gravity: 300,
    spread: Math.PI * 0.6,
    direction: -Math.PI / 2,
    shape: "rect",
  },
  hearts: {
    count: 20,
    colors: [0xff4466, 0xff6688, 0xff88aa],
    size: 20,
    lifetime: 3,
    speed: 80,
    gravity: -60,
    spread: Math.PI * 0.4,
    direction: -Math.PI / 2,
    shape: "heart",
  },
  stars: {
    count: 30,
    colors: [0xffd700, 0xffec8b, 0xffffff],
    size: 14,
    lifetime: 2,
    speed: 150,
    gravity: 80,
    spread: Math.PI * 2,
    direction: 0,
    shape: "star",
  },
  sparkles: {
    count: 50,
    colors: [0xffffff, 0xaaddff, 0xffddaa],
    size: 6,
    lifetime: 1.5,
    speed: 100,
    gravity: 0,
    spread: Math.PI * 2,
    direction: 0,
    shape: "circle",
  },
};

const textureCache = new Map<string, Texture>();

function getTexture(shape: string, color: number, size: number): Texture {
  const key = `${shape}_${color}_${size}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const texture = Texture.from(canvas);
    textureCache.set(key, texture);
    return texture;
  }
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  switch (shape) {
    case "rect":
      ctx.fillStyle = hex;
      ctx.fillRect(1, 1, size - 2, size * 0.5);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();
      break;
    case "heart": {
      const s = size;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.85);
      ctx.bezierCurveTo(s * 0.1, s * 0.6, 0, s * 0.2, s * 0.5, s * 0.35);
      ctx.bezierCurveTo(s, s * 0.2, s * 0.9, s * 0.6, s * 0.5, s * 0.85);
      ctx.fillStyle = hex;
      ctx.fill();
      break;
    }
    case "star": {
      const cx = size / 2;
      const cy = size / 2;
      const outer = size / 2 - 1;
      const inner = outer * 0.4;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = hex;
      ctx.fill();
      break;
    }
  }

  const texture = Texture.from(canvas);
  textureCache.set(key, texture);
  return texture;
}

export class ParticleEffectRenderer {
  private container: Container;
  private particles: ParticleState[] = [];

  constructor(private app: Application) {
    this.container = new Container();
    this.app.stage.addChild(this.container);
  }

  play(type: ParticleEffectType, options?: ParticleEffectOptions): void {
    const config = EFFECT_CONFIGS[type];
    const cx = options?.x ?? this.app.screen.width / 2;
    const cy = options?.y ?? this.app.screen.height * 0.3;

    for (let i = 0; i < config.count; i++) {
      const color = config.colors[Math.floor(Math.random() * config.colors.length)]!;
      const texture = getTexture(config.shape, color, config.size);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = cx + (Math.random() - 0.5) * 30;
      sprite.y = cy + (Math.random() - 0.5) * 30;

      const angle = config.direction + (Math.random() - 0.5) * config.spread;
      const speed = config.speed * (0.5 + Math.random() * 0.5);

      const life = config.lifetime * (0.7 + Math.random() * 0.3);

      this.particles.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: config.gravity,
        rotSpeed: (Math.random() - 0.5) * 8,
        life,
        maxLife: life,
        fadeStart: 0.3,
      });

      this.container.addChild(sprite);
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;

      if (p.life <= 0) {
        this.container.removeChild(p.sprite);
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }

      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.rotSpeed * dt;

      const lifeRatio = p.life / p.maxLife;
      if (lifeRatio < p.fadeStart) {
        p.sprite.alpha = lifeRatio / p.fadeStart;
      }
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.container.removeChild(p.sprite);
      p.sprite.destroy();
    }
    this.particles = [];
  }

  destroy(): void {
    this.clear();
    this.app.stage.removeChild(this.container);
    this.container.destroy();
  }
}
