import { useCallback, useState } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useVMCStore } from "@/stores/vmcStore";

export function VMCPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const connected = useVMCStore((s) => s.connected);
  const receivePort = useVMCStore((s) => s.receivePort);
  const setReceivePort = useVMCStore((s) => s.setReceivePort);
  const setConnected = useVMCStore((s) => s.setConnected);
  const mappings = useVMCStore((s) => s.mappings);
  const addMapping = useVMCStore((s) => s.addMapping);
  const removeMapping = useVMCStore((s) => s.removeMapping);
  const updateMapping = useVMCStore((s) => s.updateMapping);
  const lastReceivedAt = useVMCStore((s) => s.lastReceivedAt);

  const [newVmcName, setNewVmcName] = useState("");
  const [newParamId, setNewParamId] = useState("");

  const handleToggleConnect = useCallback(() => {
    setConnected(!connected);
  }, [connected, setConnected]);

  const handleAddMapping = useCallback(() => {
    if (!newVmcName || !newParamId) return;
    addMapping({
      vmcName: newVmcName,
      parameterId: newParamId,
      scale: 1,
      offset: 0,
    });
    setNewVmcName("");
    setNewParamId("");
  }, [newVmcName, newParamId, addMapping]);

  if (!project) return null;

  const params = project.parameters;
  const timeSinceReceive = lastReceivedAt
    ? Math.round((Date.now() - lastReceivedAt) / 1000)
    : null;

  return (
    <div className="panel vmc-panel">
      <div className="panel-header">
        {t("vmc.title")}
        <span
          className={`vmc-status ${connected ? "vmc-connected" : ""}`}
          title={connected ? t("vmc.connected") : t("vmc.disconnected")}
        >
          ●
        </span>
      </div>
      <div className="panel-content scrollbar-thin">
        {/* Connection Settings */}
        <div className="vmc-section">
          <label className="vmc-port-row">
            {t("vmc.receivePort")}:
            <input
              type="number"
              min={1024}
              max={65535}
              value={receivePort}
              onChange={(e) => setReceivePort(Number(e.target.value))}
              className="ik-num-input"
              disabled={connected}
            />
          </label>
          <button
            type="button"
            className={`physics-btn ${connected ? "vmc-btn-disconnect" : ""}`}
            onClick={handleToggleConnect}
          >
            {connected ? t("vmc.disconnect") : t("vmc.connect")}
          </button>
          {timeSinceReceive !== null && (
            <div className="vmc-receive-status">
              {t("vmc.lastReceived")}: {timeSinceReceive} {t("vmc.secondsAgo")}
            </div>
          )}
        </div>

        {/* Mapping Settings */}
        <div className="vmc-section">
          <div className="vmc-section-title">{t("vmc.mappings")}</div>
          {mappings.map((m, i) => (
            <div key={m.vmcName} className="vmc-mapping-item">
              <span className="vmc-mapping-name">{m.vmcName}</span>
              <span className="vmc-mapping-arrow">→</span>
              <span className="vmc-mapping-param">
                {params.find((p) => p.id === m.parameterId)?.name ?? m.parameterId}
              </span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={m.scale}
                onChange={(e) => updateMapping(i, { scale: Number(e.target.value) })}
                className="ik-num-input"
                title={t("vmc.scale")}
                style={{ width: "40px" }}
              />
              <button
                type="button"
                className="mesh-link-remove-btn"
                onClick={() => removeMapping(i)}
                title={t("vmc.deleteMapping")}
              >
                ×
              </button>
            </div>
          ))}

          {/* Mapping Add Form */}
          <div className="vmc-mapping-add">
            <input
              type="text"
              value={newVmcName}
              onChange={(e) => setNewVmcName(e.target.value)}
              placeholder={t("vmc.vmcName")}
              className="form-anim-input"
              style={{ width: "80px" }}
            />
            <select
              value={newParamId}
              onChange={(e) => setNewParamId(e.target.value)}
              className="form-anim-select"
              style={{ width: "100px" }}
              aria-label={t("vmc.parameter")}
            >
              <option value="">{t("vmc.parameter")}</option>
              {params.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="physics-btn"
              onClick={handleAddMapping}
              disabled={!newVmcName || !newParamId}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
