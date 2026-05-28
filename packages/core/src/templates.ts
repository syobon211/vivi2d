import { LIPSYNC_DEFAULTS, PHYSICS_DEFAULTS } from "./constants";
import type {
  LipSyncConfig,
  ParameterDefinition,
  ParameterTemplateEntry,
  ProjectData,
  Template,
} from "./types";

const FACE_PARAMETERS: ParameterTemplateEntry[] = [
  {
    name: "Face X",
    minValue: -30,
    maxValue: 30,
    defaultValue: 0,
    group: "Face",
    pairedName: "Face Y",
  },
  { name: "Face Y", minValue: -30, maxValue: 30, defaultValue: 0, group: "Face" },
  { name: "Face Z", minValue: -30, maxValue: 30, defaultValue: 0, group: "Face" },
  { name: "Left Eye Open", minValue: 0, maxValue: 1, defaultValue: 1, group: "Eyes" },
  { name: "Right Eye Open", minValue: 0, maxValue: 1, defaultValue: 1, group: "Eyes" },
  {
    name: "Eye Ball X",
    minValue: -1,
    maxValue: 1,
    defaultValue: 0,
    group: "Eyes",
    pairedName: "Eye Ball Y",
  },
  { name: "Eye Ball Y", minValue: -1, maxValue: 1, defaultValue: 0, group: "Eyes" },
  { name: "Left Brow", minValue: -1, maxValue: 1, defaultValue: 0, group: "Brows" },
  { name: "Right Brow", minValue: -1, maxValue: 1, defaultValue: 0, group: "Brows" },
  { name: "Mouth Open", minValue: 0, maxValue: 1, defaultValue: 0, group: "Mouth" },
  { name: "Mouth A", minValue: 0, maxValue: 1, defaultValue: 0, group: "Mouth" },
  { name: "Mouth I", minValue: 0, maxValue: 1, defaultValue: 0, group: "Mouth" },
  { name: "Mouth U", minValue: 0, maxValue: 1, defaultValue: 0, group: "Mouth" },
  { name: "Mouth E", minValue: 0, maxValue: 1, defaultValue: 0, group: "Mouth" },
  { name: "Mouth O", minValue: 0, maxValue: 1, defaultValue: 0, group: "Mouth" },
];

const BODY_PARAMETERS: ParameterTemplateEntry[] = [
  { name: "Body Rotation X", minValue: -10, maxValue: 10, defaultValue: 0, group: "Body" },
  { name: "Body Rotation Y", minValue: -10, maxValue: 10, defaultValue: 0, group: "Body" },
  { name: "Body Rotation Z", minValue: -10, maxValue: 10, defaultValue: 0, group: "Body" },
  { name: "Breath", minValue: 0, maxValue: 1, defaultValue: 0, group: "Body" },
  { name: "Left Arm", minValue: -1, maxValue: 1, defaultValue: 0, group: "Arms" },
  { name: "Right Arm", minValue: -1, maxValue: 1, defaultValue: 0, group: "Arms" },
];

const HAIR_PHYSICS_TEMPLATE: Template = {
  id: "builtin-physics-hair",
  name: "Hair Sway (3 Segment Chain)",
  category: "physics",
  description: "Three-stage pendulum hair physics driven by head parameters.",
  data: {
    type: "physics",
    groups: [
      {
        name: "Front Hair",
        enabled: true,
        pendulums: [
          { length: 0.8, mass: 1.0, damping: 0.05 },
          { length: 0.6, mass: 0.8, damping: 0.08 },
          { length: 0.4, mass: 0.6, damping: 0.1 },
        ],
        inputs: [],
        outputs: [],
        gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
        gravityStrength: PHYSICS_DEFAULTS.GRAVITY_STRENGTH,
        wind: 0,
      },
      {
        name: "Left Side Hair",
        enabled: true,
        pendulums: [
          { length: 1.0, mass: 1.0, damping: 0.04 },
          { length: 0.8, mass: 0.8, damping: 0.06 },
          { length: 0.6, mass: 0.6, damping: 0.08 },
        ],
        inputs: [],
        outputs: [],
        gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
        gravityStrength: PHYSICS_DEFAULTS.GRAVITY_STRENGTH,
        wind: 0,
      },
      {
        name: "Right Side Hair",
        enabled: true,
        pendulums: [
          { length: 1.0, mass: 1.0, damping: 0.04 },
          { length: 0.8, mass: 0.8, damping: 0.06 },
          { length: 0.6, mass: 0.6, damping: 0.08 },
        ],
        inputs: [],
        outputs: [],
        gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
        gravityStrength: PHYSICS_DEFAULTS.GRAVITY_STRENGTH,
        wind: 0,
      },
    ],
  },
};

const ACCESSORY_PHYSICS_TEMPLATE: Template = {
  id: "builtin-physics-accessory",
  name: "Ribbon / Accessory (2 Segment Chain)",
  category: "physics",
  description: "Lightly damped physics for ribbons and small accessories.",
  data: {
    type: "physics",
    groups: [
      {
        name: "Ribbon",
        enabled: true,
        pendulums: [
          { length: 0.6, mass: 0.5, damping: 0.03 },
          { length: 0.4, mass: 0.3, damping: 0.05 },
        ],
        inputs: [],
        outputs: [],
        gravityDirection: PHYSICS_DEFAULTS.GRAVITY_DIRECTION,
        gravityStrength: PHYSICS_DEFAULTS.GRAVITY_STRENGTH * 0.5,
        wind: 0,
      },
    ],
  },
};

const JAPANESE_LIPSYNC_TEMPLATE: Template = {
  id: "builtin-lipsync-japanese",
  name: "Japanese Lip Sync (A/I/U/E/O)",
  category: "lipsync",
  description: "RMS-driven mouth opening plus viseme targets for vowel shapes.",
  data: {
    type: "lipsync",
    config: {
      enabled: true,
      mode: "viseme",
      threshold: LIPSYNC_DEFAULTS.THRESHOLD,
      smoothing: LIPSYNC_DEFAULTS.SMOOTHING,
      gain: LIPSYNC_DEFAULTS.GAIN,
      visemeSmoothing: 0.3,
      visemeMappings: [
        { viseme: "aa", target: { type: "parameter", parameterId: "", value: 1 } },
        { viseme: "ih", target: { type: "parameter", parameterId: "", value: 1 } },
        { viseme: "ou", target: { type: "parameter", parameterId: "", value: 1 } },
        { viseme: "eh", target: { type: "parameter", parameterId: "", value: 1 } },
        { viseme: "oh", target: { type: "parameter", parameterId: "", value: 1 } },
      ],
    },
  },
};

const SIMPLE_LIPSYNC_TEMPLATE: Template = {
  id: "builtin-lipsync-simple",
  name: "Simple Lip Sync (Volume Only)",
  category: "lipsync",
  description: "Simple mouth opening controlled by RMS volume only.",
  data: {
    type: "lipsync",
    config: {
      enabled: true,
      mode: "rms",
      threshold: LIPSYNC_DEFAULTS.THRESHOLD,
      smoothing: LIPSYNC_DEFAULTS.SMOOTHING,
      gain: LIPSYNC_DEFAULTS.GAIN,
    },
  },
};

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "builtin-param-face",
    name: "Standard Face Parameters",
    category: "parameter",
    description: "A standard face parameter set for eyes, brows, mouth, and angle.",
    data: { type: "parameter", entries: FACE_PARAMETERS },
  },
  {
    id: "builtin-param-body",
    name: "Body Parameters",
    category: "parameter",
    description: "Body rotation, breath, and arm parameters.",
    data: { type: "parameter", entries: BODY_PARAMETERS },
  },
  {
    id: "builtin-param-full",
    name: "Full Set (Face + Body)",
    category: "parameter",
    description: "Add all face and body parameters at once.",
    data: { type: "parameter", entries: [...FACE_PARAMETERS, ...BODY_PARAMETERS] },
  },
  HAIR_PHYSICS_TEMPLATE,
  ACCESSORY_PHYSICS_TEMPLATE,
  JAPANESE_LIPSYNC_TEMPLATE,
  SIMPLE_LIPSYNC_TEMPLATE,
];

export function applyParameterTemplate(
  project: ProjectData,
  entries: ParameterTemplateEntry[],
): { added: number; skipped: number } {
  const existingNames = new Set(project.parameters.map((p) => p.name));
  let added = 0;
  let skipped = 0;

  const newParams: ParameterDefinition[] = [];
  for (const entry of entries) {
    if (existingNames.has(entry.name)) {
      skipped++;
      continue;
    }
    const param: ParameterDefinition = {
      id: crypto.randomUUID(),
      name: entry.name,
      minValue: entry.minValue,
      maxValue: entry.maxValue,
      defaultValue: entry.defaultValue,
      group: entry.group,
    };
    newParams.push(param);
    project.parameters.push(param);
    existingNames.add(entry.name);
    added++;
  }

  for (const entry of entries) {
    if (!entry.pairedName) continue;
    const source = project.parameters.find((p) => p.name === entry.name);
    const target = project.parameters.find((p) => p.name === entry.pairedName);
    if (source && target) {
      source.pairedParameterId = target.id;
    }
  }

  return { added, skipped };
}

export function applyPhysicsTemplate(
  project: ProjectData,
  groups: Omit<import("./types").PhysicsGroup, "id">[],
): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    const id = crypto.randomUUID();
    project.physicsGroups.push({ ...group, id });
    ids.push(id);
  }
  return ids;
}

export function applyLipSyncTemplate(
  project: ProjectData,
  config: Partial<LipSyncConfig>,
): void {
  Object.assign(project.lipsyncConfig, config);
}

export function applyTemplate(
  project: ProjectData,
  template: Template,
): { added?: number; skipped?: number; groupIds?: string[] } {
  switch (template.data.type) {
    case "parameter":
      return applyParameterTemplate(project, template.data.entries);
    case "physics": {
      const groupIds = applyPhysicsTemplate(project, template.data.groups);
      return { groupIds };
    }
    case "lipsync":
      applyLipSyncTemplate(project, template.data.config);
      return {};
  }
}
