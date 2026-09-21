import type {
  LocalJobState,
  LocalSyncState,
} from "@vivi2d/model/internal/local-exchange-state";
import { VIVI_PROVIDER_CAPABILITIES } from "@vivi2d/provider-sdk";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  type ExchangeCellView,
  exchange,
  type ProposalView,
  type ResultView,
  runLocalJob,
} from "@/lib/local-exchange-provider";
import {
  approveExchangeProposal,
  captureExchangeConsent,
  openExchangeCandidate,
} from "@/lib/local-exchange-staging";
import { getAllTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { LocalAssetCopyPanel } from "./LocalAssetCopyPanel";
import { RuntimePreviewPanel } from "./RuntimePreviewPanel";

/** Explicit local mode; the existing non-durable generation workflow stays separate. */
export function LocalExchangePanel({
  endpoint,
  prompt,
  parameters,
}: {
  endpoint: string;
  prompt: string;
  parameters: Record<string, unknown>;
}) {
  const t = useT();
  const [cells, setCells] = useState<ExchangeCellView[]>([]);
  const [workspaceId, setWorkspace] = useState("");
  const [jobId, setJob] = useState("");
  const [targetId, setTarget] = useState("");
  const selectedJob = useRef("");
  const [jobResult, setResult] = useState<{ cellId: string; value: ResultView } | null>(
    null,
  );
  const result = jobResult?.cellId === jobId ? jobResult.value : null;
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const workspaces = cells.filter((cell) => cell.kind === "sync");
  const jobs = cells.filter((cell) => cell.kind === "job");
  const chosen = jobs.find((cell) => cell.cellId === jobId);
  const job = chosen?.state as LocalJobState | undefined;
  async function refresh() {
    const listing = await exchange<{
      cells: ExchangeCellView[];
      frozenCellIds: string[];
    }>({ action: "list" });
    setCells(listing.cells);
    if (listing.frozenCellIds.length) setStatus(t("localExchange.integrity"));
  }
  useEffect(() => {
    void refresh().catch(() => setStatus(t("localExchange.unavailable")));
  }, []);
  async function operate(run: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await run();
      await refresh();
    } catch {
      setStatus(t("localExchange.failed"));
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function selectJob(cellId: string) {
    selectedJob.current = cellId;
    setJob(cellId);
    setSelected([]);
    setResult(null);
  }
  async function loadResult(cellId: string) {
    const value = await exchange<ResultView>({ action: "result", cellId });
    if (selectedJob.current === cellId) setResult({ cellId, value });
  }
  async function chooseJob(cellId: string) {
    selectJob(cellId);
    const cell = jobs.find((entry) => entry.cellId === cellId);
    try {
      if ((cell?.state as LocalJobState | undefined)?.phase === "succeeded")
        await loadResult(cellId);
    } catch {
      if (selectedJob.current === cellId) setStatus(t("localExchange.failed"));
    }
  }
  async function submitImageOrPrompt(image: boolean) {
    let inputArtifacts: unknown[] = [];
    if (image) {
      const imagePath = await window.electronAPI.openImageFile();
      if (!imagePath) return;
      const read = await window.electronAPI.readImageFile({ imagePath });
      inputArtifacts = [
        {
          id: "input",
          kind: "inputImage",
          mediaType: "image/png",
          byteLength: read.buffer.byteLength,
          data: read.buffer,
        },
      ];
    }
    const cell = await exchange<ExchangeCellView>({
      action: "submit",
      workspaceId,
      submissionKey: crypto.randomUUID(),
      maxAttempts: 3,
      resultPolicy: { maxArtifacts: 128, maxBytes: 200 * 1024 * 1024 },
      request: {
        capabilityId: image
          ? VIVI_PROVIDER_CAPABILITIES.layerDecompose
          : VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest,
        capabilityVersion: "1.0.0",
        endpoint,
        providerParameters: image ? parameters : { ...parameters, prompt },
        inputArtifacts,
      },
    });
    selectJob(cell.cellId);
  }
  async function submitPsd() {
    if (!result || selectedJob.current !== jobId) throw new Error("Selection required");
    const proposal = await exchange<ProposalView>({
      action: "proposal",
      cellId: jobId,
      selectedIds: selected,
    });
    const manifests = proposal.manifest.artifacts.filter(
      (entry) => selected.includes(entry.id) && entry.kind === "manifest",
    );
    if (manifests.length !== 1) throw new Error("Selection required");
    const manifest = manifests[0]!,
      bytes = proposal.blobs.find((entry) => entry.id === manifest.id)!.bytes;
    const cell = await exchange<ExchangeCellView>({
      action: "submit",
      workspaceId,
      submissionKey: crypto.randomUUID(),
      maxAttempts: 3,
      resultPolicy: { maxArtifacts: 1, maxBytes: 200 * 1024 * 1024 },
      request: {
        capabilityId: VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
        capabilityVersion: "1.0.0",
        endpoint,
        providerParameters: { manifestPath: manifest.metadata.manifestPath },
        inputArtifacts: [
          {
            id: "manifest-input",
            kind: "manifest",
            mediaType: "application/json",
            byteLength: bytes.length,
            data: new Uint8Array(bytes).buffer,
          },
        ],
      },
    });
    selectJob(cell.cellId);
  }
  async function publishCurrent(outbox: boolean) {
    const current = useEditorStore.getState();
    if (!current.project || !current.projectV11)
      throw new Error("Complete v11 session required");
    current.projectV11.display.assertUnchanged(getAllTextures());
    const source = workspaces.find((cell) => cell.cellId === workspaceId)!;
    const target = outbox ? workspaces.find((cell) => cell.cellId === targetId)! : source;
    if (!target || source.documentId !== target.documentId)
      throw new Error("Matching document required");
    const expectedHead = { ...(target.state as LocalSyncState).head };
    const bytes = new TextEncoder().encode(
      await current.projectV11.carrier.serialize(
        current.project,
        current.projectV11.revision,
      ),
    );
    if (outbox)
      await exchange({
        action: "queuePublication",
        cellId: workspaceId,
        targetCellId: target.cellId,
        mutationId: crypto.randomUUID(),
        expectedHead,
        bytes,
      });
    else
      await exchange({
        action: "publish",
        cellId: workspaceId,
        mutationId: crypto.randomUUID(),
        expectedHead,
        bytes,
      });
  }
  return (
    <details className="ai-gen-field">
      <summary>{t("localExchange.title")}</summary>
      <p>{t("localExchange.scope")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void operate(async () => {
            await refresh();
          })
        }
      >
        {t("localExchange.refresh")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void operate(async () => {
            const current = useEditorStore.getState();
            let documentId = crypto.randomUUID();
            if (current.projectV11 && current.project)
              documentId = JSON.parse(
                await current.projectV11.carrier.serialize(
                  current.project,
                  current.projectV11.revision,
                ),
              ).documentId;
            const cell = await exchange<ExchangeCellView>({
              action: "createWorkspace",
              documentId,
            });
            setWorkspace(cell.cellId);
          })
        }
      >
        {t("localExchange.createWorkspace")}
      </button>
      <label>
        {t("localExchange.workspace")}
        <select
          value={workspaceId}
          onChange={(event) => setWorkspace(event.target.value)}
        >
          <option value="">—</option>
          {workspaces.map((cell) => (
            <option key={cell.cellId} value={cell.cellId}>
              {cell.cellId.slice(0, 12)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !workspaceId}
        onClick={() =>
          void operate(async () => {
            await exchange({ action: "createReplica", cellId: workspaceId });
          })
        }
      >
        {t("localExchange.replica")}
      </button>
      <button
        type="button"
        disabled={busy || !workspaceId}
        onClick={() => void operate(() => publishCurrent(false))}
      >
        {t("localExchange.publish")}
      </button>
      <label>
        {t("localExchange.target")}
        <select value={targetId} onChange={(event) => setTarget(event.target.value)}>
          <option value="">—</option>
          {workspaces
            .filter((cell) => cell.cellId !== workspaceId)
            .map((cell) => (
              <option key={cell.cellId} value={cell.cellId}>
                {cell.cellId.slice(0, 12)}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !workspaceId || !targetId}
        onClick={() => void operate(() => publishCurrent(true))}
      >
        {t("localExchange.queue")}
      </button>
      {(
        (
          cells.find((cell) => cell.cellId === workspaceId) as
            | (ExchangeCellView & {
                outbox?: { mutationId: string; receipt: { outcome: string } | null }[];
              })
            | undefined
        )?.outbox ?? []
      ).map((intent) => (
        <div key={intent.mutationId}>
          <code>{intent.mutationId}</code> {intent.receipt?.outcome ?? "pending"}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void operate(async () => {
                await exchange({
                  action: "deliver",
                  cellId: workspaceId,
                  mutationId: intent.mutationId,
                });
              })
            }
          >
            {t("localExchange.deliver")}
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          disabled={busy || !workspaceId || !prompt.trim()}
          onClick={() => void operate(() => submitImageOrPrompt(false))}
        >
          {t("localExchange.queuePrompt")}
        </button>
        <button
          type="button"
          disabled={busy || !workspaceId}
          onClick={() => void operate(() => submitImageOrPrompt(true))}
        >
          {t("localExchange.queueImage")}
        </button>
      </div>
      <label>
        {t("localExchange.job")}
        <select
          value={jobId}
          disabled={busy}
          onChange={(event) => void chooseJob(event.target.value)}
        >
          <option value="">—</option>
          {jobs.map((cell) => (
            <option key={cell.cellId} value={cell.cellId}>
              {cell.cellId.slice(0, 12)} · {(cell.state as LocalJobState).phase}
            </option>
          ))}
        </select>
      </label>
      {job && (
        <div>
          <output>
            {job.phase} · {job.attempt}
          </output>
          <button
            type="button"
            disabled={busy || !["queued", "retryable"].includes(job.phase)}
            onClick={() => {
              const capturedVersion = job.stateVersion;
              void operate(async () => {
                await runLocalJob(jobId, capturedVersion, () => {
                  void refresh();
                });
                await loadResult(jobId);
              });
            }}
          >
            {job.phase === "retryable"
              ? t("localExchange.retry")
              : t("localExchange.start")}
          </button>
          <button
            type="button"
            disabled={!["queued", "running", "retryable"].includes(job.phase)}
            onClick={() => {
              void exchange({
                action: "cancel",
                cellId: jobId,
                expectedStateVersion: job.stateVersion,
                attempt: job.attempt,
              })
                .then(refresh)
                .catch(() => setStatus(t("localExchange.failed")));
            }}
          >
            {t("localExchange.cancel")}
          </button>
        </div>
      )}
      {result && (
        <fieldset>
          <legend>{t("localExchange.selection")}</legend>
          {result.artifacts.map((artifact) => (
            <label key={artifact.id}>
              <input
                type="checkbox"
                disabled={busy || Boolean(chosen?.selection)}
                checked={selected.includes(artifact.id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, artifact.id]
                      : previous.filter((id) => id !== artifact.id),
                  )
                }
              />
              {artifact.id} · {artifact.kind}
            </label>
          ))}
        </fieldset>
      )}
      {job?.phase === "succeeded" && (
        <div>
          <button
            type="button"
            disabled={busy || !result || Boolean(chosen?.selection) || !selected.length}
            onClick={() =>
              void operate(async () => {
                if (!result || selectedJob.current !== jobId)
                  throw new Error("Selection required");
                const consent = captureExchangeConsent(
                  window.confirm(t("localExchange.consent")),
                );
                await approveExchangeProposal(jobId, selected, consent);
              })
            }
          >
            {t("localExchange.approve")}
          </button>
          <button
            type="button"
            disabled={busy || Boolean(chosen?.selection)}
            onClick={() =>
              void operate(async () => {
                await exchange({
                  action: "reject",
                  cellId: jobId,
                  decisionId: crypto.randomUUID(),
                });
              })
            }
          >
            {t("localExchange.reject")}
          </button>
          <button
            type="button"
            disabled={busy || !result || !workspaceId || !selected.length}
            onClick={() => void operate(submitPsd)}
          >
            {t("localExchange.psd")}
          </button>
          {chosen?.selection?.candidate && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void operate(async () => {
                  const consent = captureExchangeConsent(
                    window.confirm(t("localExchange.consent")),
                  );
                  await openExchangeCandidate(jobId, consent);
                })
              }
            >
              {t("localExchange.openCandidate")}
            </button>
          )}
        </div>
      )}
      <p>{t("localExchange.legacy")}</p>
      <LocalAssetCopyPanel cells={workspaces} />
      <RuntimePreviewPanel key={workspaceId} cellId={workspaceId} />
      <output>{status}</output>
    </details>
  );
}
