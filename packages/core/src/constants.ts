export const FLOAT_EPSILON = 1e-9;

export const GEOMETRY = {
  COORD_STRIDE: 2,

  TRIANGLE_VERTS: 3,
} as const;

export const VIEWPORT = {
  ZOOM_MIN: 0.05,
  ZOOM_MAX: 32,
  ZOOM_FACTOR: 1.1,
  FIT_SCALE: 0.85,
} as const;

export const MESH_OVERLAY = {
  VERTEX_RADIUS: 4,
  VERTEX_COLOR: 0x00ccff,
  VERTEX_SELECTED_COLOR: 0xff6600,
  EDGE_COLOR: 0x00ccff,
  EDGE_ALPHA: 0.4,
  HIT_THRESHOLD: 8,

  LASSO_COLOR: 0xffff00,

  LASSO_ALPHA: 0.4,

  LASSO_FILL_RATIO: 0.3,
} as const;

export const DEFORMER_OVERLAY = {
  CP_SIZE: 5,
  CP_COLOR: 0xffcc00,
  CP_ACTIVE_COLOR: 0xff6600,
  GRID_COLOR: 0xffcc00,
  GRID_ALPHA: 0.5,
  PIVOT_COLOR: 0x00ff88,
  HANDLE_COLOR: 0x00ff88,
  HANDLE_RADIUS: 6,
  PIVOT_CROSSHAIR: 8,
  HIT_THRESHOLD: 10,
} as const;

export const LATTICE_OVERLAY = {
  POINT_RADIUS: 5,

  POINT_COLOR: 0x00ff88,

  POINT_HOVER_COLOR: 0xffff00,

  LINE_COLOR: 0x00ff88,

  LINE_ALPHA: 0.4,

  LINE_WIDTH: 1,

  HIT_THRESHOLD: 10,
} as const;

export const BONE_OVERLAY = {
  PIVOT_RADIUS: 6,

  PIVOT_COLOR: 0x00ccff,

  ARM_COLOR: 0x00ccff,

  ARM_WIDTH: 2,

  TIP_RADIUS: 4,

  TIP_COLOR: 0x00ccff,

  SELECTED_COLOR: 0xffaa00,

  HIT_THRESHOLD: 12,
} as const;

export const COLLIDER_OVERLAY = {
  FILL_ALPHA: 0.15,

  STROKE_COLOR: 0xff4488,

  SELECTED_COLOR: 0xffaa00,

  STROKE_WIDTH: 2,

  HANDLE_RADIUS: 5,

  HANDLE_COLOR: 0xffaa00,

  HIT_THRESHOLD: 8,

  DISABLED_ALPHA: 0.3,

  MIN_SIZE: 4,
} as const;

export const PIXI_CONFIG = {
  BG_COLOR: 0x1e1e2e,
} as const;

export const THEME_BG_COLORS = {
  dark: 0x1e1e2e,
  light: 0xf0f0f6,
} as const;

export const MESH_DEFAULTS = {
  DIVISIONS_X: 3,
  DIVISIONS_Y: 3,
} as const;

export const DEFORMER_DEFAULTS = {
  HANDLE_LENGTH: 50,
  SCALE_MIN: 0.01,
  SCALE_MAX: 5,
} as const;

export const TIMELINE_DEFAULTS = {
  FPS: 30,
  DURATION: 90,
  MIN_DURATION: 1,
  MAX_DURATION: 9999,
  MIN_FPS: 1,
  MAX_FPS: 120,
} as const;

export const PHYSICS_DEFAULTS = {
  TIMESTEP: 1 / 120,

  MAX_SUBSTEPS: 4,

  GRAVITY_STRENGTH: 9.8,

  GRAVITY_DIRECTION: 0,

  DAMPING: 0.05,

  PENDULUM_LENGTH: 1,

  PENDULUM_MASS: 1,

  WIND: 0,

  MAX_ANGLE: Math.PI * 2,

  FORCE_PROPAGATION: 0.5,
} as const;

export const ATLAS = {
  MAX_SIZE: 4096,

  PADDING: 2,

  MIN_SIZE: 256,
} as const;

export const DRAW_ORDER = {
  MIN: 0,
  MAX: 1000,
  DEFAULT: 500,
} as const;

export const DEFAULT_COLORS = {
  MULTIPLY: { r: 1, g: 1, b: 1 } as const,

  SCREEN: { r: 0, g: 0, b: 0 } as const,
} as const;

export const AUTO_MESH = {
  PRESET_SCHEMA_VERSION: "auto-mesh-preset/v1",

  PRESETS: {
    coarse: { contourSimplify: 4.0, interiorSpacing: 40, minEdgeLength: 20 },
    standard: {
      contourSimplify: 2.0,
      interiorSpacing: 20,
      minEdgeLength: 10,
    },
    fine: { contourSimplify: 1.0, interiorSpacing: 10, minEdgeLength: 5 },
  },

  ALPHA_THRESHOLD: 10,

  CONTOUR_PADDING: 2,
} as const;

export type MeshDensityPreset = keyof typeof AUTO_MESH.PRESETS;

export const EASING_PRESETS = {
  linear: { cp1x: 0, cp1y: 0, cp2x: 1, cp2y: 1 },
  easeIn: { cp1x: 0.42, cp1y: 0, cp2x: 1, cp2y: 1 },
  easeOut: { cp1x: 0, cp1y: 0, cp2x: 0.58, cp2y: 1 },
  easeInOut: { cp1x: 0.42, cp1y: 0, cp2x: 0.58, cp2y: 1 },
} as const;

export type EasingPreset = keyof typeof EASING_PRESETS;

export const GRAPH_EDITOR = {
  HANDLE_RADIUS: 5,

  KEYFRAME_RADIUS: 5,

  HANDLE_LINE_WIDTH: 1.5,

  CURVE_LINE_WIDTH: 2,

  GRID_COLOR: "var(--graph-grid, #3a3a55)",

  CURVE_COLOR: "var(--graph-curve, #7c6ff0)",

  KEYFRAME_COLOR: "var(--graph-keyframe, #e0e0f0)",

  HANDLE_COLOR: "var(--graph-handle, #8f84f5)",

  VALUE_MARGIN: 0.15,
} as const;

export const SPINE_EXPORT = {
  VERSION: "4.2",

  IMAGE_PATH: "./images/",

  AUDIO_PATH: "",

  ROOT_BONE: "root",
} as const;

export const DEFAULT_NAMES = {
  UNNAMED_LAYER: "Unnamed Layer",
} as const;

export const LIPSYNC_DEFAULTS = {
  SMOOTHING: 0.7,

  THRESHOLD: 0.02,

  GAIN: 2.0,

  FFT_SIZE: 2048,
} as const;

export const VISEME_DEFAULTS = {
  F1_MIN: 200,

  F1_MAX: 1000,

  F2_MIN: 700,

  F2_MAX: 2800,

  FORMANT_SEPARATION: 200,
} as const;
