import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  AssetCopyError,
  localAssetCopy,
  type PreparedAssetCopy,
} from "@/lib/local-asset-copy";
import type { ExchangeCellView } from "@/lib/local-exchange-provider";

/** Explicit unchanged-content duplication. Never adopts data into the Editor. */
export function LocalAssetCopyPanel({ cells }: { cells: ExchangeCellView[] }) {
  const t = useT();
  const [source, setSource] = useState("");
  const [receiver, setReceiver] = useState("");
  const [prepared, setPrepared] = useState<PreparedAssetCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const current = useRef<PreparedAssetCopy | null>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (current.current)
        void localAssetCopy({
          operation: "cancel",
          copyId: current.current.copyId,
        }).catch(() => {});
    };
  }, []);
  function clear() {
    if (current.current)
      void localAssetCopy({ operation: "cancel", copyId: current.current.copyId }).catch(
        () => {},
      );
    current.current = null;
    setPrepared(null);
    setStatus("");
  }
  async function run(operation: "prepare" | "commit") {
    if (active.current) return;
    const candidate = current.current;
    if (
      operation === "commit" &&
      (!candidate || !window.confirm(t("localAssetCopy.consent")))
    )
      return;
    active.current = true;
    setBusy(true);
    setStatus("");
    try {
      const value = await localAssetCopy(
        operation === "prepare"
          ? { operation, sourceCellId: source, receiverCellId: receiver }
          : { operation, copyId: candidate!.copyId },
      );
      if (operation === "prepare") {
        // Unmount during native file selection must not leave a prepared candidate.
        if (!mounted.current) {
          if (value)
            void localAssetCopy({ operation: "cancel", copyId: value.copyId }).catch(
              () => {},
            );
          return;
        }
        current.current = value;
        setPrepared(value);
      } else if (value && "status" in value && value.status === "committed") {
        current.current = null;
        if (mounted.current) {
          setPrepared(null);
          setStatus(`${t("localAssetCopy.committed")} ${value.documentId}`);
        }
      }
    } catch (error) {
      if (mounted.current)
        setStatus(
          t(
            error instanceof AssetCopyError && error.unavailable
              ? "localAssetCopy.unavailable"
              : error instanceof AssetCopyError && error.ambiguous
                ? "localAssetCopy.ambiguous"
                : "localAssetCopy.failed",
          ),
        );
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const selected = cells.find((cell) => cell.cellId === source);
  const targets = cells.filter(
    (cell) => cell.cellId !== source && cell.documentId === selected?.documentId,
  );
  return (
    <details>
      <summary>{t("localAssetCopy.title")}</summary>
      <p>{t("localAssetCopy.scope")}</p>
      <label>
        {t("localAssetCopy.source")}
        <select
          value={source}
          disabled={busy}
          onChange={(event) => {
            clear();
            setSource(event.target.value);
            setReceiver("");
          }}
        >
          <option value="">—</option>
          {cells.map((cell) => (
            <option key={cell.cellId} value={cell.cellId}>
              {cell.documentId} / {cell.replicaId}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("localAssetCopy.receiver")}
        <select
          value={receiver}
          disabled={busy}
          onChange={(event) => {
            clear();
            setReceiver(event.target.value);
          }}
        >
          <option value="">—</option>
          {targets.map((cell) => (
            <option key={cell.cellId} value={cell.cellId}>
              {cell.replicaId}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !selected || !targets.some((cell) => cell.cellId === receiver)}
        onClick={() => {
          clear();
          void run("prepare");
        }}
      >
        {t("localAssetCopy.prepare")}
      </button>
      {prepared && (
        <div>
          <p>
            {prepared.documentId} / {prepared.compatibility} / {prepared.atlasCount}
          </p>
          <button type="button" disabled={busy} onClick={() => void run("commit")}>
            {t("localAssetCopy.commit")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (current.current)
                void localAssetCopy({
                  operation: "cancel",
                  copyId: current.current.copyId,
                }).catch(() => {});
              if (!busy) clear();
            }}
          >
            {t("localAssetCopy.cancel")}
          </button>
        </div>
      )}
      <output>{status}</output>
    </details>
  );
}
