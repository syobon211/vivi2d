import OBSWebSocket from "obs-websocket-js";

export interface OBSConfig {
  url: string;
  password?: string;
}

export interface OBSControllerOptions extends Partial<OBSConfig> {
  connectTimeoutMs?: number;
}

export interface OBSScene {
  sceneName: string;
  sceneIndex: number;
}

export interface OBSPresetMapping {
  presetName: string;
  sceneName: string;
}

export const DEFAULT_OBS_CONFIG: OBSConfig = {
  url: "ws://127.0.0.1:4455",
  password: undefined,
};

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

export class OBSController {
  private obs: OBSWebSocket;
  private connected = false;
  private config: OBSConfig;
  private connectTimeoutMs: number;
  private presetMappings: OBSPresetMapping[] = [];
  private readonly onConnectionClosed = (): void => {
    this.connected = false;
  };
  private readonly onConnectionError = (): void => {
    this.connected = false;
  };

  constructor(config?: OBSControllerOptions) {
    this.obs = new OBSWebSocket();
    this.config = normalizeConfig({ ...DEFAULT_OBS_CONFIG, ...config });
    this.connectTimeoutMs = normalizeTimeout(config?.connectTimeoutMs);
    this.obs.on("ConnectionClosed", this.onConnectionClosed);
    this.obs.on("ConnectionError", this.onConnectionError);
  }

  async connect(): Promise<void> {
    try {
      await withTimeout(
        this.obs.connect(this.config.url, this.config.password),
        this.connectTimeoutMs,
        "OBS connection timed out",
      );
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw new Error(
        `OBS connection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    try {
      await this.obs.disconnect();
    } finally {
      this.connected = false;
    }
  }

  destroy(): void {
    void this.disconnect().catch(() => {});
    this.obs.off("ConnectionClosed", this.onConnectionClosed);
    this.obs.off("ConnectionError", this.onConnectionError);
    this.connected = false;
    this.config = { ...this.config, password: undefined };
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getScenes(): Promise<OBSScene[]> {
    if (!this.connected) return [];
    const { scenes } = await this.obs.call("GetSceneList");
    if (!Array.isArray(scenes)) return [];
    return scenes.flatMap((scene): OBSScene[] => {
      if (
        typeof scene !== "object" ||
        scene === null ||
        typeof scene.sceneName !== "string" ||
        typeof scene.sceneIndex !== "number" ||
        !Number.isFinite(scene.sceneIndex)
      ) {
        return [];
      }
      return [{ sceneName: scene.sceneName, sceneIndex: scene.sceneIndex }];
    });
  }

  async getCurrentScene(): Promise<string | null> {
    if (!this.connected) return null;
    const { currentProgramSceneName } = await this.obs.call(
      "GetCurrentProgramScene",
    );
    return typeof currentProgramSceneName === "string"
      ? currentProgramSceneName
      : null;
  }

  async setScene(sceneName: string): Promise<void> {
    if (!this.connected) return;
    await this.obs.call("SetCurrentProgramScene", { sceneName });
  }

  async setSourceVisible(
    sceneName: string,
    sourceName: string,
    visible: boolean,
  ): Promise<boolean> {
    if (!this.connected) return false;
    const { sceneItemId } = await this.obs.call("GetSceneItemId", {
      sceneName,
      sourceName,
    });
    if (typeof sceneItemId !== "number" || !Number.isFinite(sceneItemId)) {
      return false;
    }
    await this.obs.call("SetSceneItemEnabled", {
      sceneName,
      sceneItemId,
      sceneItemEnabled: visible,
    });
    return true;
  }

  setPresetMappings(mappings: OBSPresetMapping[]): void {
    this.presetMappings = mappings.map((mapping) => ({ ...mapping }));
  }

  getPresetMappings(): OBSPresetMapping[] {
    return this.presetMappings.map((mapping) => ({ ...mapping }));
  }

  async onPresetApplied(presetName: string): Promise<void> {
    if (!this.connected) return;
    const mapping = this.presetMappings.find(
      (item) => item.presetName === presetName,
    );
    if (mapping) {
      await this.setScene(mapping.sceneName);
    }
  }

  async ping(): Promise<boolean> {
    const obs = new OBSWebSocket();
    try {
      await withTimeout(
        obs.connect(this.config.url, this.config.password),
        this.connectTimeoutMs,
        "OBS ping timed out",
      );
      return true;
    } catch {
      return false;
    } finally {
      await obs.disconnect().catch(() => {});
    }
  }
}

function normalizeConfig(config: OBSConfig): OBSConfig {
  validateBridgeUrl(config.url);
  return { ...config };
}

function validateBridgeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("OBS bridge URL is invalid");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("OBS bridge URL must use ws:// or wss://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("OBS bridge URL must not include embedded credentials");
  }
  if (parsed.protocol === "ws:" && !isLoopbackHost(parsed.hostname)) {
    throw new Error("OBS bridge URL must use wss:// for non-local hosts");
  }
}

function normalizeTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }
  return Math.min(Math.max(Math.trunc(value), 1_000), 60_000);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}
