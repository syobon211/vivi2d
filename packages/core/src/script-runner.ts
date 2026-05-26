export type ScriptCommand =
  | { type: "setParam"; parameterId: string; value: number }
  | { type: "preset"; presetId: string }
  | { type: "presetByName"; name: string }
  | { type: "wait"; ms: number }
  | { type: "lerp"; parameterId: string; from: number; to: number; duration: number }
  | { type: "reset" }
  | { type: "loop"; count: number; commands: ScriptCommand[] };

export interface ParsedScript {
  commands: ScriptCommand[];
}

export interface ScriptRunnerState {
  running: boolean;
  cancelled: boolean;
}

export interface ScriptModelAPI {
  setParameter(id: string, value: number): void;
  setParameters(values: Record<string, number>): void;
  resetParameters(): void;
  applyExpressionPreset(presetId: string): void;
  getPresetByName(name: string): string | null;
  getParameterId(nameOrId: string): string | null;
  update(dt?: number): void;
}

export function parseScript(source: string): ParsedScript {
  const tokens = tokenize(source);
  const commands = parseTokens(tokens, 0, tokens.length);
  return { commands };
}

export async function runScript(
  script: ParsedScript,
  api: ScriptModelAPI,
  state?: ScriptRunnerState,
): Promise<void> {
  const s: ScriptRunnerState = state ?? { running: true, cancelled: false };
  s.running = true;
  s.cancelled = false;
  try {
    await executeCommands(script.commands, api, s);
  } finally {
    s.running = false;
  }
}

export function cancelScript(state: ScriptRunnerState): void {
  state.cancelled = true;
}

async function executeCommands(
  commands: ScriptCommand[],
  api: ScriptModelAPI,
  state: ScriptRunnerState,
): Promise<void> {
  for (const cmd of commands) {
    if (state.cancelled) return;
    await executeCommand(cmd, api, state);
  }
}

async function executeCommand(
  cmd: ScriptCommand,
  api: ScriptModelAPI,
  state: ScriptRunnerState,
): Promise<void> {
  switch (cmd.type) {
    case "setParam":
      api.setParameter(cmd.parameterId, cmd.value);
      api.update();
      break;

    case "preset": {
      api.applyExpressionPreset(cmd.presetId);
      api.update();
      break;
    }

    case "presetByName": {
      const id = api.getPresetByName(cmd.name);
      if (id) {
        api.applyExpressionPreset(id);
        api.update();
      }
      break;
    }

    case "wait":
      await sleep(cmd.ms, state);
      break;

    case "lerp": {
      const steps = Math.max(1, Math.ceil(cmd.duration / 16));
      const stepMs = cmd.duration / steps;
      for (let i = 0; i <= steps; i++) {
        if (state.cancelled) return;
        const t = i / steps;
        const value = cmd.from + (cmd.to - cmd.from) * t;
        api.setParameter(cmd.parameterId, value);
        api.update();
        if (i < steps) await sleep(stepMs, state);
      }
      break;
    }

    case "reset":
      api.resetParameters();
      api.update();
      break;

    case "loop": {
      const count = cmd.count <= 0 ? Infinity : cmd.count;
      for (let i = 0; i < count; i++) {
        if (state.cancelled) return;
        await executeCommands(cmd.commands, api, state);
      }
      break;
    }
  }
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const CANCEL_POLL_MS = 50;

function sleep(ms: number, state: ScriptRunnerState): Promise<void> {
  const waitMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
  if (waitMs <= 0 || state.cancelled) return Promise.resolve();

  return new Promise((resolve) => {
    let elapsedMs = 0;
    let done = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let checkId: ReturnType<typeof setInterval> | undefined;

    const finish = () => {
      if (done) return;
      done = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (checkId !== undefined) clearInterval(checkId);
      resolve();
    };

    const scheduleNextTimeout = () => {
      const remainingMs = waitMs - elapsedMs;
      if (remainingMs <= 0) {
        finish();
        return;
      }
      const delayMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);
      timeoutId = setTimeout(() => {
        elapsedMs += delayMs;
        if (state.cancelled) {
          finish();
          return;
        }
        scheduleNextTimeout();
      }, delayMs);
    };

    checkId = setInterval(
      () => {
        if (state.cancelled) {
          finish();
        }
      },
      Math.min(CANCEL_POLL_MS, waitMs),
    );

    scheduleNextTimeout();
  });
}

type Token =
  | { type: "arrow" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "comma" }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "ident"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = source.trim();

  while (i < s.length) {
    if (/\s/.test(s[i]!)) {
      i++;
      continue;
    }

    if (
      s[i] === "→" ||
      (s[i] === "-" && s[i + 1] === ">") ||
      (s[i] === "=" && s[i + 1] === ">")
    ) {
      tokens.push({ type: "arrow" });
      i += s[i] === "→" ? 1 : 2;
      continue;
    }

    if (s[i] === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (s[i] === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (s[i] === "{") {
      tokens.push({ type: "lbrace" });
      i++;
      continue;
    }
    if (s[i] === "}") {
      tokens.push({ type: "rbrace" });
      i++;
      continue;
    }
    if (s[i] === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }

    if (s[i] === '"' || s[i] === "'") {
      const quote = s[i]!;
      let val = "";
      i++;
      while (i < s.length && s[i] !== quote) {
        val += s[i];
        i++;
      }
      i++;
      tokens.push({ type: "string", value: val });
      continue;
    }

    if (/[0-9\-.]/.test(s[i]!) && (s[i] !== "-" || /[0-9.]/.test(s[i + 1] ?? ""))) {
      let num = "";
      if (s[i] === "-") {
        num += "-";
        i++;
      }
      while (i < s.length && /[0-9.]/.test(s[i]!)) {
        num += s[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }

    if (/[a-zA-Z_\u3000-\u9FFF\uF900-\uFAFF]/.test(s[i]!)) {
      let ident = "";
      while (i < s.length && /[a-zA-Z0-9_\u3000-\u9FFF\uF900-\uFAFF]/.test(s[i]!)) {
        ident += s[i];
        i++;
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    i++;
  }

  return tokens;
}

function parseTokens(tokens: Token[], start: number, end: number): ScriptCommand[] {
  const commands: ScriptCommand[] = [];
  let i = start;

  while (i < end) {
    const tok = tokens[i]!;

    if (tok.type === "arrow") {
      i++;
      continue;
    }

    if (tok.type === "ident") {
      const name = tok.value;

      if (name === "wait" && tokens[i + 1]?.type === "lparen") {
        const args = parseArgs(tokens, i + 1);
        commands.push({ type: "wait", ms: args.numbers[0] ?? 500 });
        i = args.end + 1;
        continue;
      }

      if (name === "set" && tokens[i + 1]?.type === "lparen") {
        const args = parseArgs(tokens, i + 1);
        commands.push({
          type: "setParam",
          parameterId: args.strings[0] ?? "",
          value: args.numbers[0] ?? 0,
        });
        i = args.end + 1;
        continue;
      }

      if (name === "lerp" && tokens[i + 1]?.type === "lparen") {
        const args = parseArgs(tokens, i + 1);
        commands.push({
          type: "lerp",
          parameterId: args.strings[0] ?? "",
          from: args.numbers[0] ?? 0,
          to: args.numbers[1] ?? 1,
          duration: args.numbers[2] ?? 500,
        });
        i = args.end + 1;
        continue;
      }

      if (name === "loop" && tokens[i + 1]?.type === "lparen") {
        const args = parseArgs(tokens, i + 1);
        const count = args.numbers[0] ?? 0;
        const bodyEnd = args.end + 1;
        if (tokens[bodyEnd]?.type === "lbrace") {
          const braceEnd = findMatchingBrace(tokens, bodyEnd);
          const body = parseTokens(tokens, bodyEnd + 1, braceEnd);
          commands.push({ type: "loop", count, commands: body });
          i = braceEnd + 1;
        } else {
          i = bodyEnd;
        }
        continue;
      }

      if (name === "reset") {
        commands.push({ type: "reset" });
        i++;
        continue;
      }

      commands.push({ type: "presetByName", name });
      i++;
      continue;
    }

    if (tok.type === "string") {
      commands.push({ type: "presetByName", name: tok.value });
      i++;
      continue;
    }

    i++;
  }

  return commands;
}

function parseArgs(
  tokens: Token[],
  lparenPos: number,
): { strings: string[]; numbers: number[]; end: number } {
  const strings: string[] = [];
  const numbers: number[] = [];
  let i = lparenPos + 1;

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.type === "rparen") break;
    if (t.type === "comma") {
      i++;
      continue;
    }
    if (t.type === "number") {
      numbers.push(t.value);
    }
    if (t.type === "string" || t.type === "ident") {
      strings.push(t.value);
    }
    i++;
  }

  return { strings, numbers, end: i };
}

function findMatchingBrace(tokens: Token[], lbracePos: number): number {
  let depth = 1;
  let i = lbracePos + 1;
  while (i < tokens.length && depth > 0) {
    if (tokens[i]!.type === "lbrace") depth++;
    if (tokens[i]!.type === "rbrace") depth--;
    if (depth > 0) i++;
  }
  return i;
}
