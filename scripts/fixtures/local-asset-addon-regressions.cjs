"use strict";
// Actual Electron/Node-API regression probes for the three implementation findings.
const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHook } = require("node:async_hooks");
const config = JSON.parse(fs.readFileSync(process.argv.at(-1), "utf8"));
app.setPath("userData", path.join(config.ownedDirectory, "profile"));
const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,16,50,9,99,0,0,1,149,0,157,77,65,8,223,0,0,0,0,73,69,78,68,174,66,96,130]);
function endpoint(name) {
  const directory = path.join(config.ownedDirectory, name); fs.mkdirSync(directory);
  const file = Buffer.from(path.join(directory, "store.sqlite3")), principal = Buffer.from(name), buffer = Buffer.alloc(8 + file.length + principal.length);
  buffer.writeUInt32LE(file.length); buffer.writeUInt32LE(principal.length, 4); file.copy(buffer, 8); principal.copy(buffer, 8 + file.length); return buffer;
}
function unpublished(callback) {
  const created = new Set(), settled = new Set(), thrown = [];
  const hook = createHook({ init(id, kind) { if (kind === "PROMISE") created.add(id); }, promiseResolve(id) { if (created.has(id)) settled.add(id); } });
  hook.enable();
  try { for (let i = 0; i < 6; i++) { try { callback(); thrown.push(null); } catch (error) { thrown.push(error.code); } } }
  finally { hook.disable(); }
  return { created: created.size, settled: settled.size, thrown };
}
async function run() {
  await app.whenReady();
  const test = require(config.testAddon), observations = [], failures = [];
  const input = endpoint("unpublished");
  for (const [label, command] of [["object-after-promise",13],["pending-exception-after-promise",14],["async-work-after-promise",7],["queue-after-promise",8]]) {
    test.__test(command);
    const measured = unpublished(() => test.start(2, input, null, null, PNG, 1, 1));
    observations.push({ label, ...measured });
    if (measured.created !== 6 || measured.settled !== 6 || measured.thrown.some(code => code !== "LOCAL_ASSET_INTERNAL")) failures.push(label);
    assert.equal(test.__test(3).busy, false);
  }
  test.__test(12);
  const closeReference = unpublished(() => test.close()); observations.push({ label: "close-promise-reference-failure", ...closeReference });
  if (closeReference.created !== 6 || closeReference.settled !== 6 || closeReference.thrown.some(code => code !== "LOCAL_ASSET_RESOURCE")) failures.push("close-promise-reference-failure");
  test.__test(9); await test.close();

  const native = require(config.releaseAddon), reentrant = endpoint("reentrant-close");
  const originalIsBuffer = Buffer.isBuffer;
  let closePromise, prototypeReads = 0, returned, thrown;
  Object.setPrototypeOf(reentrant, new Proxy({}, { getPrototypeOf() { prototypeReads++; closePromise = native.close(); return Buffer.prototype; } }));
  try { returned = native.start(2, reentrant, null, null, PNG, 1, 1); } catch (error) { thrown = error.code; }
  let returnedStatus = null;
  if (returned) { const keep = new Set([returned.token]); returnedStatus = (await returned.result).status; keep.delete(returned.token); }
  if (closePromise) await closePromise;
  assert.equal(Buffer.isBuffer, originalIsBuffer);
  const databaseCreated = fs.existsSync(path.join(config.ownedDirectory, "reentrant-close/store.sqlite3"));
  const closed = { label: "actual-buffer-prototype-reentrant-close", prototypeReads, thrown: thrown || null, returnedStatus, databaseCreated };
  observations.push(closed);
  if (prototypeReads < 1 || thrown !== "LOCAL_ASSET_CLOSED" || returned || databaseCreated) failures.push(closed.label);
  const report = { status: failures.length ? "FAIL" : "PASS", electron: process.versions.electron, nodeApi: process.versions.napi, observations, failures,
    limits: "Actual NAPI promise events; fixed C-only failure injection. Reentrancy uses a real Buffer's Proxy prototype with unchanged global Buffer.isBuffer and the shipping C ABI." };
  fs.writeFileSync(config.reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(`LOCAL_ASSET_REGRESSIONS ${JSON.stringify(report)}\n`);
  app.exit(failures.length ? 1 : 0);
}
process.on("unhandledRejection", error => { process.stderr.write(`UNHANDLED ${String(error)}\n`); app.exit(1); });
run().catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
