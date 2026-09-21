import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type {
  RuntimeEvaluationPreview,
  RuntimePreviewParameter,
  RuntimePreviewResult,
} from "@/lib/runtime-evaluation-preview";

/** Explicit snapshot viewer: never adopts a Project into Editor state/history. */
export function RuntimePreviewPanel({ cellId }: { cellId: string }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<RuntimeEvaluationPreview | null>(null);
  const sequence = useRef(0);
  const loading = useRef(false);
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState("");
  const [parameters, setParameters] = useState<readonly RuntimePreviewParameter[]>([]);
  const [presets, setPresets] = useState<readonly string[]>([]);
  const [generations, setGenerations] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      loading.current = false;
      instance.current?.close();
      instance.current = null;
    };
  }, []);

  function display(result: RuntimePreviewResult) {
    // A rejected evaluation can still preserve a newly accepted caller input.
    // Reflect its fresh snapshot without treating the failed update as success.
    if (result.parameters) setParameters(result.parameters);
    if (!result.ok) {
      setStatus(t("runtimePreview.failed"));
      return; // Failed replacement does not clear the incumbent's controls/frame.
    }
    if (result.status === "activated" || result.status === "updated") {
      if (result.presets) setPresets(result.presets);
      if (result.generations)
        setGenerations(
          `${result.generations.model}/${result.generations.topology}/${result.generations.dynamic}`,
        );
      setStatus(
        t(result.cleanupFailed ? "runtimePreview.warning" : "runtimePreview.ready"),
      );
    } else if (result.status === "missing") {
      setStatus(t("runtimePreview.missing"));
    } else {
      setStatus("");
    }
  }

  async function load() {
    if (loading.current || !cellId || !canvas.current) return;
    loading.current = true;
    const attempt = ++sequence.current;
    const current = () => mounted.current && sequence.current === attempt;
    setBusy(true);
    setStatus(t("runtimePreview.loading"));
    try {
      let preview = instance.current;
      if (!preview) {
        const { createRuntimeEvaluationPreview } = await import(
          "@/lib/runtime-evaluation-preview"
        );
        if (!current() || !canvas.current) return;
        preview = await createRuntimeEvaluationPreview({
          cellId,
          canvas: canvas.current,
        });
        if (!current()) {
          preview.close();
          return;
        }
        instance.current = preview;
        setOpened(true);
      }
      const result = await preview.load();
      if (current()) display(result);
    } catch {
      if (current()) setStatus(t("runtimePreview.failed"));
    } finally {
      // Close invalidates publication immediately, but a second factory must not
      // initialize this same canvas until the old async owner actually settles.
      if (mounted.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  }

  function close() {
    sequence.current += 1;
    instance.current?.close();
    instance.current = null;
    setOpened(false);
    setBusy(loading.current);
    setParameters([]);
    setPresets([]);
    setGenerations("");
    setStatus("");
  }

  return (
    <details>
      <summary>{t("runtimePreview.title")}</summary>
      <p>{t("runtimePreview.scope")}</p>
      <button type="button" disabled={busy || !cellId} onClick={() => void load()}>
        {t(opened ? "runtimePreview.reload" : "runtimePreview.open")}
      </button>
      <button type="button" disabled={!opened && !busy} onClick={close}>
        {t("runtimePreview.close")}
      </button>
      <canvas
        ref={canvas}
        width={512}
        height={512}
        style={{ maxWidth: "100%" }}
        aria-label={t("runtimePreview.title")}
      />
      {parameters.map((parameter) => (
        <label key={parameter.id}>
          {t("runtimePreview.parameter")} {parameter.id}
          <input
            type="range"
            min={parameter.min}
            max={parameter.max}
            step="any"
            value={parameter.current}
            disabled={busy || !opened}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (instance.current && Number.isFinite(value))
                display(instance.current.setParameter(parameter.id, value));
            }}
          />
        </label>
      ))}
      {presets.map((id) => (
        <button
          key={id}
          type="button"
          disabled={busy || !opened}
          onClick={() => {
            if (instance.current) display(instance.current.applyPreset(id));
          }}
        >
          {t("runtimePreview.preset")} {id}
        </button>
      ))}
      {generations && (
        <p>
          {t("runtimePreview.generation")}: {generations}
        </p>
      )}
      <output>{status}</output>
    </details>
  );
}
