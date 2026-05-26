import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import {
  ViviViewerApiClientError,
  createViviViewerClient,
} from "@vivi2d/viewer-api-client/node";

const DEFAULT_SCOPES = ["read:state"];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const endpointArg = arg("--endpoint");
const portArg = arg("--port");
if (!endpointArg && !portArg) {
  console.error("Pass --endpoint ws://127.0.0.1:<port> or --port <port>.");
  process.exit(1);
}

const endpoint = endpointArg ?? `ws://127.0.0.1:${portArg}`;
const sampleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(sampleDir, "../..");

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function tokenPath() {
  const root = path.join(homedir(), ".config", "vivi2d", "viewer-api-node-client");
  const resolved = path.resolve(root);
  const publicDir = path.resolve("C:/Users/Public");
  const temp = path.resolve(tmpdir());
  if (
    isWithin(repoRoot, resolved) ||
    isWithin(publicDir, resolved) ||
    isWithin(temp, resolved) ||
    resolved.startsWith("\\\\")
  ) {
    throw new Error(`Refusing unsafe token directory: ${resolved}`);
  }
  return path.join(resolved, "token.json");
}

function createFileTokenStore() {
  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(tokenPath(), "utf8"));
        if (parsed && typeof parsed.token === "string" && Array.isArray(parsed.scopes)) {
          return {
            token: parsed.token,
            scopes: parsed.scopes.filter((scope) => typeof scope === "string"),
          };
        }
      } catch {
        return null;
      }
      return null;
    },
    async save(_endpoint, grant) {
      const file = tokenPath();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(
        file,
        `${JSON.stringify({ token: grant.token, scopes: grant.scopes }, null, 2)}\n`,
        { mode: 0o600 },
      );
    },
    async clear() {
      await rm(tokenPath(), { force: true });
    },
  };
}

function errorCode(error) {
  return error instanceof ViviViewerApiClientError ? error.code : "unknown_error";
}

function describeError(error) {
  if (error instanceof ViviViewerApiClientError) {
    return `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : String(error);
}

function validateCapabilities(capabilities) {
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

async function main() {
  const client = createViviViewerClient({
    endpoint,
    appName: "Vivi2D Node Sample",
    scopes: DEFAULT_SCOPES,
    tokenStore: createFileTokenStore(),
    webSocketFactory: (url) =>
      new WebSocket(url, {
        perMessageDeflate: false,
      }),
  });

  const preAuthCapabilities = await client.connect();
  validateCapabilities(preAuthCapabilities);

  if (!(await client.authenticateStoredGrant())) {
    console.log(`Requesting scopes: ${DEFAULT_SCOPES.join(", ")}`);
    await client.pair({
      onChallenge(challenge) {
        console.log(`Type this code into Vivi2D: ${challenge.code}`);
        console.log("Approve the pending request in Vivi2D to continue...");
      },
    });
  }

  validateCapabilities(client.capabilities);
  const state = await client.state.get();
  console.log(JSON.stringify(state, null, 2));
  client.disconnect();
}

main().catch((error) => {
  const code = errorCode(error);
  if (code === "pairing_required") {
    console.error("Open pairing in Vivi2D first, then run this sample again.");
  } else if (code === "scope_denied") {
    console.error("The approved grant did not include the requested scope.");
  } else {
    console.error(describeError(error));
  }
  process.exitCode = 1;
});
