const { randomUUID } = require("node:crypto");
const path = require("node:path");

async function register({ handle, appData, ownsProcessLock, Host, getMainWindow }) {
  let renderer = null;
  const host = await Host.open({
    root: path.join(appData, "local-exchange-v1"),
    ownsProcessLock,
    onAbort(sessionId, cellId, attempt) {
      if (renderer?.id === sessionId && !renderer.contents.isDestroyed())
        renderer.contents.send("local-exchange-abort", { cellId, attempt });
    },
  });
  function session(event) {
    if (renderer?.contents === event.sender) return renderer.id;
    if (renderer) void host.rendererLost(renderer.id).catch(() => {});
    const current = { id: randomUUID(), contents: event.sender };
    renderer = current;
    const lost = () => {
      if (renderer !== current) return;
      event.sender.removeListener("destroyed", lost);
      event.sender.removeListener("render-process-gone", lost);
      event.sender.removeListener("did-start-navigation", navigated);
      renderer = null;
      void host.rendererLost(current.id).catch(() => {});
    };
    const navigated = (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) lost();
    };
    event.sender.once("destroyed", lost);
    event.sender.once("render-process-gone", lost);
    event.sender.on("did-start-navigation", navigated);
    return current.id;
  }
  handle("local-exchange", async (event, args) => {
    // wrapHandler checked the sender and the closed command contract first.
    if (event.sender !== getMainWindow()?.webContents)
      throw new Error("Untrusted local exchange sender.");
    const sessionId = session(event);
    try {
      let value;
      switch (args.action) {
        case "list":
          value = host.list();
          break;
        case "createWorkspace":
          value = await host.createWorkspace(args.documentId);
          break;
        case "createReplica":
          value = await host.createReplica(args.cellId);
          break;
        case "query":
          value = host.query(args.cellId);
          break;
        case "publish":
          value = await host.publish(
            args.cellId,
            args.mutationId,
            args.expectedHead,
            args.bytes,
          );
          break;
        case "queuePublication": {
          const target = host.query(args.targetCellId);
          // The user's captured base is immutable even if the current target moved.
          value = await host.queuePublication(
            args.cellId,
            { ...target, state: { ...target.state, head: args.expectedHead } },
            args.mutationId,
            args.bytes,
          );
          break;
        }
        case "deliver":
          value = await host.deliver(args.cellId, args.mutationId);
          break;
        case "deliverApproved":
          value = await host.deliverApproved(args.cellId);
          break;
        case "submit":
          value = await host.submit(
            args.workspaceId,
            args.submissionKey,
            args.request,
            args.maxAttempts,
            args.resultPolicy,
          );
          break;
        case "start":
          value = await host.start(args.cellId, args.expectedStateVersion, sessionId);
          break;
        case "cancel":
          value = await host.cancel(args.cellId, args.expectedStateVersion, args.attempt);
          break;
        case "progress":
          value = host.progress(args.cellId, args.attempt, sessionId);
          break;
        case "fail":
          value = await host.failAttempt(
            args.cellId,
            args.attempt,
            sessionId,
            args.reason,
          );
          break;
        case "settled":
          await host.settled(args.cellId, args.attempt, sessionId);
          value = null;
          break;
        case "complete":
          value = await host.complete(args.cellId, args.attempt, sessionId, args.result);
          break;
        case "result":
          value = host.resultManifest(args.cellId);
          break;
        case "proposal":
          value = host.proposal(args.cellId, args.selectedIds);
          break;
        case "reject":
          value = await host.reject(args.cellId, args.decisionId);
          break;
        case "approve":
          value = await host.approve(
            args.cellId,
            args.decisionId,
            args.selectedIds,
            args.kind,
            args.documentId,
            args.bytes,
            args.target ?? undefined,
          );
          break;
        case "candidate":
          value = host.approvedCandidate(args.cellId);
          break;
        default:
          throw new Error("Invalid local exchange command.");
      }
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        code:
          typeof error?.code === "string" && /^[A-Z_]{1,40}$/.test(error.code)
            ? error.code
            : "INTERNAL",
      };
    }
  });
  // Main-only authority; never included in an IPC response.
  return { host, close: () => host.close() };
}
module.exports = { register };
