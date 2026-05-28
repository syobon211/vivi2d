import { findLayerById, flattenLayers } from "@vivi2d/core/layer-utils";
import { isBone } from "@vivi2d/core/types";
import { useCallback, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  applyLimbBendProfile,
  canApplyLimbBendProfile,
  detectLimbBendProfile,
  LIMB_BEND_PROFILE_IDS,
  type LimbBendProfileId,
} from "@vivi2d/editor-core/ik-controller-command";
import { useEditorStore } from "@/stores/editorStore";
import { useIKControllerStore } from "@/stores/ikControllerStore";
import { ParameterBindingSection } from "./properties/ParameterBindingSection";

export function IKPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const addIKController = useIKControllerStore((s) => s.addIKController);
  const removeIKController = useIKControllerStore((s) => s.removeIKController);
  const setInfluence = useIKControllerStore((s) => s.setInfluence);
  const setMaxIterations = useIKControllerStore((s) => s.setMaxIterations);
  const applyBendProfile = useIKControllerStore((s) => s.applyBendProfile);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [solverType, setSolverType] = useState<"twoBone" | "ccd">("twoBone");
  const [selectedBoneIds, setSelectedBoneIds] = useState<string[]>([]);
  const [newBendProfile, setNewBendProfile] = useState<LimbBendProfileId | "custom">(
    "custom",
  );
  const [pendingProfiles, setPendingProfiles] = useState<
    Record<string, LimbBendProfileId>
  >({});

  const boneOptions = useMemo(() => {
    if (!project) return [];
    return flattenLayers(project.layers)
      .filter(isBone)
      .map((bone) => ({ id: bone.id, name: bone.name }));
  }, [project]);

  const handleAdd = useCallback(() => {
    if (!newName) return;
    if (solverType === "twoBone" && selectedBoneIds.length !== 2) return;
    if (solverType === "ccd" && selectedBoneIds.length < 2) return;

    let chain = selectedBoneIds.map((boneId) => ({
      boneId,
      minAngle: -Math.PI,
      maxAngle: Math.PI,
    }));

    if (solverType === "twoBone" && newBendProfile !== "custom") {
      const presetChain = applyLimbBendProfile(
        {
          id: "preview",
          name: "preview",
          solverType: "twoBone",
          boneChain: chain,
          targetX: 0,
          targetY: 0,
          influence: 1,
          parameterMappings: [],
        },
        newBendProfile,
      );
      if (presetChain) {
        chain = presetChain;
      }
    }

    addIKController(newName, solverType, chain);
    setShowAdd(false);
    setNewName("");
    setSelectedBoneIds([]);
    setNewBendProfile("custom");
  }, [addIKController, newBendProfile, newName, selectedBoneIds, solverType]);

  const toggleBone = useCallback((boneId: string) => {
    setSelectedBoneIds((prev) =>
      prev.includes(boneId) ? prev.filter((id) => id !== boneId) : [...prev, boneId],
    );
  }, []);

  const getPendingProfile = useCallback(
    (controllerId: string, detectedProfile: LimbBendProfileId | "custom" | null) =>
      pendingProfiles[controllerId] ??
      (detectedProfile === "loose" ? "loose" : "standard"),
    [pendingProfiles],
  );

  const setPendingProfile = useCallback(
    (controllerId: string, profileId: LimbBendProfileId) => {
      setPendingProfiles((prev) => ({ ...prev, [controllerId]: profileId }));
    },
    [],
  );

  if (!project) return null;

  const controllers = project.ikControllers ?? [];

  return (
    <div className="panel ik-panel">
      <div className="panel-header">{t("ik.title")}</div>
      <div className="panel-content scrollbar-thin">
        {controllers.map((controller) => {
          const detectedProfile = detectLimbBendProfile(controller);
          const canEditProfile = canApplyLimbBendProfile(controller);
          const pendingProfile = canEditProfile
            ? getPendingProfile(controller.id, detectedProfile)
            : "standard";

          const currentProfileLabel =
            detectedProfile === null
              ? t("ik.profile.na")
              : detectedProfile === "custom"
                ? t("ik.profile.custom")
                : t(`ik.profile.${detectedProfile}` as never);

          return (
            <div key={controller.id} className="ik-item">
              <div className="ik-item-header">
                <span className="ik-item-name">{controller.name}</span>
                <span className="ik-item-type">{controller.solverType}</span>
                <button
                  type="button"
                  className="mesh-link-remove-btn"
                  onClick={() => removeIKController(controller.id)}
                  title={t("ik.deleteTitle")}
                >
                  ×
                </button>
              </div>
              <div className="ik-item-details">
                <div className="ik-chain">
                  {t("ik.chain")}:{" "}
                  {controller.boneChain
                    .map((constraint) => {
                      const bone = findLayerById(project.layers, constraint.boneId);
                      return bone?.name ?? constraint.boneId;
                    })
                    .join(" -> ")}
                </div>
                <label className="ik-slider-row">
                  {t("ik.influence")}:
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={controller.influence}
                    onChange={(e) => setInfluence(controller.id, Number(e.target.value))}
                    className="prop-slider"
                  />
                  <span className="prop-field-sm">
                    {(controller.influence * 100).toFixed(0)}%
                  </span>
                </label>
                {controller.solverType === "ccd" && (
                  <label className="ik-slider-row">
                    {t("ik.iterations")}:
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={controller.maxIterations ?? 10}
                      onChange={(e) =>
                        setMaxIterations(controller.id, Number(e.target.value))
                      }
                      className="ik-num-input"
                    />
                  </label>
                )}
                <div className="ik-target-info">
                  {t("ik.target")}: ({Math.round(controller.targetX)},{" "}
                  {Math.round(controller.targetY)})
                </div>
                <ParameterBindingSection
                  target={{
                    type: "ikController",
                    controllerId: controller.id,
                    property: "targetX",
                  }}
                  currentValue={controller.targetX}
                />
                <ParameterBindingSection
                  target={{
                    type: "ikController",
                    controllerId: controller.id,
                    property: "targetY",
                  }}
                  currentValue={controller.targetY}
                />
                <ParameterBindingSection
                  target={{
                    type: "ikController",
                    controllerId: controller.id,
                    property: "influence",
                  }}
                  currentValue={controller.influence}
                />
                <div className="ik-mapping-count">
                  {t("ik.mappings")}: {controller.parameterMappings.length}
                </div>
                <div className="ik-profile-current">
                  {t("ik.profileCurrent")}: {currentProfileLabel}
                </div>
                {canEditProfile && (
                  <div className="ik-profile-editor">
                    <label className="ik-slider-row">
                      {t("ik.profileLabel")}:
                      <select
                        aria-label={`${controller.name} ${t("ik.profileLabel")}`}
                        value={pendingProfile}
                        onChange={(e) =>
                          setPendingProfile(
                            controller.id,
                            e.target.value as LimbBendProfileId,
                          )
                        }
                        className="form-anim-select"
                      >
                        {LIMB_BEND_PROFILE_IDS.map((profileId) => (
                          <option key={profileId} value={profileId}>
                            {t(`ik.profile.${profileId}` as never)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="physics-btn"
                      onClick={() => applyBendProfile(controller.id, pendingProfile)}
                      disabled={detectedProfile === pendingProfile}
                    >
                      {t("ik.applyProfile")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="physics-actions">
          {!showAdd ? (
            <button
              type="button"
              className="physics-btn"
              onClick={() => setShowAdd(true)}
            >
              {t("ik.add")}
            </button>
          ) : (
            <div className="form-anim-add-form">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("ik.namePlaceholder")}
                className="form-anim-input"
              />
              <select
                value={solverType}
                onChange={(e) => setSolverType(e.target.value as "twoBone" | "ccd")}
                className="form-anim-select"
              >
                <option value="twoBone">{t("ik.solver.twoBone")}</option>
                <option value="ccd">{t("ik.solver.ccd")}</option>
              </select>
              {solverType === "twoBone" && (
                <select
                  aria-label={t("ik.profileCreate")}
                  value={newBendProfile}
                  onChange={(e) =>
                    setNewBendProfile(e.target.value as LimbBendProfileId | "custom")
                  }
                  className="form-anim-select"
                >
                  <option value="custom">{t("ik.profile.custom")}</option>
                  {LIMB_BEND_PROFILE_IDS.map((profileId) => (
                    <option key={profileId} value={profileId}>
                      {t(`ik.profile.${profileId}` as never)}
                    </option>
                  ))}
                </select>
              )}
              <div className="form-anim-param-list">
                {boneOptions.map((bone) => (
                  <label key={bone.id} className="form-anim-param-check">
                    <input
                      type="checkbox"
                      checked={selectedBoneIds.includes(bone.id)}
                      onChange={() => toggleBone(bone.id)}
                    />
                    {bone.name}
                  </label>
                ))}
              </div>
              <div className="form-anim-add-actions">
                <button
                  type="button"
                  className="physics-btn"
                  onClick={handleAdd}
                  disabled={
                    !newName ||
                    (solverType === "twoBone"
                      ? selectedBoneIds.length !== 2
                      : selectedBoneIds.length < 2)
                  }
                >
                  {t("ik.create")}
                </button>
                <button
                  type="button"
                  className="physics-btn"
                  onClick={() => setShowAdd(false)}
                >
                  {t("ik.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
