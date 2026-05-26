import {
  ViviViewerApiClientError,
  createSessionStorageTokenStore,
  createViviViewerClient,
  type ViviViewerApiCapabilities,
  type ViviViewerClient,
} from "@vivi2d/viewer-api-client/browser";

const SCOPES = ["read:state"] as const;

const endpointInput = requireElement<HTMLInputElement>("#endpoint");
const connectButton = requireElement<HTMLButtonElement>("#connect");
const pairButton = requireElement<HTMLButtonElement>("#pair");
const stateButton = requireElement<HTMLButtonElement>("#state");
const clearTokenButton = requireElement<HTMLButtonElement>("#clear-token");
const statusBox = requireElement<HTMLOutputElement>("#status");
const logBox = requireElement<HTMLPreElement>("#log");

let client: ViviViewerClient | null = null;

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required sample element: ${selector}`);
  return element;
}

function log(message: string, payload?: unknown): void {
  const suffix = payload === undefined ? "" : `\n${JSON.stringify(payload, null, 2)}`;
  logBox.textContent = `${new Date().toLocaleTimeString()} ${message}${suffix}\n\n${logBox.textContent}`;
}

function setStatus(message: string): void {
  statusBox.textContent = message;
}

function errorCode(error: unknown): string {
  return error instanceof ViviViewerApiClientError ? error.code : "unknown_error";
}

function describeError(error: unknown): string {
  if (error instanceof ViviViewerApiClientError) {
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : "Unknown Viewer API sample error.";
}

function validateCapabilities(capabilities: ViviViewerApiCapabilities | null): void {
  if (!capabilities?.stability) {
    throw new Error("Viewer API capabilities did not include stability metadata.");
  }
  const surfaces = [
    ...(capabilities.core?.requestTypes ?? []),
    ...(capabilities.extensions?.requestTypes ?? []),
  ].map((request) => request.surface);
  if (surfaces.some((surface) => surface !== "core" && surface !== "extension")) {
    throw new Error("Viewer API capabilities contained an unknown surface.");
  }
}

async function connect(): Promise<void> {
  client?.disconnect();
  client = createViviViewerClient({
    endpoint: endpointInput.value.trim(),
    appName: "Vivi2D Browser Sample",
    scopes: SCOPES,
    tokenStore: createSessionStorageTokenStore(),
  });
  const preAuthCapabilities = await client.connect();
  validateCapabilities(preAuthCapabilities);
  log("Capabilities received before pairing:", {
    stability: preAuthCapabilities.stability,
    requestedScopes: SCOPES,
  });
  pairButton.disabled = false;
  if (await client.authenticateStoredGrant()) {
    validateCapabilities(client.capabilities);
    stateButton.disabled = false;
    setStatus("Connected and authenticated with the session token.");
    return;
  }
  stateButton.disabled = true;
  setStatus("Connected. Pair this browser Origin from Vivi2D.");
}

async function pair(): Promise<void> {
  if (!client) throw new Error("Connect before pairing.");
  log("Requesting scopes:", SCOPES);
  await client.pair({
    onChallenge(challenge) {
      log("Type this code into Vivi2D to approve the browser sample:", {
        code: challenge.code,
        origin: location.origin,
      });
      setStatus("Waiting for approval in Vivi2D...");
    },
  });
  validateCapabilities(client.capabilities);
  stateButton.disabled = false;
  setStatus("Paired and authenticated.");
}

async function getState(): Promise<void> {
  if (!client) throw new Error("Connect before requesting state.");
  const state = await client.state.get();
  log("viewer.state.get response:", state);
}

async function run(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const code = errorCode(error);
    const message =
      code === "pairing_required"
        ? "Open pairing in Vivi2D first."
        : code === "scope_denied"
          ? "The approved grant did not include the requested scope."
          : describeError(error);
    setStatus(message);
    log("Error", { code, message });
  }
}

connectButton.addEventListener("click", () => void run(connect));
pairButton.addEventListener("click", () => void run(pair));
stateButton.addEventListener("click", () => void run(getState));
clearTokenButton.addEventListener("click", () => {
  void run(async () => {
    await client?.clearStoredGrant();
    stateButton.disabled = true;
    setStatus("Session token cleared.");
  });
});
