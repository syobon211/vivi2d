"use strict";
// Isolated actual-Electron test entry. Never included in the application bundle.
const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const config = JSON.parse(fs.readFileSync(process.argv.at(-1), "utf8"));
app.setPath("userData", path.join(config.ownedDirectory, "profile"));
app.setAppPath(config.appRoot);
const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,16,50,9,99,0,0,1,149,0,157,77,65,8,223,0,0,0,0,73,69,78,68,174,66,96,130]);
const checks = [];
const retainedTokens = new Set();
async function perform(native, ...args) {
  const operation = native.start(...args);
  retainedTokens.add(operation.token);
  try { return await operation.result; } finally { retainedTokens.delete(operation.token); }
}
function endpoint(name, principal = name) {
  const directory = path.join(config.ownedDirectory, name); fs.mkdirSync(directory, { recursive: true });
  const file = Buffer.from(path.join(directory, "store.sqlite3")), who = Buffer.from(principal), out = Buffer.alloc(8 + file.length + who.length);
  out.writeUInt32LE(file.length, 0); out.writeUInt32LE(who.length, 4); file.copy(out, 8); who.copy(out, 8 + file.length); return out;
}
function reference(asset) {
  const out = Buffer.alloc(216); out.writeUInt32LE(216); out.writeUInt32LE(asset.storageKind === "blob" ? 1 : 2, 4);
  Buffer.from(asset.objectAddress, "hex").copy(out, 8); Buffer.from(asset.contentSha256, "hex").copy(out, 40);
  out.writeBigUInt64LE(BigInt(asset.sizeBytes), 72); const media = Buffer.from(asset.mediaType); out.writeUInt32LE(media.length, 80); media.copy(out, 88); return out;
}
function assertCapture(result, verified, expected) {
  assert.deepEqual(Object.keys(result).sort(), ["objects", "status", "verified"]);
  assert.equal(result.status, "ready"); assert.deepEqual(result.verified, verified);
  assert(Object.isFrozen(result)); assert(Object.isFrozen(result.objects));
  assert.equal(result.objects.length, expected.length);
  for (const [index, object] of result.objects.entries()) {
    assert.deepEqual(Object.keys(object).sort(), ["bytes", "objectAddress"]);
    assert(Object.isFrozen(object)); assert(Buffer.isBuffer(object.bytes));
    assert(object.bytes.buffer instanceof ArrayBuffer);
    assert.equal(object.bytes.byteOffset, 0); assert.equal(object.bytes.buffer.byteLength, object.bytes.byteLength);
    // A manifest is addressed by its parsed JCS, not by these preserved raw
    // bytes. The first object must retain the real seeded manifest address.
    const address = verified.asset.storageKind === "chunk_manifest" && index === 0
      ? verified.asset.objectAddress : createHash("sha256").update(expected[index]).digest("hex");
    assert.equal(object.objectAddress, address);
    assert.deepEqual(object.bytes, expected[index]);
  }
}
function manifestObjects(asset) {
  // Recreate only the existing fixed seeder's literal bytes, not a resolver.
  const size = 8388608, insertion = 33;
  const first = Buffer.alloc(size, 0x5a); PNG.copy(first, 0, 0, insertion);
  first.writeUInt32BE(size * 2 - insertion - 8, insertion); first.write("aaAa", insertion + 4);
  const doubled = Buffer.concat([first, first]);
  let crc = 0xffffffff;
  for (const byte of doubled.subarray(insertion + 4)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((~crc) >>> 0);
  const last = Buffer.concat([checksum, PNG.subarray(insertion)]);
  const chunks = [first, first, last].map(bytes => ({ sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
  const chunkJson = chunks.map(chunk => `{"sizeBytes":${chunk.sizeBytes},"sha256":"${chunk.sha256}"}`).join(",");
  const content = createHash("sha256").update(doubled).update(last).digest("hex");
  assert.equal(content, asset.contentSha256); assert.equal(doubled.length + last.length, asset.sizeBytes);
  const raw = Buffer.from(`{\n  "sizeBytes":${asset.sizeBytes}, "chunks":[${chunkJson}],\n  "mediaType":"image/png", "schema":"vivi2d.assetChunkManifest.v1",\n  "chunkSizeBytes":8388608, "contentSha256":"${content}"\n}\n`);
  assert.notEqual(createHash("sha256").update(raw).digest("hex"), asset.objectAddress);
  return [raw, first, last];
}
async function within(predicate, label) {
  const deadline = performance.now() + 5000;
  while (!predicate()) { if (performance.now() >= deadline) throw Error(`Timed out: ${label}`); await delay(5); }
}
function startWorker(addon, mode, name) {
  const worker = new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const native=require(workerData.addon);
    native.__test(1);
    const job=native.start(2,Buffer.from(workerData.endpoint),null,null,Buffer.from(workerData.png),1,1);
    const poll=setInterval(()=>{if(native.__test(3).entered){clearInterval(poll);parentPort.postMessage('entered');}},1);
    parentPort.on('message',async message=>{if(message==='release'){native.__test(2);await job.result;await native.close();parentPort.postMessage('done');parentPort.close();}});
    if(workerData.mode==='teardown')job.result.then(()=>parentPort.postMessage('unexpected-delivery'));
  `, { eval: true, workerData: { addon, mode, endpoint: endpoint(name), png: PNG } });
  return worker;
}
function startCaptureWorker(addon, source, ref, mode = "teardown") {
  return new Worker(`
    const {parentPort,workerData}=require('node:worker_threads');
    const assert=require('node:assert/strict');
    const native=require(workerData.addon);
    native.__test(16);
    const job=native.start(4,Buffer.from(workerData.source),null,Buffer.from(workerData.ref),null,1,1);
    const poll=setInterval(()=>{if(native.__test(3).captured){clearInterval(poll);parentPort.postMessage('captured');}},1);
    if(workerData.mode==='teardown')job.result.then(()=>parentPort.postMessage('unexpected-delivery'));
    else parentPort.on('message',async message=>{
      assert.equal(message,'close');
      const before=native.__test(3).captureReleases;
      const closed=native.close(); assert.equal(native.close(),closed);
      let settled=false;closed.then(()=>{settled=true;});
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.equal(settled,false);assert.equal(native.__test(3).busy,true);
      native.__test(17);
      const result=await job.result;
      assert.equal(result.status,'ready');assert.equal(result.objects.length,1);
      assert.deepEqual(result.objects[0].bytes,Buffer.from(workerData.png));
      await closed;
      assert.equal(native.__test(3).busy,false);assert.equal(native.__test(3).captureReleases,before+1);
      parentPort.postMessage('closed-ready');parentPort.close();
    });
  `, { eval: true, workerData: { addon, source, ref, mode, png: PNG } });
}
async function message(worker, expected) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { worker.terminate(); reject(Error("Worker message deadline")); }, 5000);
    worker.once("error", fail); worker.once("message", received);
    function fail(error) { clearTimeout(timeout); worker.off("message", received); reject(error); }
    function received(value) { clearTimeout(timeout); worker.off("error", fail); value === expected ? resolve(value) : reject(Error("Unexpected worker delivery")); }
  });
}
async function run() {
  await app.whenReady();
  const loader = require(path.join(config.appRoot, "electron/native-local-asset.cjs"));
  if (config.expectUnavailable) {
    assert.throws(() => loader.loadNativeLocalAsset(), { code: "LOCAL_ASSET_UNAVAILABLE" });
    assert.throws(() => loader.loadNativeLocalAsset(), { code: "LOCAL_ASSET_UNAVAILABLE" });
    checks.push("actual-resource-unavailable-with-no-fallback");
    finish(false); return;
  }
  const native = loader.loadNativeLocalAsset(); assert.equal(loader.loadNativeLocalAsset(), native);
  const loadedCrt = process.report.getReport().sharedObjects.filter(file => /^vcruntime140\.dll$/i.test(path.basename(file)));
  const expectedCrt = path.join(config.appRoot, "electron/generated/native-local-asset/win32-x64/vcruntime140.dll");
  assert.equal(loadedCrt.length, 1);
  // Windows can report a namespace-prefixed module path. Resolve both paths
  // through the native OS API; JS realpath traversal misreads that drive prefix.
  const loadedCrtPath = fs.realpathSync.native(loadedCrt[0]);
  assert.equal(loadedCrtPath.toLowerCase(), fs.realpathSync.native(expectedCrt).toLowerCase());
  assert.equal(createHash("sha256").update(fs.readFileSync(loadedCrtPath)).digest("hex"), config.crtSha256);
  checks.push("actual-unique-app-local-crt-path-and-hash");
  assert.deepEqual(Object.getOwnPropertyNames(native).sort(), ["abiVersion", "cancel", "close", "start"]);
  assert.equal(native.abiVersion, 1); assert(Object.isFrozen(native)); checks.push("release-exact-exports-and-singleton");
  const source = endpoint("source"), receiver = endpoint("receiver");
  for (const bad of [new Uint8Array(source), new DataView(new ArrayBuffer(source.length)), Buffer.from(new SharedArrayBuffer(source.length))]) {
    assert.throws(() => native.start(2, bad, null, null, PNG, 1, 1), /LOCAL_ASSET_INVALID_ARGUMENT/);
  }
  const detached = Buffer.from(new ArrayBuffer(source.length)); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.throws(() => native.start(2, detached, null, null, PNG, 1, 1), /LOCAL_ASSET_INVALID_ARGUMENT/);
  assert.throws(() => native.start(2, source, null, null, new Uint8Array(PNG), 1, 1), /LOCAL_ASSET_INVALID_ARGUMENT/);
  assert.throws(() => native.start(2, source, null, null, PNG, "1", 1), /LOCAL_ASSET_INVALID_ARGUMENT/);
  assert.throws(() => native.start(2, source, null, null, PNG, 1, 1, null), /LOCAL_ASSET_INVALID_ARGUMENT/);
  assert.throws(() => native.cancel({}), /LOCAL_ASSET_INVALID_ARGUMENT/);
  checks.push("actual-buffer-brand-shared-detached-and-closed-arguments");
  const bytes = Buffer.from(PNG), captured = Buffer.from(source);
  const job = native.start(2, captured, null, null, bytes, 1, 1);
  assert.throws(() => native.start(2, source, null, null, PNG, 1, 1), /LOCAL_ASSET_BUSY/);
  bytes.fill(0); captured.fill(0);
  const materialized = await job.result; assert.equal(materialized.status, "ready");
  assert.equal(materialized.verified.asset.contentSha256, createHash("sha256").update(PNG).digest("hex"));
  assert.equal(materialized.verified.asset.sizeBytes, PNG.length); assert(Object.isFrozen(materialized.verified.asset));
  const ref = reference(materialized.verified.asset); checks.push("native-snapshot-before-queue-and-single-slot");
  assert.throws(() => native.start(4, source, receiver, ref, null, 1, 1), /LOCAL_ASSET_INVALID_ARGUMENT/);
  assert.throws(() => native.start(4, source, null, ref, PNG, 1, 1), /LOCAL_ASSET_INVALID_ARGUMENT/);
  const capture = await perform(native, 4, source, null, ref, null, 1, 1);
  assertCapture(capture, materialized.verified, [PNG]);
  capture.objects[0].bytes.fill(0);
  assertCapture(await perform(native, 4, source, null, ref, null, 1, 1), materialized.verified, [PNG]);
  checks.push("actual-capture-blob-owned-bytes-no-handle-and-fresh-reopen");
  const transfer = await perform(native, 3, source, receiver, ref, null, 1, 1);
  assert.deepEqual(transfer, materialized);
  const resolved = await perform(native, 1, receiver, null, ref, null, 1, 1);
  assert.deepEqual(resolved, materialized); checks.push("real-two-store-transfer-and-reopened-receiver");
  const manifestRef = reference(config.manifestRef);
  const manifestTransfer = await perform(native, 3, endpoint("manifest-source"), endpoint("manifest-receiver"), manifestRef, null, 1, 1);
  assert.equal(manifestTransfer.status, "ready"); assert.deepEqual(manifestTransfer.verified.asset, config.manifestRef);
  assert.deepEqual(await perform(native, 1, endpoint("manifest-receiver"), null, manifestRef, null, 1, 1), manifestTransfer);
  checks.push("actual-noncanonical-chunk-manifest-transfer-and-reopened-receiver");
  const expectedManifestObjects = manifestObjects(config.manifestRef);
  const manifestCapture = await perform(native, 4, endpoint("manifest-source"), null, manifestRef, null, 1, 1);
  assertCapture(manifestCapture, manifestTransfer.verified, expectedManifestObjects);
  checks.push("actual-capture-noncanonical-manifest-first-read-order-and-deduplicated-bytes");
  const wrong = await perform(native, 1, endpoint("receiver", "wrong-principal"), null, ref, null, 1, 1);
  assert.equal(wrong.status, "error"); assert.equal(wrong.storeKind, "PrincipalMismatch"); assert.equal(wrong.outcomeMayHaveCommitted, false);
  const dimensions = await perform(native, 1, receiver, null, ref, null, 2, 1);
  assert.equal(dimensions.assetCode, "VIVI_ASSET_DIMENSION_MISMATCH");
  const missingAsset = { ...materialized.verified.asset, objectAddress: "0".repeat(64), contentSha256: "0".repeat(64), mediaType: "image/jpeg" };
  const missing = await perform(native, 1, source, null, reference(missingAsset), null, 1, 1);
  assert.deepEqual(missing, { status: "missing" }); checks.push("actual-principal-dimension-and-missing-before-media-errors");
  assert.deepEqual(await perform(native, 4, source, null, reference(missingAsset), null, 1, 1), { status: "missing" });
  const captureWrong = await perform(native, 4, endpoint("source", "wrong-principal"), null, ref, null, 1, 1);
  assert.equal(captureWrong.storeKind, "PrincipalMismatch"); assert.equal(captureWrong.outcomeMayHaveCommitted, false); assert(!("objects" in captureWrong));
  const captureDimensions = await perform(native, 4, source, null, ref, null, 2, 1);
  assert.equal(captureDimensions.assetCode, "VIVI_ASSET_DIMENSION_MISMATCH"); assert.equal(captureDimensions.outcomeMayHaveCommitted, false); assert(!("objects" in captureDimensions));
  checks.push("actual-capture-missing-and-errors-preserve-nonmutating-result-shapes");
  const close = native.close(); assert.equal(native.close(), close); await close;
  assert.throws(() => native.start(2, source, null, null, PNG, 1, 1), /LOCAL_ASSET_CLOSED/);
  if (config.testAddon) {
    for (let attempt = 0; attempt < 3; attempt++) assert.throws(() => require(config.initializationFailureAddon), /LOCAL_ASSET_UNAVAILABLE/);
    checks.push("test-only-initialization-reference-unwind");
    const test = require(config.testAddon);
    for (let failure = 4; failure <= 8; failure++) {
      test.__test(failure);
      assert.throws(() => test.start(2, endpoint(`failure-${failure}`), null, null, PNG, 1, 1), /LOCAL_ASSET_(RESOURCE|INTERNAL)/);
      assert.equal(test.__test(3).busy, false); test.__test(9);
      assert.equal((await perform(test, 2, endpoint(`recovery-${failure}`), null, null, PNG, 1, 1)).status, "ready");
    }
    assert.equal(test.__test(3).setupFailures, 5); checks.push("test-only-five-setup-failure-unwinds-with-real-recovery");
    test.__test(11);
    const mappingFailure = test.start(2, endpoint("completion-mapping-failure"), null, null, PNG, 1, 1);
    await assert.rejects(mappingFailure.result, { code: "LOCAL_ASSET_INTERNAL" });
    assert.equal(test.__test(3).busy, false); test.__test(9);
    assert.equal((await perform(test, 2, endpoint("completion-recovery"), null, null, PNG, 1, 1)).status, "ready");
    checks.push("test-only-completion-mapping-failure-release-and-real-recovery");
    const releasesBeforeAllocation = test.__test(3).captureReleases;
    test.__test(15);
    const captureAllocationFailure = test.start(4, endpoint("manifest-source"), null, manifestRef, null, 1, 1);
    await assert.rejects(captureAllocationFailure.result, { code: "LOCAL_ASSET_INTERNAL" });
    assert.equal(test.__test(3).busy, false);
    assert.equal(test.__test(3).captureReleases, releasesBeforeAllocation + 1);
    test.__test(9);
    assertCapture(await perform(test, 4, source, null, ref, null, 1, 1), materialized.verified, [PNG]);
    assert.equal(test.__test(3).captureReleases, releasesBeforeAllocation + 2);
    checks.push("capture-partial-js-output-allocation-failure-destroys-native-owner-and-recovers");
    const blocking = startWorker(config.testAddon, "queue-blocker", "queue-blocker");
    await message(blocking, "entered");
    test.__test(1);
    const queued = test.start(2, endpoint("queued-cancel"), null, null, PNG, 1, 1);
    test.cancel(queued.token); assert.throws(() => test.start(2, source, null, null, PNG, 1, 1), /LOCAL_ASSET_BUSY/);
    assert.deepEqual(await queued.result, { status: "cancelled", outcomeMayHaveCommitted: false });
    assert.equal(test.__test(3).entered, false); test.__test(2);
    test.__test(1);
    const queuedCapture = test.start(4, source, null, ref, null, 1, 1);
    test.cancel(queuedCapture.token);
    assert.throws(() => test.start(4, source, null, ref, null, 1, 1), /LOCAL_ASSET_BUSY/);
    assert.deepEqual(await queuedCapture.result, { status: "cancelled", outcomeMayHaveCommitted: false });
    assert.equal(test.__test(3).entered, false); test.__test(2);
    const done = message(blocking, "done"); blocking.postMessage("release"); await done; await blocking.terminate();
    checks.push("queued-cancel-before-worker-entry-retains-slot-until-complete");
    checks.push("capture-queued-cancel-retains-slot-until-real-completion");
    test.__test(1);
    let collected = test.start(2, endpoint("token-gc"), null, null, PNG, 1, 1);
    const weak = new WeakRef(collected.token), result = collected.result; collected = null;
    await within(() => test.__test(3).entered, "worker entered");
    let ticks = 0; const heartbeat = setInterval(() => ticks++, 1);
    for (let i = 0; i < 100; i++) { global.gc(); await delay(5); if (!weak.deref()) break; await delay(1); }
    assert.equal(weak.deref(), undefined); await delay(10); assert(ticks > 0); clearInterval(heartbeat);
    test.__test(2); assert.deepEqual(await result, { status: "cancelled", outcomeMayHaveCommitted: false });
    checks.push("running-worker-off-main-and-token-gc-independent-cancel-reference");
    const capturedClosingWorker = startCaptureWorker(config.testAddon, source, ref, "close");
    await message(capturedClosingWorker, "captured");
    const closedReady = message(capturedClosingWorker, "closed-ready");
    capturedClosingWorker.postMessage("close"); await closedReady; await capturedClosingWorker.terminate();
    checks.push("normal-close-waits-for-exported-capture-and-delivers-actual-ready");
    test.__test(1);
    const closing = test.start(2, endpoint("close-running"), null, null, PNG, 1, 1);
    await within(() => test.__test(3).entered, "close worker entered");
    const closingPromise = test.close(); assert.equal(test.close(), closingPromise);
    let settled = false; closingPromise.then(() => { settled = true; }); await delay(20);
    assert.equal(settled, false); assert.equal(test.__test(3).busy, true);
    test.__test(2); assert.deepEqual(await closing.result, { status: "cancelled", outcomeMayHaveCommitted: false }); await closingPromise;
    assert.equal(test.__test(3).busy, false); checks.push("normal-close-waits-for-real-complete-and-delivers-result");
    const terminating = startWorker(config.testAddon, "teardown", "teardown");
    await message(terminating, "entered");
    // Worker termination may wait for outstanding pool work before running its
    // environment hook. A different live environment releases only the test
    // hold; production work has no such artificial blocking gate.
    const releaseDuringTeardown = setTimeout(() => test.__test(10), 25);
    const exit = await Promise.race([terminating.terminate(), delay(5000).then(() => { throw Error("Cleanup deadline"); })]);
    clearTimeout(releaseDuringTeardown);
    assert.equal(typeof exit, "number"); checks.push("actual-environment-cleanup-awaits-cancelled-native-worker");
    const releasesBeforeTeardown = test.__test(3).captureReleases;
    const capturedWorker = startCaptureWorker(config.testAddon, source, ref);
    await message(capturedWorker, "captured");
    const deliveryAfterTermination = [];
    capturedWorker.on("message", value => deliveryAfterTermination.push(value));
    const releaseCapturedDuringTeardown = setTimeout(() => test.__test(10), 25);
    const capturedExit = await Promise.race([capturedWorker.terminate(), delay(5000).then(() => { throw Error("Capture cleanup deadline"); })]);
    clearTimeout(releaseCapturedDuringTeardown);
    assert.equal(typeof capturedExit, "number");
    assert.deepEqual(deliveryAfterTermination, []);
    assert.equal(test.__test(3).captureReleases, releasesBeforeTeardown + 1);
    checks.push("actual-environment-teardown-destroys-already-exported-native-capture");
  }
  finish(true);
}
function finish(realNativeStoreOperations) {
  const report = { status: "PASS", electron: process.versions.electron, nodeApi: process.versions.napi, platform: process.platform, arch: process.arch,
    executableBaseName: path.basename(process.execPath), checks, testOnlySynchronization: Boolean(config.testAddon), realNativeStoreOperations, applicationMainIpcConnected: false };
  fs.writeFileSync(config.reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  // Let Electron finish its normal shutdown even in the no-addon resource tests.
  process.stdout.write(`LOCAL_ASSET_TEST ${JSON.stringify(report)}\n`); app.quit();
}
process.on("unhandledRejection", error => { process.stderr.write(`LOCAL_ASSET_TEST_UNHANDLED ${String(error)}\n`); app.exit(1); });
run().catch(error => { process.stderr.write(`LOCAL_ASSET_TEST_FAIL ${error.stack}\n`); app.exit(1); });
