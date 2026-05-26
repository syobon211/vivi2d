/// Default maximum runtime payload size in bytes.
pub const DEFAULT_MAX_PAYLOAD_BYTES: u64 = 64 * 1024 * 1024;

/// Default maximum decoded texture bytes.
pub const DEFAULT_MAX_TEXTURE_BYTES: u64 = 256 * 1024 * 1024;

/// Default maximum JSON nesting depth accepted by Runtime Spec v1.
pub const DEFAULT_MAX_JSON_DEPTH: usize = 128;

/// Default maximum decoded string token size in bytes.
pub const DEFAULT_MAX_JSON_STRING_BYTES: usize = 1024 * 1024;

/// Default maximum texture count.
pub const DEFAULT_MAX_TEXTURES: usize = 32;

/// Default maximum layer count.
pub const DEFAULT_MAX_LAYERS: usize = 4096;

/// Default maximum render mesh count.
pub const DEFAULT_MAX_MESHES: usize = 1024;

/// Default maximum vertices per mesh.
pub const DEFAULT_MAX_VERTICES_PER_MESH: usize = 65_536;

/// Default maximum indices per mesh.
pub const DEFAULT_MAX_INDICES_PER_MESH: usize = 196_608;

/// Default maximum bone count.
pub const DEFAULT_MAX_BONES: usize = 1024;

/// Default maximum IK controller count.
pub const DEFAULT_MAX_IK_CONTROLLERS: usize = 256;

/// Default maximum physics group count.
pub const DEFAULT_MAX_PHYSICS_GROUPS: usize = 256;

/// Default maximum pendulum count per physics group.
pub const DEFAULT_MAX_PENDULUMS_PER_PHYSICS_GROUP: usize = 64;

/// Default maximum scalar parameter count.
pub const DEFAULT_MAX_PARAMETERS: usize = 2048;

/// Default maximum binding point count.
pub const DEFAULT_MAX_BINDING_POINTS: usize = 8192;

/// Default maximum collider count.
pub const DEFAULT_MAX_COLLIDERS: usize = 1024;

/// Default maximum animation clip count.
pub const DEFAULT_MAX_ANIMATION_CLIPS: usize = 512;

/// Default maximum state machine count.
pub const DEFAULT_MAX_STATE_MACHINES: usize = 128;

/// Default maximum states per state machine.
pub const DEFAULT_MAX_STATES_PER_STATE_MACHINE: usize = 256;

/// Default maximum transitions per state machine.
pub const DEFAULT_MAX_TRANSITIONS_PER_STATE_MACHINE: usize = 512;

/// Native parser and resource limits.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RuntimeLimits {
    /// Maximum payload byte length.
    pub max_payload_bytes: u64,
    /// Maximum decoded texture byte length.
    pub max_texture_bytes: u64,
    /// Maximum JSON nesting depth.
    pub max_json_depth: usize,
    /// Maximum decoded JSON string token length in bytes.
    pub max_json_string_bytes: usize,
    /// Maximum textures.
    pub max_textures: usize,
    /// Maximum layers.
    pub max_layers: usize,
    /// Maximum meshes.
    pub max_meshes: usize,
    /// Maximum vertices per mesh.
    pub max_vertices_per_mesh: usize,
    /// Maximum indices per mesh.
    pub max_indices_per_mesh: usize,
    /// Maximum bones.
    pub max_bones: usize,
    /// Maximum IK controllers.
    pub max_ik_controllers: usize,
    /// Maximum physics groups.
    pub max_physics_groups: usize,
    /// Maximum pendulums per physics group.
    pub max_pendulums_per_physics_group: usize,
    /// Maximum scalar parameters.
    pub max_parameters: usize,
    /// Maximum binding points.
    pub max_binding_points: usize,
    /// Maximum colliders.
    pub max_colliders: usize,
    /// Maximum animation clips.
    pub max_animation_clips: usize,
    /// Maximum state machines.
    pub max_state_machines: usize,
    /// Maximum states per state machine.
    pub max_states_per_state_machine: usize,
    /// Maximum transitions per state machine.
    pub max_transitions_per_state_machine: usize,
}

impl Default for RuntimeLimits {
    fn default() -> Self {
        Self {
            max_payload_bytes: DEFAULT_MAX_PAYLOAD_BYTES,
            max_texture_bytes: DEFAULT_MAX_TEXTURE_BYTES,
            max_json_depth: DEFAULT_MAX_JSON_DEPTH,
            max_json_string_bytes: DEFAULT_MAX_JSON_STRING_BYTES,
            max_textures: DEFAULT_MAX_TEXTURES,
            max_layers: DEFAULT_MAX_LAYERS,
            max_meshes: DEFAULT_MAX_MESHES,
            max_vertices_per_mesh: DEFAULT_MAX_VERTICES_PER_MESH,
            max_indices_per_mesh: DEFAULT_MAX_INDICES_PER_MESH,
            max_bones: DEFAULT_MAX_BONES,
            max_ik_controllers: DEFAULT_MAX_IK_CONTROLLERS,
            max_physics_groups: DEFAULT_MAX_PHYSICS_GROUPS,
            max_pendulums_per_physics_group: DEFAULT_MAX_PENDULUMS_PER_PHYSICS_GROUP,
            max_parameters: DEFAULT_MAX_PARAMETERS,
            max_binding_points: DEFAULT_MAX_BINDING_POINTS,
            max_colliders: DEFAULT_MAX_COLLIDERS,
            max_animation_clips: DEFAULT_MAX_ANIMATION_CLIPS,
            max_state_machines: DEFAULT_MAX_STATE_MACHINES,
            max_states_per_state_machine: DEFAULT_MAX_STATES_PER_STATE_MACHINE,
            max_transitions_per_state_machine: DEFAULT_MAX_TRANSITIONS_PER_STATE_MACHINE,
        }
    }
}

impl RuntimeLimits {
    /// Clamp caller-provided limits to the Runtime Spec v1 hard ceilings.
    pub fn hardened(self) -> Self {
        Self {
            max_payload_bytes: self.max_payload_bytes.min(DEFAULT_MAX_PAYLOAD_BYTES),
            max_texture_bytes: self.max_texture_bytes.min(DEFAULT_MAX_TEXTURE_BYTES),
            max_json_depth: self.max_json_depth.min(DEFAULT_MAX_JSON_DEPTH),
            max_json_string_bytes: self
                .max_json_string_bytes
                .min(DEFAULT_MAX_JSON_STRING_BYTES),
            max_textures: self.max_textures.min(DEFAULT_MAX_TEXTURES),
            max_layers: self.max_layers.min(DEFAULT_MAX_LAYERS),
            max_meshes: self.max_meshes.min(DEFAULT_MAX_MESHES),
            max_vertices_per_mesh: self
                .max_vertices_per_mesh
                .min(DEFAULT_MAX_VERTICES_PER_MESH),
            max_indices_per_mesh: self.max_indices_per_mesh.min(DEFAULT_MAX_INDICES_PER_MESH),
            max_bones: self.max_bones.min(DEFAULT_MAX_BONES),
            max_ik_controllers: self.max_ik_controllers.min(DEFAULT_MAX_IK_CONTROLLERS),
            max_physics_groups: self.max_physics_groups.min(DEFAULT_MAX_PHYSICS_GROUPS),
            max_pendulums_per_physics_group: self
                .max_pendulums_per_physics_group
                .min(DEFAULT_MAX_PENDULUMS_PER_PHYSICS_GROUP),
            max_parameters: self.max_parameters.min(DEFAULT_MAX_PARAMETERS),
            max_binding_points: self.max_binding_points.min(DEFAULT_MAX_BINDING_POINTS),
            max_colliders: self.max_colliders.min(DEFAULT_MAX_COLLIDERS),
            max_animation_clips: self.max_animation_clips.min(DEFAULT_MAX_ANIMATION_CLIPS),
            max_state_machines: self.max_state_machines.min(DEFAULT_MAX_STATE_MACHINES),
            max_states_per_state_machine: self
                .max_states_per_state_machine
                .min(DEFAULT_MAX_STATES_PER_STATE_MACHINE),
            max_transitions_per_state_machine: self
                .max_transitions_per_state_machine
                .min(DEFAULT_MAX_TRANSITIONS_PER_STATE_MACHINE),
        }
    }
}
