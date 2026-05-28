export type GamepadInputType = "axis" | "button";

export interface GamepadMapping {
  type: GamepadInputType;

  index: number;

  parameterId: string;

  scale?: number;

  deadzone?: number;
}

export const GAMEPAD_AXIS_NAMES = [
  "Left Stick X",
  "Left Stick Y",
  "Right Stick X",
  "Right Stick Y",
] as const;

export const GAMEPAD_BUTTON_NAMES = [
  "A / ✕",
  "B / ○",
  "X / □",
  "Y / △",
  "LB / L1",
  "RB / R1",
  "LT / L2",
  "RT / R2",
  "Back / Share",
  "Start / Options",
  "L3",
  "R3",
  "D-Pad Up",
  "D-Pad Down",
  "D-Pad Left",
  "D-Pad Right",
] as const;

export type OnGamepadInput = (values: Record<string, number>) => void;

export class GamepadController {
  private mappings: GamepadMapping[] = [];
  private callback: OnGamepadInput | null = null;
  private animFrameId = 0;
  private running = false;

  static hasGamepad(): boolean {
    return navigator.getGamepads().some((g) => g !== null);
  }

  setMappings(mappings: GamepadMapping[]): void {
    this.mappings = mappings;
  }

  start(callback: OnGamepadInput): void {
    this.callback = callback;
    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  destroy(): void {
    this.stop();
    this.callback = null;
    this.mappings = [];
  }

  private poll(): void {
    if (!this.running) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[0] ?? gamepads[1] ?? gamepads[2] ?? gamepads[3];

    if (gp && this.callback && this.mappings.length > 0) {
      const values: Record<string, number> = {};

      for (const mapping of this.mappings) {
        const dz = mapping.deadzone ?? 0.1;
        const scale = mapping.scale ?? 1;

        if (mapping.type === "axis") {
          let raw = gp.axes[mapping.index] ?? 0;
          if (Math.abs(raw) < dz) raw = 0;
          values[mapping.parameterId] = raw * scale;
        } else {
          const btn = gp.buttons[mapping.index];
          values[mapping.parameterId] = btn ? btn.value * scale : 0;
        }
      }

      this.callback(values);
    }

    this.animFrameId = requestAnimationFrame(() => this.poll());
  }
}

export function getConnectedGamepads(): Array<{ index: number; id: string }> {
  const result: Array<{ index: number; id: string }> = [];
  const gamepads = navigator.getGamepads();
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (gp) result.push({ index: i, id: gp.id });
  }
  return result;
}
