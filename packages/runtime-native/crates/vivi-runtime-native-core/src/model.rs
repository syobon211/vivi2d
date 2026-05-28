use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::errors::RuntimeError;
use crate::limits::RuntimeLimits;
use crate::parameters::{ParameterInfo, ParameterState};
use crate::parser::RuntimePayload;
use crate::static_model::{BlendMode, MeshSnapshot, StaticModel, TextureSnapshot};
use crate::status;

const DEFAULT_DRAW_ORDER: i32 = 500;
const MAX_DELTA_SECONDS: f64 = 0.25;
const PHYSICS_TIMESTEP: f64 = 1.0 / 120.0;
const PHYSICS_MAX_SUBSTEPS: usize = 4;
const PHYSICS_FORCE_PROPAGATION: f64 = 0.5;
const PHYSICS_MAX_ANGLE: f64 = std::f64::consts::PI * 2.0;
const COORD_STRIDE: usize = 2;
const TRIANGLE_VERTS: usize = 3;

/// Runtime hit-test result.
#[derive(Clone, Debug, PartialEq)]
pub struct HitResult {
    /// Collider ID that won hit testing.
    pub collider_id: String,
    /// Layer ID for mesh-backed collider hits.
    pub layer_id: Option<String>,
    /// Mesh ID for mesh-backed collider hits.
    pub mesh_id: Option<String>,
    /// Query X coordinate.
    pub x: f64,
    /// Query Y coordinate.
    pub y: f64,
}

/// Expression preset parameter value.
#[derive(Clone, Debug, PartialEq)]
pub struct ExpressionPresetValue {
    /// Target parameter ID.
    pub parameter_id: String,
    /// Target scalar value.
    pub value: f64,
}

/// Runtime expression preset metadata.
#[derive(Clone, Debug, PartialEq)]
pub struct ExpressionPreset {
    /// Preset ID.
    pub id: String,
    /// User-facing preset name.
    pub name: String,
    /// Optional color token.
    pub color: Option<String>,
    /// Optional hotkey encoded as a decimal string.
    pub hotkey: Option<String>,
    /// Parameter values applied by this preset.
    pub values: Vec<ExpressionPresetValue>,
}

/// Native Runtime Spec v1 evaluator state.
#[derive(Clone, Debug)]
pub struct RuntimeModel {
    textures: Vec<TextureSnapshot>,
    parameters: ParameterState,
    scene: RuntimeScene,
    state: RuntimeState,
}

impl RuntimeModel {
    /// Build an evaluator from a parsed payload.
    pub fn from_payload_with_limits(
        payload: &RuntimePayload,
        limits: RuntimeLimits,
    ) -> Result<Self, RuntimeError> {
        let static_model = StaticModel::from_payload_with_limits(payload, limits)?;
        let parameters = ParameterState::from_payload_with_limits(payload, limits)?;
        let scene = RuntimeScene::from_payload(payload, limits)?;
        let mut model = Self {
            textures: static_model.textures().to_vec(),
            parameters,
            scene,
            state: RuntimeState::new(),
        };
        model.state.prev_parameters = model.parameter_values();
        for group in &model.scene.physics_groups {
            if !group.enabled {
                continue;
            }
            model.state.physics_states.insert(
                group.id.clone(),
                group
                    .pendulums
                    .iter()
                    .map(|_| PendulumState {
                        angle: 0.0,
                        angular_velocity: 0.0,
                    })
                    .collect(),
            );
            model
                .state
                .physics_accumulators
                .insert(group.id.clone(), 0.0);
        }
        model.evaluate(0.0)?;
        Ok(model)
    }

    /// Return texture snapshots.
    pub fn textures(&self) -> &[TextureSnapshot] {
        &self.textures
    }

    /// Return current mesh snapshots in render order.
    pub fn meshes(&self) -> &[MeshSnapshot] {
        &self.state.meshes
    }

    /// Return parameter metadata and current values.
    pub fn parameters(&self) -> &[ParameterInfo] {
        self.parameters.parameters()
    }

    /// Return expression presets.
    pub fn expression_presets(&self) -> &[ExpressionPreset] {
        &self.scene.expression_presets
    }

    /// Apply an expression preset. Unknown parameters inside the preset are ignored.
    pub fn apply_expression_preset(&mut self, id: &str) -> Result<(), RuntimeError> {
        let Some(preset) = self
            .scene
            .expression_presets
            .iter()
            .find(|preset| preset.id == id)
        else {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                format!("unknown expression preset: {id}"),
            ));
        };
        let snapshot = self.parameters.clone();
        for value in &preset.values {
            if self
                .parameters
                .parameters()
                .iter()
                .any(|parameter| parameter.id == value.parameter_id)
                && let Err(error) = self.parameters.set_input(&value.parameter_id, value.value)
            {
                self.parameters = snapshot;
                return Err(error);
            }
        }
        Ok(())
    }

    /// Set and clamp a scalar input.
    pub fn set_input(&mut self, id: &str, value: f64) -> Result<(), RuntimeError> {
        self.parameters.set_input(id, value)
    }

    /// Get a scalar input.
    pub fn get_input(&self, id: &str) -> Result<f64, RuntimeError> {
        self.parameters.get_input(id)
    }

    /// Advance evaluation transactionally.
    pub fn update(&mut self, delta_seconds: f64) -> Result<(), RuntimeError> {
        if !delta_seconds.is_finite() {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                "delta_seconds must be finite",
            ));
        }
        if delta_seconds < 0.0 {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                "delta_seconds must be non-negative",
            ));
        }
        let snapshot = (self.parameters.clone(), self.state.clone());
        let clamped = delta_seconds.min(MAX_DELTA_SECONDS);
        match self.evaluate(clamped) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.parameters = snapshot.0;
                self.state = snapshot.1;
                Err(RuntimeError::new(
                    status::EVALUATION,
                    format!("runtime update failed: {}", error.message()),
                ))
            }
        }
    }

    /// Run collider hit testing against current mesh state.
    pub fn hit_test(&self, x: f64, y: f64) -> Result<Option<HitResult>, RuntimeError> {
        if !x.is_finite() || !y.is_finite() {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                "hit-test coordinates must be finite",
            ));
        }
        for collider in self.sorted_enabled_colliders() {
            if let Some(hit) = self.test_collider(collider, x, y) {
                return Ok(Some(hit));
            }
        }
        Ok(None)
    }

    fn evaluate(&mut self, delta_seconds: f64) -> Result<(), RuntimeError> {
        self.evaluate_parameter_bindings()?;
        if delta_seconds > 0.0 {
            self.run_physics(delta_seconds)?;
        }
        self.run_ik();
        self.compute_meshes();
        self.state.prev_parameters = self.parameter_values();
        Ok(())
    }

    fn parameter_values(&self) -> HashMap<String, f64> {
        self.parameters
            .parameters()
            .iter()
            .map(|parameter| (parameter.id.clone(), parameter.current_value))
            .collect()
    }

    fn evaluate_parameter_bindings(&mut self) -> Result<(), RuntimeError> {
        if self.scene.parameter_bindings.is_empty() {
            return Ok(());
        }
        let parameter_values = self.parameter_values();
        let mut groups: HashMap<String, Vec<&ParameterBinding>> = HashMap::new();
        for binding in &self.scene.parameter_bindings {
            groups
                .entry(binding.target.key())
                .or_default()
                .push(binding);
        }

        for group in groups.values() {
            let Some(first) = group.first() else {
                continue;
            };
            match &first.target {
                BindingTarget::Bone { bone_id, property } => {
                    let default_value = self.bone_binding_default(bone_id, *property);
                    let value = evaluate_bindings_additive(group, &parameter_values, default_value);
                    match property {
                        BoneBindingProperty::X => {
                            self.state.bone_x.insert(bone_id.clone(), value);
                        }
                        BoneBindingProperty::Y => {
                            self.state.bone_y.insert(bone_id.clone(), value);
                        }
                        BoneBindingProperty::Angle => {
                            self.state.bone_angles.insert(bone_id.clone(), value);
                        }
                        BoneBindingProperty::ScaleX => {
                            self.state.bone_scale_x.insert(bone_id.clone(), value);
                        }
                        BoneBindingProperty::ScaleY => {
                            self.state.bone_scale_y.insert(bone_id.clone(), value);
                        }
                    }
                }
                BindingTarget::IkController {
                    controller_id,
                    property,
                } => {
                    let default_value = self.ik_binding_default(controller_id, *property);
                    let value = evaluate_bindings_additive(group, &parameter_values, default_value);
                    match property {
                        IkBindingProperty::TargetX => {
                            self.state.ik_target_x.insert(controller_id.clone(), value);
                        }
                        IkBindingProperty::TargetY => {
                            self.state.ik_target_y.insert(controller_id.clone(), value);
                        }
                        IkBindingProperty::PoleTargetX => {
                            self.state
                                .ik_pole_target_x
                                .insert(controller_id.clone(), value);
                        }
                        IkBindingProperty::PoleTargetY => {
                            self.state
                                .ik_pole_target_y
                                .insert(controller_id.clone(), value);
                        }
                        IkBindingProperty::Influence => {
                            self.state
                                .ik_influence
                                .insert(controller_id.clone(), value.clamp(0.0, 1.0));
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn bone_binding_default(&self, bone_id: &str, property: BoneBindingProperty) -> f64 {
        let Some(bone) = self.scene.bones.get(bone_id) else {
            return match property {
                BoneBindingProperty::ScaleX | BoneBindingProperty::ScaleY => 1.0,
                _ => 0.0,
            };
        };
        match property {
            BoneBindingProperty::X => bone.x,
            BoneBindingProperty::Y => bone.y,
            BoneBindingProperty::Angle => 0.0,
            BoneBindingProperty::ScaleX | BoneBindingProperty::ScaleY => 1.0,
        }
    }

    fn ik_binding_default(&self, controller_id: &str, property: IkBindingProperty) -> f64 {
        let controller = self
            .scene
            .ik_controllers
            .iter()
            .find(|controller| controller.id == controller_id);
        let Some(controller) = controller else {
            return if property == IkBindingProperty::Influence {
                1.0
            } else {
                0.0
            };
        };
        match property {
            IkBindingProperty::TargetX => controller.target_x,
            IkBindingProperty::TargetY => controller.target_y,
            IkBindingProperty::PoleTargetX => controller.pole_target_x.unwrap_or(0.0),
            IkBindingProperty::PoleTargetY => controller.pole_target_y.unwrap_or(0.0),
            IkBindingProperty::Influence => controller.influence,
        }
    }

    fn run_physics(&mut self, delta_seconds: f64) -> Result<(), RuntimeError> {
        let current_values = self.parameter_values();
        for group in &self.scene.physics_groups {
            if !group.enabled {
                continue;
            }
            let Some(states) = self.state.physics_states.get_mut(&group.id) else {
                continue;
            };
            let forces =
                compute_input_forces(&group.inputs, &current_values, &self.state.prev_parameters);
            let accumulator = self
                .state
                .physics_accumulators
                .get(&group.id)
                .copied()
                .unwrap_or(0.0);
            let next_accumulator =
                run_physics_frame(group, states, forces, delta_seconds, accumulator);
            self.state
                .physics_accumulators
                .insert(group.id.clone(), next_accumulator);
            let output = compute_physics_outputs(group, states, self.parameters.parameters());
            for (parameter_id, value) in output.parameters {
                self.parameters.set_input(&parameter_id, value)?;
            }
            for (bone_id, angle) in output.bones {
                let current = self.state.bone_angles.get(&bone_id).copied().unwrap_or(0.0);
                self.state.bone_angles.insert(bone_id, current + angle);
            }
        }
        Ok(())
    }

    fn run_ik(&mut self) {
        if self.scene.ik_controllers.is_empty() {
            return;
        }
        let mut world_transforms = self.compute_world_transforms();
        let local_angles = self.scene.bone_local_angles();
        let parents = self.scene.bone_parents();

        for controller in &self.scene.ik_controllers {
            let effective = self.effective_ik_controller(controller);
            if effective.influence <= 0.0 || effective.bone_chain.is_empty() {
                continue;
            }
            let solved = solve_ik_controller(&effective, &world_transforms, &self.scene.bones);
            for (bone_id, solved_world_angle) in &solved {
                let current_angle = self
                    .state
                    .bone_angles
                    .get(bone_id)
                    .copied()
                    .or_else(|| local_angles.get(bone_id).copied())
                    .unwrap_or(0.0);
                let unconstrained = solved_world_angle_to_local(
                    bone_id,
                    *solved_world_angle,
                    &solved,
                    &parents,
                    &world_transforms,
                );
                let constrained = effective
                    .bone_chain
                    .iter()
                    .find(|constraint| constraint.bone_id == *bone_id)
                    .map_or(unconstrained, |constraint| {
                        clamp_ik_angle(unconstrained, constraint.min_angle, constraint.max_angle)
                    });
                let local =
                    current_angle * (1.0 - effective.influence) + constrained * effective.influence;
                self.state.bone_angles.insert(bone_id.clone(), local);
            }
            world_transforms = self.compute_world_transforms();
        }
    }

    fn effective_ik_controller(&self, controller: &IkController) -> IkController {
        let mut next = controller.clone();
        if let Some(value) = self.state.ik_target_x.get(&controller.id) {
            next.target_x = *value;
        }
        if let Some(value) = self.state.ik_target_y.get(&controller.id) {
            next.target_y = *value;
        }
        if let Some(value) = self.state.ik_pole_target_x.get(&controller.id) {
            next.pole_target_x = Some(*value);
        }
        if let Some(value) = self.state.ik_pole_target_y.get(&controller.id) {
            next.pole_target_y = Some(*value);
        }
        if let Some(value) = self.state.ik_influence.get(&controller.id) {
            next.influence = value.clamp(0.0, 1.0);
        }
        next
    }

    fn compute_meshes(&mut self) {
        let world_transforms = self.compute_world_transforms();
        let mut meshes = Vec::new();
        for layer in &self.scene.layers {
            let Some(mesh) = &layer.mesh else {
                continue;
            };
            let is_skinned = self.scene.skins.contains_key(&layer.id);
            let vertices = self.scene.skins.get(&layer.id).map_or_else(
                || mesh.vertices.clone(),
                |skin| compute_skinned_vertices(&mesh.vertices, skin, &world_transforms),
            );
            let culled = layer.culling && layer.effective_visible && is_polygon_flipped(&vertices);
            meshes.push(MeshSnapshot {
                id: layer.id.clone(),
                texture_id: mesh.texture_id.clone(),
                vertices,
                uvs: mesh.uvs.clone(),
                indices: mesh.indices.clone(),
                x: if is_skinned { 0.0 } else { layer.x as f32 },
                y: if is_skinned { 0.0 } else { layer.y as f32 },
                opacity: layer.opacity as f32,
                visible: layer.effective_visible && !culled,
                culled,
                blend_mode: layer.blend_mode,
                draw_order: layer.draw_order,
                multiply_color: layer.multiply_color,
                screen_color: layer.screen_color,
            });
        }
        meshes.sort_by_key(|mesh| mesh.draw_order);
        self.state.meshes = meshes;
    }

    fn compute_world_transforms(&self) -> HashMap<String, Affine2D> {
        let mut world = HashMap::new();
        let mut visiting = Vec::new();
        let mut cyclic = HashSet::new();
        for bone_id in self.scene.bones.keys() {
            self.compute_bone_world(bone_id, &mut world, &mut visiting, &mut cyclic);
        }
        world
    }

    fn compute_bone_world(
        &self,
        bone_id: &str,
        world: &mut HashMap<String, Affine2D>,
        visiting: &mut Vec<String>,
        cyclic: &mut HashSet<String>,
    ) -> Affine2D {
        if let Some(cached) = world.get(bone_id) {
            return *cached;
        }
        let Some(bone) = self.scene.bones.get(bone_id) else {
            return IDENTITY_AFFINE;
        };
        if visiting.iter().any(|id| id == bone_id) {
            if let Some(index) = visiting.iter().position(|id| id == bone_id) {
                for id in &visiting[index..] {
                    cyclic.insert(id.clone());
                }
            }
            return self.bone_local_transform(bone);
        }

        visiting.push(bone_id.to_owned());
        let local = self.bone_local_transform(bone);
        let transform = if let Some(parent_id) = &bone.parent_bone_id {
            if cyclic.contains(bone_id) {
                local
            } else {
                let parent = self.compute_bone_world(parent_id, world, visiting, cyclic);
                multiply_affine(parent, local)
            }
        } else {
            local
        };
        visiting.pop();
        let transform = if cyclic.contains(bone_id) {
            local
        } else {
            transform
        };
        world.insert(bone_id.to_owned(), transform);
        transform
    }

    fn bone_local_transform(&self, bone: &BoneLayer) -> Affine2D {
        let x = self.state.bone_x.get(&bone.id).copied().unwrap_or(bone.x);
        let y = self.state.bone_y.get(&bone.id).copied().unwrap_or(bone.y);
        let angle = self
            .state
            .bone_angles
            .get(&bone.id)
            .copied()
            .unwrap_or(bone.angle);
        let scale_x = self
            .state
            .bone_scale_x
            .get(&bone.id)
            .copied()
            .unwrap_or(bone.scale_x);
        let scale_y = self
            .state
            .bone_scale_y
            .get(&bone.id)
            .copied()
            .unwrap_or(bone.scale_y);
        let cosine = angle.cos();
        let sine = angle.sin();
        [
            cosine * scale_x,
            sine * scale_x,
            -sine * scale_y,
            cosine * scale_y,
            x,
            y,
        ]
    }

    fn sorted_enabled_colliders(&self) -> Vec<&Collider> {
        let draw_orders = self
            .state
            .meshes
            .iter()
            .map(|mesh| (mesh.id.as_str(), mesh.draw_order))
            .collect::<HashMap<_, _>>();
        let mut colliders = self
            .scene
            .colliders
            .iter()
            .enumerate()
            .filter(|(_, collider)| collider.enabled)
            .collect::<Vec<_>>();
        colliders.sort_by(|(index_a, a), (index_b, b)| {
            let priority_a = if matches!(a.shape, ColliderShape::Mesh { .. }) {
                0
            } else {
                1
            };
            let priority_b = if matches!(b.shape, ColliderShape::Mesh { .. }) {
                0
            } else {
                1
            };
            priority_b
                .cmp(&priority_a)
                .then_with(|| {
                    collider_draw_order(b, &draw_orders).cmp(&collider_draw_order(a, &draw_orders))
                })
                .then_with(|| index_a.cmp(index_b))
        });
        colliders
            .into_iter()
            .map(|(_, collider)| collider)
            .collect()
    }

    fn test_collider(&self, collider: &Collider, x: f64, y: f64) -> Option<HitResult> {
        match &collider.shape {
            ColliderShape::Rectangle {
                x: rect_x,
                y: rect_y,
                width,
                height,
            } => point_in_rect(x, y, *rect_x, *rect_y, *width, *height).then(|| HitResult {
                collider_id: collider.id.clone(),
                layer_id: None,
                mesh_id: None,
                x,
                y,
            }),
            ColliderShape::Circle {
                x: center_x,
                y: center_y,
                radius,
            } => point_in_circle(x, y, *center_x, *center_y, *radius).then(|| HitResult {
                collider_id: collider.id.clone(),
                layer_id: None,
                mesh_id: None,
                x,
                y,
            }),
            ColliderShape::Mesh { mesh_id } => {
                let mesh = self
                    .state
                    .meshes
                    .iter()
                    .find(|mesh| mesh.id == *mesh_id && mesh.visible)?;
                hit_test_mesh(mesh, x, y).then(|| HitResult {
                    collider_id: collider.id.clone(),
                    layer_id: Some(mesh_id.clone()),
                    mesh_id: Some(mesh_id.clone()),
                    x,
                    y,
                })
            }
        }
    }
}

#[derive(Clone, Debug)]
struct RuntimeScene {
    layers: Vec<LayerData>,
    bones: HashMap<String, BoneLayer>,
    skins: HashMap<String, SkinData>,
    parameter_bindings: Vec<ParameterBinding>,
    ik_controllers: Vec<IkController>,
    colliders: Vec<Collider>,
    physics_groups: Vec<PhysicsGroup>,
    expression_presets: Vec<ExpressionPreset>,
}

impl RuntimeScene {
    fn from_payload(payload: &RuntimePayload, limits: RuntimeLimits) -> Result<Self, RuntimeError> {
        let limits = limits.hardened();
        let root = object(&payload.value, "runtime payload")?;
        let project = object_field(root, "project", "project")?;
        let atlas_by_layer = atlas_layer_map(root, limits)?;
        let mut layers = Vec::new();
        collect_layers(
            array_field(project, "layers", "project.layers")?,
            &atlas_by_layer,
            &mut layers,
            0,
            true,
        )?;
        assert_limit("layers", layers.len(), limits.max_layers)?;
        assert_limit(
            "meshes",
            layers.iter().filter(|layer| layer.mesh.is_some()).count(),
            limits.max_meshes,
        )?;
        let bones = layers
            .iter()
            .filter_map(|layer| {
                layer
                    .bone
                    .as_ref()
                    .map(|bone| (bone.id.clone(), bone.clone()))
            })
            .collect::<HashMap<_, _>>();
        assert_limit("bones", bones.len(), limits.max_bones)?;
        let skins = parse_skins(project, limits)?;
        let parameter_bindings = parse_parameter_bindings(project, limits)?;
        let ik_controllers = parse_ik_controllers(project, limits)?;
        let colliders = parse_colliders(project, limits)?;
        let physics_groups = parse_physics_groups(project, limits)?;
        let expression_presets = parse_expression_presets(project)?;
        Ok(Self {
            layers,
            bones,
            skins,
            parameter_bindings,
            ik_controllers,
            colliders,
            physics_groups,
            expression_presets,
        })
    }

    fn bone_local_angles(&self) -> HashMap<String, f64> {
        self.bones
            .iter()
            .map(|(id, bone)| (id.clone(), bone.angle))
            .collect()
    }

    fn bone_parents(&self) -> HashMap<String, Option<String>> {
        self.bones
            .iter()
            .map(|(id, bone)| (id.clone(), bone.parent_bone_id.clone()))
            .collect()
    }
}

#[derive(Clone, Debug)]
struct RuntimeState {
    bone_x: HashMap<String, f64>,
    bone_y: HashMap<String, f64>,
    bone_angles: HashMap<String, f64>,
    bone_scale_x: HashMap<String, f64>,
    bone_scale_y: HashMap<String, f64>,
    ik_target_x: HashMap<String, f64>,
    ik_target_y: HashMap<String, f64>,
    ik_pole_target_x: HashMap<String, f64>,
    ik_pole_target_y: HashMap<String, f64>,
    ik_influence: HashMap<String, f64>,
    physics_states: HashMap<String, Vec<PendulumState>>,
    physics_accumulators: HashMap<String, f64>,
    prev_parameters: HashMap<String, f64>,
    meshes: Vec<MeshSnapshot>,
}

impl RuntimeState {
    fn new() -> Self {
        Self {
            bone_x: HashMap::new(),
            bone_y: HashMap::new(),
            bone_angles: HashMap::new(),
            bone_scale_x: HashMap::new(),
            bone_scale_y: HashMap::new(),
            ik_target_x: HashMap::new(),
            ik_target_y: HashMap::new(),
            ik_pole_target_x: HashMap::new(),
            ik_pole_target_y: HashMap::new(),
            ik_influence: HashMap::new(),
            physics_states: HashMap::new(),
            physics_accumulators: HashMap::new(),
            prev_parameters: HashMap::new(),
            meshes: Vec::new(),
        }
    }
}

#[derive(Clone, Debug)]
struct LayerData {
    id: String,
    x: f64,
    y: f64,
    opacity: f64,
    effective_visible: bool,
    blend_mode: BlendMode,
    draw_order: i32,
    multiply_color: Option<[f32; 4]>,
    screen_color: Option<[f32; 4]>,
    culling: bool,
    mesh: Option<MeshLayer>,
    bone: Option<BoneLayer>,
}

#[derive(Clone, Debug)]
struct MeshLayer {
    texture_id: String,
    vertices: Vec<f32>,
    uvs: Vec<f32>,
    indices: Vec<u32>,
}

#[derive(Clone, Debug)]
struct BoneLayer {
    id: String,
    parent_bone_id: Option<String>,
    x: f64,
    y: f64,
    angle: f64,
    length: f64,
    scale_x: f64,
    scale_y: f64,
}

#[derive(Clone, Debug)]
struct SkinData {
    weights: Vec<Vec<SkinWeight>>,
    bind_pose_inverse: HashMap<String, Affine2D>,
}

#[derive(Clone, Debug)]
struct SkinWeight {
    bone_id: String,
    weight: f64,
}

#[derive(Clone, Debug)]
struct ParameterBinding {
    parameter_id: String,
    target: BindingTarget,
    binding_points: Vec<BindingPoint>,
}

#[derive(Clone, Debug)]
struct BindingPoint {
    param_value: f64,
    target_value: f64,
}

#[derive(Clone, Debug)]
enum BindingTarget {
    Bone {
        bone_id: String,
        property: BoneBindingProperty,
    },
    IkController {
        controller_id: String,
        property: IkBindingProperty,
    },
}

impl BindingTarget {
    fn key(&self) -> String {
        match self {
            Self::Bone { bone_id, property } => format!("bone:{bone_id}:{property:?}"),
            Self::IkController {
                controller_id,
                property,
            } => {
                format!("ikController:{controller_id}:{property:?}")
            }
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum BoneBindingProperty {
    X,
    Y,
    Angle,
    ScaleX,
    ScaleY,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum IkBindingProperty {
    TargetX,
    TargetY,
    PoleTargetX,
    PoleTargetY,
    Influence,
}

#[derive(Clone, Debug)]
struct IkController {
    id: String,
    solver_type: IkSolverType,
    bone_chain: Vec<IkBoneConstraint>,
    target_x: f64,
    target_y: f64,
    pole_target_x: Option<f64>,
    pole_target_y: Option<f64>,
    influence: f64,
    max_iterations: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum IkSolverType {
    TwoBone,
    Ccd,
}

#[derive(Clone, Debug)]
struct IkBoneConstraint {
    bone_id: String,
    min_angle: f64,
    max_angle: f64,
}

#[derive(Clone, Debug)]
struct Collider {
    id: String,
    enabled: bool,
    shape: ColliderShape,
}

#[derive(Clone, Debug)]
enum ColliderShape {
    Rectangle {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    Circle {
        x: f64,
        y: f64,
        radius: f64,
    },
    Mesh {
        mesh_id: String,
    },
}

#[derive(Clone, Debug)]
struct PhysicsGroup {
    id: String,
    enabled: bool,
    pendulums: Vec<PendulumConfig>,
    inputs: Vec<PhysicsInput>,
    outputs: Vec<PhysicsOutput>,
    gravity_direction: f64,
    gravity_strength: f64,
    wind: f64,
}

#[derive(Clone, Copy, Debug)]
struct PendulumConfig {
    length: f64,
    mass: f64,
    damping: f64,
}

#[derive(Clone, Copy, Debug)]
struct PendulumState {
    angle: f64,
    angular_velocity: f64,
}

#[derive(Clone, Debug)]
struct PhysicsInput {
    parameter_id: String,
    weight: f64,
    kind: PhysicsInputKind,
}

#[derive(Clone, Copy, Debug)]
enum PhysicsInputKind {
    X,
    Y,
    Angle,
}

#[derive(Clone, Debug)]
struct PhysicsOutput {
    parameter_id: Option<String>,
    bone_id: Option<String>,
    pendulum_index: usize,
    weight: f64,
    kind: PhysicsOutputKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PhysicsOutputKind {
    Angle,
    BoneAngle,
}

#[derive(Clone, Debug)]
struct PhysicsOutputResult {
    parameters: HashMap<String, f64>,
    bones: HashMap<String, f64>,
}

type Affine2D = [f64; 6];

const IDENTITY_AFFINE: Affine2D = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

fn collect_layers(
    values: &[Value],
    atlas_by_layer: &HashMap<String, String>,
    layers: &mut Vec<LayerData>,
    depth: usize,
    parent_visible: bool,
) -> Result<(), RuntimeError> {
    if depth > 256 {
        return Err(validation_error("layer tree depth exceeds native limit"));
    }
    for (index, value) in values.iter().enumerate() {
        let path = format!("project.layers[{index}]");
        let object = object(value, &path)?;
        let id = string_field(object, "id", &format!("{path}.id"))?.to_owned();
        let visible = bool_field(object, "visible", &format!("{path}.visible"))?;
        let effective_visible = parent_visible && visible;
        let kind = string_field(object, "kind", &format!("{path}.kind"))?;
        let blend_mode = parse_blend_mode(string_field(
            object,
            "blendMode",
            &format!("{path}.blendMode"),
        )?)?;
        let x = optional_f64_field(object, "x", &format!("{path}.x"))?.unwrap_or(0.0);
        let y = optional_f64_field(object, "y", &format!("{path}.y"))?.unwrap_or(0.0);
        let layer = LayerData {
            x,
            y,
            opacity: f64_field(object, "opacity", &format!("{path}.opacity"))?,
            draw_order: optional_i32_field(object, "drawOrder", &format!("{path}.drawOrder"))?
                .unwrap_or(DEFAULT_DRAW_ORDER),
            multiply_color: color_field(object, "multiplyColor", &format!("{path}.multiplyColor"))?,
            screen_color: color_field(object, "screenColor", &format!("{path}.screenColor"))?
                .filter(|color| color[0] != 0.0 || color[1] != 0.0 || color[2] != 0.0),
            culling: optional_bool_field(object, "culling", &format!("{path}.culling"))?
                .unwrap_or(false),
            mesh: if kind == "viviMesh" {
                let mesh = object_field(object, "mesh", &format!("{path}.mesh"))?;
                Some(MeshLayer {
                    texture_id: atlas_by_layer.get(&id).cloned().ok_or_else(|| {
                        RuntimeError::new(
                            status::TEXTURE,
                            format!("mesh layer has no runtime atlas entry: {id}"),
                        )
                    })?,
                    vertices: f32_array_field(mesh, "vertices", &format!("{path}.mesh.vertices"))?,
                    uvs: f32_array_field(mesh, "uvs", &format!("{path}.mesh.uvs"))?,
                    indices: u32_array_field(mesh, "indices", &format!("{path}.mesh.indices"))?,
                })
            } else {
                None
            },
            bone: if kind == "bone" {
                let bone = object_field(object, "bone", &format!("{path}.bone"))?;
                Some(BoneLayer {
                    id: id.clone(),
                    parent_bone_id: optional_string_field(
                        object,
                        "parentBoneId",
                        &format!("{path}.parentBoneId"),
                    )?,
                    x,
                    y,
                    angle: f64_field(bone, "angle", &format!("{path}.bone.angle"))?,
                    length: f64_field(bone, "length", &format!("{path}.bone.length"))?,
                    scale_x: f64_field(bone, "scaleX", &format!("{path}.bone.scaleX"))?,
                    scale_y: f64_field(bone, "scaleY", &format!("{path}.bone.scaleY"))?,
                })
            } else {
                None
            },
            id,
            effective_visible,
            blend_mode,
        };
        layers.push(layer);
        if let Some(children) = object.get("children") {
            collect_layers(
                array(children, &format!("{path}.children"))?,
                atlas_by_layer,
                layers,
                depth + 1,
                effective_visible,
            )?;
        }
    }
    Ok(())
}

fn atlas_layer_map(
    root: &Map<String, Value>,
    limits: RuntimeLimits,
) -> Result<HashMap<String, String>, RuntimeError> {
    let mut atlas_by_layer = HashMap::new();
    let atlases = array_field(root, "atlases", "atlases")?;
    assert_limit("textures", atlases.len(), limits.max_textures)?;
    for (atlas_index, atlas) in atlases.iter().enumerate() {
        let atlas_object = object(atlas, &format!("atlases[{atlas_index}]"))?;
        let texture_id = format!("atlas:{atlas_index}");
        for entry in array_field(
            atlas_object,
            "entries",
            &format!("atlases[{atlas_index}].entries"),
        )? {
            let entry = object(entry, "atlas entry")?;
            let layer_id = string_field(entry, "layerId", "atlas entry layerId")?;
            atlas_by_layer.insert(layer_id.to_owned(), texture_id.clone());
        }
    }
    Ok(atlas_by_layer)
}

fn parse_skins(
    project: &Map<String, Value>,
    limits: RuntimeLimits,
) -> Result<HashMap<String, SkinData>, RuntimeError> {
    let Some(value) = project.get("skins") else {
        return Ok(HashMap::new());
    };
    let skins_object = object(value, "project.skins")?;
    let mut skins = HashMap::new();
    for (mesh_id, skin_value) in skins_object {
        let skin = object(skin_value, &format!("project.skins.{mesh_id}"))?;
        let mut weights = Vec::new();
        for (vertex_index, vertex_weights) in
            array_field(skin, "weights", &format!("project.skins.{mesh_id}.weights"))?
                .iter()
                .enumerate()
        {
            let mut parsed_weights = Vec::new();
            for weight in array(vertex_weights, "skin weights")? {
                let weight = object(weight, "skin weight")?;
                parsed_weights.push(SkinWeight {
                    bone_id: string_field(weight, "boneId", "skin weight boneId")?.to_owned(),
                    weight: f64_field(weight, "weight", "skin weight")?,
                });
            }
            assert_limit(
                "skin vertex weights",
                vertex_index + 1,
                limits.max_vertices_per_mesh,
            )?;
            weights.push(parsed_weights);
        }
        let bind_pose = object_field(
            skin,
            "bindPoseInverse",
            &format!("project.skins.{mesh_id}.bindPoseInverse"),
        )?;
        let mut bind_pose_inverse = HashMap::new();
        for (bone_id, matrix_value) in bind_pose {
            let matrix = f64_array(matrix_value, "bindPoseInverse matrix")?;
            if matrix.len() != 6 {
                return Err(validation_error(
                    "bindPoseInverse matrix must have 6 values",
                ));
            }
            bind_pose_inverse.insert(
                bone_id.clone(),
                [
                    matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5],
                ],
            );
        }
        skins.insert(
            mesh_id.clone(),
            SkinData {
                weights,
                bind_pose_inverse,
            },
        );
    }
    Ok(skins)
}

fn parse_parameter_bindings(
    project: &Map<String, Value>,
    limits: RuntimeLimits,
) -> Result<Vec<ParameterBinding>, RuntimeError> {
    let Some(value) = project.get("parameterBindings") else {
        return Ok(Vec::new());
    };
    let bindings = array(value, "project.parameterBindings")?;
    let mut result = Vec::new();
    let mut binding_point_count = 0usize;
    for (index, binding_value) in bindings.iter().enumerate() {
        let path = format!("project.parameterBindings[{index}]");
        let binding = object(binding_value, &path)?;
        let target = object_field(binding, "target", &format!("{path}.target"))?;
        let target_type = string_field(target, "type", &format!("{path}.target.type"))?;
        let parsed_target = match target_type {
            "bone" => BindingTarget::Bone {
                bone_id: string_field(target, "boneId", &format!("{path}.target.boneId"))?
                    .to_owned(),
                property: parse_bone_binding_property(string_field(
                    target,
                    "property",
                    &format!("{path}.target.property"),
                )?)?,
            },
            "ikController" => BindingTarget::IkController {
                controller_id: string_field(
                    target,
                    "controllerId",
                    &format!("{path}.target.controllerId"),
                )?
                .to_owned(),
                property: parse_ik_binding_property(string_field(
                    target,
                    "property",
                    &format!("{path}.target.property"),
                )?)?,
            },
            _ => continue,
        };
        let mut points = Vec::new();
        for point in array_field(binding, "bindingPoints", &format!("{path}.bindingPoints"))? {
            let point = object(point, "binding point")?;
            points.push(BindingPoint {
                param_value: f64_field(point, "paramValue", "binding point paramValue")?,
                target_value: f64_field(point, "targetValue", "binding point targetValue")?,
            });
        }
        binding_point_count += points.len();
        assert_limit(
            "binding points",
            binding_point_count,
            limits.max_binding_points,
        )?;
        result.push(ParameterBinding {
            parameter_id: string_field(binding, "parameterId", &format!("{path}.parameterId"))?
                .to_owned(),
            target: parsed_target,
            binding_points: points,
        });
    }
    Ok(result)
}

fn parse_ik_controllers(
    project: &Map<String, Value>,
    limits: RuntimeLimits,
) -> Result<Vec<IkController>, RuntimeError> {
    let Some(value) = project.get("ikControllers") else {
        return Ok(Vec::new());
    };
    let controllers = array(value, "project.ikControllers")?;
    assert_limit(
        "ikControllers",
        controllers.len(),
        limits.max_ik_controllers,
    )?;
    let mut result = Vec::new();
    for (index, controller_value) in controllers.iter().enumerate() {
        let path = format!("project.ikControllers[{index}]");
        let controller = object(controller_value, &path)?;
        let mut bone_chain = Vec::new();
        for constraint_value in array_field(controller, "boneChain", &format!("{path}.boneChain"))?
        {
            let constraint = object(constraint_value, "IK bone constraint")?;
            bone_chain.push(IkBoneConstraint {
                bone_id: string_field(constraint, "boneId", "IK boneId")?.to_owned(),
                min_angle: f64_field(constraint, "minAngle", "IK minAngle")?,
                max_angle: f64_field(constraint, "maxAngle", "IK maxAngle")?,
            });
        }
        let solver_type =
            match string_field(controller, "solverType", &format!("{path}.solverType"))? {
                "twoBone" => IkSolverType::TwoBone,
                _ => IkSolverType::Ccd,
            };
        result.push(IkController {
            id: string_field(controller, "id", &format!("{path}.id"))?.to_owned(),
            solver_type,
            bone_chain,
            target_x: f64_field(controller, "targetX", &format!("{path}.targetX"))?,
            target_y: f64_field(controller, "targetY", &format!("{path}.targetY"))?,
            pole_target_x: optional_f64_field(
                controller,
                "poleTargetX",
                &format!("{path}.poleTargetX"),
            )?,
            pole_target_y: optional_f64_field(
                controller,
                "poleTargetY",
                &format!("{path}.poleTargetY"),
            )?,
            influence: f64_field(controller, "influence", &format!("{path}.influence"))?
                .clamp(0.0, 1.0),
            max_iterations: optional_u64_field(
                controller,
                "maxIterations",
                &format!("{path}.maxIterations"),
            )?
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(10),
        });
    }
    Ok(result)
}

fn parse_colliders(
    project: &Map<String, Value>,
    limits: RuntimeLimits,
) -> Result<Vec<Collider>, RuntimeError> {
    let Some(value) = project.get("colliders") else {
        return Ok(Vec::new());
    };
    let colliders = array(value, "project.colliders")?;
    assert_limit("colliders", colliders.len(), limits.max_colliders)?;
    let mut result = Vec::new();
    for (index, collider_value) in colliders.iter().enumerate() {
        let path = format!("project.colliders[{index}]");
        let collider = object(collider_value, &path)?;
        let shape = object_field(collider, "shape", &format!("{path}.shape"))?;
        let shape_type = string_field(shape, "type", &format!("{path}.shape.type"))?;
        let parsed_shape = match shape_type {
            "rectangle" => ColliderShape::Rectangle {
                x: f64_field(shape, "x", "rectangle x")?,
                y: f64_field(shape, "y", "rectangle y")?,
                width: f64_field(shape, "width", "rectangle width")?,
                height: f64_field(shape, "height", "rectangle height")?,
            },
            "circle" => ColliderShape::Circle {
                x: f64_field(shape, "x", "circle x")?,
                y: f64_field(shape, "y", "circle y")?,
                radius: f64_field(shape, "radius", "circle radius")?,
            },
            "mesh" => ColliderShape::Mesh {
                mesh_id: string_field(shape, "meshId", "mesh collider meshId")?.to_owned(),
            },
            _ => return Err(validation_error("unsupported collider shape")),
        };
        result.push(Collider {
            id: string_field(collider, "id", &format!("{path}.id"))?.to_owned(),
            enabled: bool_field(collider, "enabled", &format!("{path}.enabled"))?,
            shape: parsed_shape,
        });
    }
    Ok(result)
}

fn parse_physics_groups(
    project: &Map<String, Value>,
    limits: RuntimeLimits,
) -> Result<Vec<PhysicsGroup>, RuntimeError> {
    let Some(value) = project.get("physicsGroups") else {
        return Ok(Vec::new());
    };
    let groups = array(value, "project.physicsGroups")?;
    assert_limit("physicsGroups", groups.len(), limits.max_physics_groups)?;
    let mut result = Vec::new();
    for (index, group_value) in groups.iter().enumerate() {
        let path = format!("project.physicsGroups[{index}]");
        let group = object(group_value, &path)?;
        let pendulum_values = array_field(group, "pendulums", &format!("{path}.pendulums"))?;
        assert_limit(
            "pendulums",
            pendulum_values.len(),
            limits.max_pendulums_per_physics_group,
        )?;
        let mut pendulums = Vec::new();
        for pendulum in pendulum_values {
            let pendulum = object(pendulum, "pendulum")?;
            pendulums.push(PendulumConfig {
                length: f64_field(pendulum, "length", "pendulum length")?,
                mass: f64_field(pendulum, "mass", "pendulum mass")?,
                damping: f64_field(pendulum, "damping", "pendulum damping")?,
            });
        }
        result.push(PhysicsGroup {
            id: string_field(group, "id", &format!("{path}.id"))?.to_owned(),
            enabled: bool_field(group, "enabled", &format!("{path}.enabled"))?,
            pendulums,
            inputs: parse_physics_inputs(group, &path)?,
            outputs: parse_physics_outputs(group, &path)?,
            gravity_direction: f64_field(
                group,
                "gravityDirection",
                &format!("{path}.gravityDirection"),
            )?,
            gravity_strength: f64_field(
                group,
                "gravityStrength",
                &format!("{path}.gravityStrength"),
            )?,
            wind: f64_field(group, "wind", &format!("{path}.wind"))?,
        });
    }
    Ok(result)
}

fn parse_physics_inputs(
    group: &Map<String, Value>,
    path: &str,
) -> Result<Vec<PhysicsInput>, RuntimeError> {
    let mut inputs = Vec::new();
    for input in array_field(group, "inputs", &format!("{path}.inputs"))? {
        let input = object(input, "physics input")?;
        inputs.push(PhysicsInput {
            parameter_id: string_field(input, "parameterId", "physics input parameterId")?
                .to_owned(),
            weight: f64_field(input, "weight", "physics input weight")?,
            kind: match string_field(input, "type", "physics input type")? {
                "x" => PhysicsInputKind::X,
                "y" => PhysicsInputKind::Y,
                _ => PhysicsInputKind::Angle,
            },
        });
    }
    Ok(inputs)
}

fn parse_physics_outputs(
    group: &Map<String, Value>,
    path: &str,
) -> Result<Vec<PhysicsOutput>, RuntimeError> {
    let mut outputs = Vec::new();
    for output in array_field(group, "outputs", &format!("{path}.outputs"))? {
        let output = object(output, "physics output")?;
        let kind = match string_field(output, "type", "physics output type")? {
            "boneAngle" => PhysicsOutputKind::BoneAngle,
            _ => PhysicsOutputKind::Angle,
        };
        outputs.push(PhysicsOutput {
            parameter_id: optional_string_field(
                output,
                "parameterId",
                "physics output parameterId",
            )?,
            bone_id: optional_string_field(output, "boneId", "physics output boneId")?,
            pendulum_index: usize::try_from(u64_field(
                output,
                "pendulumIndex",
                "physics output pendulumIndex",
            )?)
            .map_err(|_| validation_error("physics output pendulumIndex is too large"))?,
            weight: f64_field(output, "weight", "physics output weight")?,
            kind,
        });
    }
    Ok(outputs)
}

fn parse_expression_presets(
    project: &Map<String, Value>,
) -> Result<Vec<ExpressionPreset>, RuntimeError> {
    let Some(value) = project.get("expressionPresets") else {
        return Ok(Vec::new());
    };
    let presets = array(value, "project.expressionPresets")?;
    let mut result = Vec::new();
    for (index, preset_value) in presets.iter().enumerate() {
        let path = format!("project.expressionPresets[{index}]");
        let preset = object(preset_value, &path)?;
        let values_object = object_field(preset, "values", &format!("{path}.values"))?;
        let mut values = Vec::new();
        for (parameter_id, value) in values_object {
            let Some(value) = value.as_f64().filter(|value| value.is_finite()) else {
                return Err(validation_error(format!(
                    "{path}.values.{parameter_id} must be finite"
                )));
            };
            values.push(ExpressionPresetValue {
                parameter_id: parameter_id.clone(),
                value,
            });
        }
        values.sort_by(|a, b| a.parameter_id.cmp(&b.parameter_id));
        result.push(ExpressionPreset {
            id: string_field(preset, "id", &format!("{path}.id"))?.to_owned(),
            name: string_field(preset, "name", &format!("{path}.name"))?.to_owned(),
            color: optional_string_field(preset, "color", &format!("{path}.color"))?,
            hotkey: optional_u64_field(preset, "hotkey", &format!("{path}.hotkey"))?
                .map(|value| value.to_string()),
            values,
        });
    }
    Ok(result)
}

fn evaluate_bindings_additive(
    bindings: &[&ParameterBinding],
    values: &HashMap<String, f64>,
    default_value: f64,
) -> f64 {
    let mut sum = 0.0;
    for binding in bindings {
        let parameter_value = values.get(&binding.parameter_id).copied().unwrap_or(0.0);
        let evaluated =
            interpolate_binding_points(&binding.binding_points, parameter_value, default_value);
        sum += evaluated - default_value;
    }
    default_value + sum
}

fn interpolate_binding_points(points: &[BindingPoint], value: f64, default_value: f64) -> f64 {
    if points.is_empty() {
        return default_value;
    }
    if points.len() == 1 {
        return points[0].target_value;
    }
    let first = &points[0];
    let last = &points[points.len() - 1];
    if value <= first.param_value {
        return first.target_value;
    }
    if value >= last.param_value {
        return last.target_value;
    }
    for pair in points.windows(2) {
        let current = &pair[0];
        let next = &pair[1];
        if value >= current.param_value && value <= next.param_value {
            let t = (value - current.param_value) / (next.param_value - current.param_value);
            return current.target_value + (next.target_value - current.target_value) * t;
        }
    }
    default_value
}

fn compute_skinned_vertices(
    rest_vertices: &[f32],
    skin: &SkinData,
    world_transforms: &HashMap<String, Affine2D>,
) -> Vec<f32> {
    let vertex_count = rest_vertices.len() / 2;
    let mut result = vec![0.0_f32; rest_vertices.len()];
    for vertex_index in 0..vertex_count {
        let rest_x = rest_vertices[vertex_index * 2] as f64;
        let rest_y = rest_vertices[vertex_index * 2 + 1] as f64;
        let Some(weights) = skin.weights.get(vertex_index) else {
            result[vertex_index * 2] = rest_x as f32;
            result[vertex_index * 2 + 1] = rest_y as f32;
            continue;
        };
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        let mut applied_weight = 0.0;
        for weight in weights {
            let Some(world) = world_transforms.get(&weight.bone_id) else {
                continue;
            };
            let Some(bind_inverse) = skin.bind_pose_inverse.get(&weight.bone_id) else {
                continue;
            };
            let skin_matrix = multiply_affine(*world, *bind_inverse);
            let transformed_x = skin_matrix[0] * rest_x + skin_matrix[2] * rest_y + skin_matrix[4];
            let transformed_y = skin_matrix[1] * rest_x + skin_matrix[3] * rest_y + skin_matrix[5];
            sum_x += transformed_x * weight.weight;
            sum_y += transformed_y * weight.weight;
            applied_weight += weight.weight;
        }
        if applied_weight <= 1e-12 {
            result[vertex_index * 2] = rest_x as f32;
            result[vertex_index * 2 + 1] = rest_y as f32;
            continue;
        }
        if applied_weight < 1.0 {
            let rest_weight = 1.0 - applied_weight;
            sum_x += rest_x * rest_weight;
            sum_y += rest_y * rest_weight;
        }
        result[vertex_index * 2] = sum_x as f32;
        result[vertex_index * 2 + 1] = sum_y as f32;
    }
    result
}

fn solve_ik_controller(
    controller: &IkController,
    world_transforms: &HashMap<String, Affine2D>,
    bones: &HashMap<String, BoneLayer>,
) -> HashMap<String, f64> {
    if controller.solver_type == IkSolverType::TwoBone && controller.bone_chain.len() == 2 {
        let bone0 = &controller.bone_chain[0];
        let bone1 = &controller.bone_chain[1];
        let transform0 = world_transforms
            .get(&bone0.bone_id)
            .copied()
            .unwrap_or(IDENTITY_AFFINE);
        let length1 = bones.get(&bone0.bone_id).map_or(0.0, |bone| bone.length);
        let length2 = bones.get(&bone1.bone_id).map_or(0.0, |bone| bone.length);
        let (angle1, angle2) = solve_two_bone_ik(
            transform0[4],
            transform0[5],
            length1,
            length2,
            controller.target_x,
            controller.target_y,
            controller.pole_target_x,
            controller.pole_target_y,
            Some((bone0, bone1)),
        );
        return HashMap::from([
            (bone0.bone_id.clone(), angle1),
            (bone1.bone_id.clone(), angle2),
        ]);
    }
    solve_ccd_ik(controller, world_transforms, bones)
}

#[allow(clippy::too_many_arguments)]
fn solve_two_bone_ik(
    root_x: f64,
    root_y: f64,
    length1: f64,
    length2: f64,
    target_x: f64,
    target_y: f64,
    pole_x: Option<f64>,
    pole_y: Option<f64>,
    constraints: Option<(&IkBoneConstraint, &IkBoneConstraint)>,
) -> (f64, f64) {
    let dx = target_x - root_x;
    let dy = target_y - root_y;
    let distance = (dx * dx + dy * dy).sqrt();
    let angle_to_target = dy.atan2(dx);
    if distance >= length1 + length2 {
        return apply_two_bone_constraints(angle_to_target, angle_to_target, constraints);
    }
    if distance <= (length1 - length2).abs() {
        return apply_two_bone_constraints(
            angle_to_target,
            angle_to_target + std::f64::consts::PI,
            constraints,
        );
    }
    let cos_angle1 =
        (length1 * length1 + distance * distance - length2 * length2) / (2.0 * length1 * distance);
    let mut inner_angle1 = cos_angle1.clamp(-1.0, 1.0).acos();
    if let (Some(pole_x), Some(pole_y)) = (pole_x, pole_y) {
        let pole_dx = pole_x - root_x;
        let pole_dy = pole_y - root_y;
        let cross = dx * pole_dy - dy * pole_dx;
        if cross < 0.0 {
            inner_angle1 = -inner_angle1;
        }
    }
    let angle1 = angle_to_target + inner_angle1;
    let joint_x = root_x + length1 * angle1.cos();
    let joint_y = root_y + length1 * angle1.sin();
    let angle2 = (target_y - joint_y).atan2(target_x - joint_x);
    apply_two_bone_constraints(angle1, angle2, constraints)
}

fn apply_two_bone_constraints(
    angle1: f64,
    angle2: f64,
    constraints: Option<(&IkBoneConstraint, &IkBoneConstraint)>,
) -> (f64, f64) {
    let Some((constraint1, constraint2)) = constraints else {
        return (angle1, angle2);
    };
    (
        clamp_ik_angle(angle1, constraint1.min_angle, constraint1.max_angle),
        clamp_ik_angle(angle2, constraint2.min_angle, constraint2.max_angle),
    )
}

fn solve_ccd_ik(
    controller: &IkController,
    world_transforms: &HashMap<String, Affine2D>,
    bones: &HashMap<String, BoneLayer>,
) -> HashMap<String, f64> {
    let mut angles = Vec::new();
    let mut positions = Vec::new();
    let mut lengths = Vec::new();
    for constraint in &controller.bone_chain {
        let transform = world_transforms
            .get(&constraint.bone_id)
            .copied()
            .unwrap_or(IDENTITY_AFFINE);
        positions.push((transform[4], transform[5]));
        angles.push(transform[1].atan2(transform[0]));
        lengths.push(
            bones
                .get(&constraint.bone_id)
                .map_or(0.0, |bone| bone.length),
        );
    }
    if angles.is_empty() {
        return HashMap::new();
    }
    for _ in 0..controller.max_iterations {
        for index in (0..angles.len()).rev() {
            let (end_x, end_y) = ccd_end_effector(&positions, &angles, &lengths);
            let to_end = (end_y - positions[index].1).atan2(end_x - positions[index].0);
            let to_target = (controller.target_y - positions[index].1)
                .atan2(controller.target_x - positions[index].0);
            let delta = normalize_ik_angle(to_target - to_end);
            let constraint = &controller.bone_chain[index];
            angles[index] = clamp_ik_angle(
                angles[index] + delta,
                constraint.min_angle,
                constraint.max_angle,
            );
            for child in index + 1..positions.len() {
                positions[child].0 =
                    positions[child - 1].0 + lengths[child - 1] * angles[child - 1].cos();
                positions[child].1 =
                    positions[child - 1].1 + lengths[child - 1] * angles[child - 1].sin();
            }
        }
        let (end_x, end_y) = ccd_end_effector(&positions, &angles, &lengths);
        let dx = end_x - controller.target_x;
        let dy = end_y - controller.target_y;
        if (dx * dx + dy * dy).sqrt() < 0.5 {
            break;
        }
    }
    controller
        .bone_chain
        .iter()
        .enumerate()
        .map(|(index, constraint)| (constraint.bone_id.clone(), angles[index]))
        .collect()
}

fn ccd_end_effector(positions: &[(f64, f64)], angles: &[f64], lengths: &[f64]) -> (f64, f64) {
    let last = angles.len() - 1;
    (
        positions[last].0 + lengths[last] * angles[last].cos(),
        positions[last].1 + lengths[last] * angles[last].sin(),
    )
}

fn solved_world_angle_to_local(
    bone_id: &str,
    solved_world_angle: f64,
    solved_world_angles: &HashMap<String, f64>,
    parents: &HashMap<String, Option<String>>,
    world_transforms: &HashMap<String, Affine2D>,
) -> f64 {
    let Some(Some(parent_id)) = parents.get(bone_id) else {
        return normalize_ik_angle(solved_world_angle);
    };
    let parent_world = solved_world_angles
        .get(parent_id)
        .copied()
        .unwrap_or_else(|| {
            world_transforms
                .get(parent_id)
                .map_or(0.0, |transform| transform[1].atan2(transform[0]))
        });
    normalize_ik_angle(solved_world_angle - parent_world)
}

fn normalize_ik_angle(angle: f64) -> f64 {
    let mut normalized = angle % (2.0 * std::f64::consts::PI);
    if normalized >= std::f64::consts::PI {
        normalized -= 2.0 * std::f64::consts::PI;
    }
    if normalized < -std::f64::consts::PI {
        normalized += 2.0 * std::f64::consts::PI;
    }
    normalized
}

fn clamp_ik_angle(angle: f64, min: f64, max: f64) -> f64 {
    normalize_ik_angle(angle).clamp(min, max)
}

fn compute_input_forces(
    inputs: &[PhysicsInput],
    current_values: &HashMap<String, f64>,
    previous_values: &HashMap<String, f64>,
) -> (f64, f64) {
    let mut x = 0.0;
    let mut y = 0.0;
    for input in inputs {
        let current = current_values
            .get(&input.parameter_id)
            .copied()
            .unwrap_or(0.0);
        let previous = previous_values
            .get(&input.parameter_id)
            .copied()
            .unwrap_or(0.0);
        let delta = (current - previous) * input.weight;
        match input.kind {
            PhysicsInputKind::X | PhysicsInputKind::Angle => x += delta,
            PhysicsInputKind::Y => y += delta,
        }
    }
    (x, y)
}

fn run_physics_frame(
    group: &PhysicsGroup,
    states: &mut [PendulumState],
    input_forces: (f64, f64),
    delta_seconds: f64,
    previous_accumulator: f64,
) -> f64 {
    let mut accumulator = previous_accumulator + delta_seconds;
    let mut substeps = 0usize;
    while accumulator >= PHYSICS_TIMESTEP && substeps < PHYSICS_MAX_SUBSTEPS {
        step_physics_group(group, states, input_forces, PHYSICS_TIMESTEP);
        accumulator -= PHYSICS_TIMESTEP;
        substeps += 1;
    }
    if accumulator > PHYSICS_TIMESTEP * PHYSICS_MAX_SUBSTEPS as f64 {
        0.0
    } else {
        accumulator
    }
}

fn step_physics_group(
    group: &PhysicsGroup,
    states: &mut [PendulumState],
    input_forces: (f64, f64),
    delta_seconds: f64,
) {
    let gravity_radians = group.gravity_direction * std::f64::consts::PI / 180.0;
    let gravity_x = gravity_radians.sin() * group.gravity_strength;
    let gravity_y = gravity_radians.cos() * group.gravity_strength;
    for index in 0..group.pendulums.len() {
        let Some(config) = group.pendulums.get(index).copied() else {
            continue;
        };
        let Some(state) = states.get(index).copied() else {
            continue;
        };
        let arm_x = state.angle.sin();
        let arm_y = state.angle.cos();
        let mut force_x = gravity_x + group.wind;
        let mut force_y = gravity_y;
        if index == 0 {
            force_x += input_forces.0;
            force_y += input_forces.1;
        } else if let Some(parent) = states.get(index - 1) {
            force_x += parent.angular_velocity * config.length * PHYSICS_FORCE_PROPAGATION;
        }
        let torque = force_x * arm_y - force_y * arm_x;
        let mass_length = config.mass * config.length;
        let angular_acceleration = if mass_length > 0.0 {
            torque / mass_length
        } else {
            0.0
        };
        let state = &mut states[index];
        state.angular_velocity += angular_acceleration * delta_seconds;
        state.angular_velocity *= 1.0 - config.damping;
        state.angle += state.angular_velocity * delta_seconds;
        if state.angle > PHYSICS_MAX_ANGLE {
            state.angle = PHYSICS_MAX_ANGLE;
            state.angular_velocity = 0.0;
        } else if state.angle < -PHYSICS_MAX_ANGLE {
            state.angle = -PHYSICS_MAX_ANGLE;
            state.angular_velocity = 0.0;
        }
    }
}

fn compute_physics_outputs(
    group: &PhysicsGroup,
    states: &[PendulumState],
    parameters: &[ParameterInfo],
) -> PhysicsOutputResult {
    let parameter_map = parameters
        .iter()
        .map(|parameter| (parameter.id.as_str(), parameter))
        .collect::<HashMap<_, _>>();
    let mut result = PhysicsOutputResult {
        parameters: HashMap::new(),
        bones: HashMap::new(),
    };
    for output in &group.outputs {
        let Some(state) = states.get(output.pendulum_index) else {
            continue;
        };
        let raw_value = state.angle * output.weight;
        if output.kind == PhysicsOutputKind::BoneAngle {
            if let Some(bone_id) = &output.bone_id {
                result.bones.insert(bone_id.clone(), raw_value);
            }
        } else if let Some(parameter_id) = &output.parameter_id {
            let mut value = raw_value;
            if let Some(definition) = parameter_map.get(parameter_id.as_str()) {
                value += definition.default_value;
                value = value.clamp(definition.min, definition.max);
            }
            result.parameters.insert(parameter_id.clone(), value);
        }
    }
    result
}

fn multiply_affine(parent: Affine2D, child: Affine2D) -> Affine2D {
    [
        parent[0] * child[0] + parent[2] * child[1],
        parent[1] * child[0] + parent[3] * child[1],
        parent[0] * child[2] + parent[2] * child[3],
        parent[1] * child[2] + parent[3] * child[3],
        parent[0] * child[4] + parent[2] * child[5] + parent[4],
        parent[1] * child[4] + parent[3] * child[5] + parent[5],
    ]
}

fn point_in_triangle(
    point_x: f64,
    point_y: f64,
    a: (f64, f64),
    b: (f64, f64),
    c: (f64, f64),
) -> bool {
    let denominator = (b.1 - c.1) * (a.0 - c.0) + (c.0 - b.0) * (a.1 - c.1);
    if denominator.abs() < 1e-10 {
        return false;
    }
    let u = ((b.1 - c.1) * (point_x - c.0) + (c.0 - b.0) * (point_y - c.1)) / denominator;
    let v = ((c.1 - a.1) * (point_x - c.0) + (a.0 - c.0) * (point_y - c.1)) / denominator;
    let w = 1.0 - u - v;
    u >= 0.0 && v >= 0.0 && w >= 0.0
}

fn point_in_rect(point_x: f64, point_y: f64, x: f64, y: f64, width: f64, height: f64) -> bool {
    point_x >= x && point_x <= x + width && point_y >= y && point_y <= y + height
}

fn point_in_circle(point_x: f64, point_y: f64, x: f64, y: f64, radius: f64) -> bool {
    let dx = point_x - x;
    let dy = point_y - y;
    dx * dx + dy * dy <= radius * radius
}

fn hit_test_mesh(mesh: &MeshSnapshot, x: f64, y: f64) -> bool {
    let local_x = x - f64::from(mesh.x);
    let local_y = y - f64::from(mesh.y);
    for index in (0..mesh.indices.len()).step_by(TRIANGLE_VERTS) {
        let Some(i0) = mesh.indices.get(index).copied() else {
            continue;
        };
        let Some(i1) = mesh.indices.get(index + 1).copied() else {
            continue;
        };
        let Some(i2) = mesh.indices.get(index + 2).copied() else {
            continue;
        };
        let a = vertex_pair(&mesh.vertices, i0 as usize);
        let b = vertex_pair(&mesh.vertices, i1 as usize);
        let c = vertex_pair(&mesh.vertices, i2 as usize);
        if let (Some(a), Some(b), Some(c)) = (a, b, c)
            && point_in_triangle(local_x, local_y, a, b, c)
        {
            return true;
        }
    }
    false
}

fn vertex_pair(vertices: &[f32], index: usize) -> Option<(f64, f64)> {
    let offset = index.checked_mul(COORD_STRIDE)?;
    Some((
        *vertices.get(offset)? as f64,
        *vertices.get(offset + 1)? as f64,
    ))
}

fn is_polygon_flipped(vertices: &[f32]) -> bool {
    if vertices.len() < TRIANGLE_VERTS * COORD_STRIDE {
        return false;
    }
    let mut signed_area = 0.0_f64;
    for index in (0..vertices.len()).step_by(COORD_STRIDE) {
        let next = (index + COORD_STRIDE) % vertices.len();
        let x0 = vertices[index] as f64;
        let y0 = vertices[index + 1] as f64;
        let x1 = vertices[next] as f64;
        let y1 = vertices[next + 1] as f64;
        signed_area += x0 * y1 - x1 * y0;
    }
    signed_area < 0.0
}

fn collider_draw_order(collider: &Collider, draw_orders: &HashMap<&str, i32>) -> i32 {
    match &collider.shape {
        ColliderShape::Mesh { mesh_id } => draw_orders.get(mesh_id.as_str()).copied().unwrap_or(0),
        _ => 0,
    }
}

fn parse_bone_binding_property(value: &str) -> Result<BoneBindingProperty, RuntimeError> {
    match value {
        "x" => Ok(BoneBindingProperty::X),
        "y" => Ok(BoneBindingProperty::Y),
        "angle" => Ok(BoneBindingProperty::Angle),
        "scaleX" => Ok(BoneBindingProperty::ScaleX),
        "scaleY" => Ok(BoneBindingProperty::ScaleY),
        _ => Err(validation_error("unsupported bone binding property")),
    }
}

fn parse_ik_binding_property(value: &str) -> Result<IkBindingProperty, RuntimeError> {
    match value {
        "targetX" => Ok(IkBindingProperty::TargetX),
        "targetY" => Ok(IkBindingProperty::TargetY),
        "poleTargetX" => Ok(IkBindingProperty::PoleTargetX),
        "poleTargetY" => Ok(IkBindingProperty::PoleTargetY),
        "influence" => Ok(IkBindingProperty::Influence),
        _ => Err(validation_error("unsupported IK binding property")),
    }
}

fn parse_blend_mode(value: &str) -> Result<BlendMode, RuntimeError> {
    match value {
        "normal" => Ok(BlendMode::Normal),
        "multiply" => Ok(BlendMode::Multiply),
        "screen" => Ok(BlendMode::Screen),
        "add" => Ok(BlendMode::Add),
        _ => Err(validation_error("unsupported blend mode")),
    }
}

fn object<'a>(value: &'a Value, path: &str) -> Result<&'a Map<String, Value>, RuntimeError> {
    value
        .as_object()
        .ok_or_else(|| validation_error(format!("{path} must be an object")))
}

fn object_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a Map<String, Value>, RuntimeError> {
    object
        .get(key)
        .ok_or_else(|| validation_error(format!("{path} is required")))
        .and_then(|value| self::object(value, path))
}

fn array_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a [Value], RuntimeError> {
    object
        .get(key)
        .ok_or_else(|| validation_error(format!("{path} is required")))
        .and_then(|value| array(value, path))
}

fn array<'a>(value: &'a Value, path: &str) -> Result<&'a [Value], RuntimeError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| validation_error(format!("{path} must be an array")))
}

fn string_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a str, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| validation_error(format!("{path} must be a string")))
}

fn optional_string_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<String>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    value
        .as_str()
        .map(|value| Some(value.to_owned()))
        .ok_or_else(|| validation_error(format!("{path} must be a string or null")))
}

fn bool_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<bool, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| validation_error(format!("{path} must be a boolean")))
}

fn optional_bool_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<bool>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_bool()
        .map(Some)
        .ok_or_else(|| validation_error(format!("{path} must be a boolean")))
}

fn f64_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<f64, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| validation_error(format!("{path} must be finite")))
}

fn optional_f64_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<f64>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_f64()
        .filter(|value| value.is_finite())
        .map(Some)
        .ok_or_else(|| validation_error(format!("{path} must be finite")))
}

fn u64_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<u64, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| validation_error(format!("{path} must be a uint64")))
}

fn optional_u64_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<u64>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_u64()
        .map(Some)
        .ok_or_else(|| validation_error(format!("{path} must be a uint64")))
}

fn optional_i32_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<i32>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
        .map(Some)
        .ok_or_else(|| validation_error(format!("{path} must be an int32")))
}

fn f32_array_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Vec<f32>, RuntimeError> {
    array_field(object, key, path)?
        .iter()
        .enumerate()
        .map(|(index, value)| {
            value
                .as_f64()
                .filter(|number| number.is_finite())
                .map(|number| number as f32)
                .ok_or_else(|| validation_error(format!("{path}[{index}] must be finite")))
        })
        .collect()
}

fn f64_array(value: &Value, path: &str) -> Result<Vec<f64>, RuntimeError> {
    array(value, path)?
        .iter()
        .enumerate()
        .map(|(index, value)| {
            value
                .as_f64()
                .filter(|number| number.is_finite())
                .ok_or_else(|| validation_error(format!("{path}[{index}] must be finite")))
        })
        .collect()
}

fn u32_array_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Vec<u32>, RuntimeError> {
    array_field(object, key, path)?
        .iter()
        .enumerate()
        .map(|(index, value)| {
            value
                .as_u64()
                .and_then(|number| u32::try_from(number).ok())
                .ok_or_else(|| validation_error(format!("{path}[{index}] must be a uint32")))
        })
        .collect()
}

fn color_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<[f32; 4]>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    let color = value
        .as_object()
        .ok_or_else(|| validation_error(format!("{path} must be an object")))?;
    Ok(Some([
        f64_field(color, "r", &format!("{path}.r"))? as f32,
        f64_field(color, "g", &format!("{path}.g"))? as f32,
        f64_field(color, "b", &format!("{path}.b"))? as f32,
        optional_f64_field(color, "a", &format!("{path}.a"))?.unwrap_or(1.0) as f32,
    ]))
}

fn validation_error(message: impl Into<String>) -> RuntimeError {
    RuntimeError::new(status::VALIDATION, message.into())
}

fn assert_limit(label: &str, actual: usize, limit: usize) -> Result<(), RuntimeError> {
    if actual > limit {
        return Err(RuntimeError::new(
            status::LIMIT_EXCEEDED,
            format!("{label} exceeds runtime limit: {actual} > {limit}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;
    use crate::{RuntimeLimits, parse_runtime_payload};

    fn fixture_file_data(name: &str) -> Value {
        let fixture = match name {
            "draw-hit-culling" => include_str!(
                "../../../../../tests/conformance/runtime-v1/draw-hit-culling.fixture.json"
            ),
            "binding-skinning" => include_str!(
                "../../../../../tests/conformance/runtime-v1/binding-skinning.fixture.json"
            ),
            "ik-two-bone" => {
                include_str!("../../../../../tests/conformance/runtime-v1/ik-two-bone.fixture.json")
            }
            "physics-pendulum" => include_str!(
                "../../../../../tests/conformance/runtime-v1/physics-pendulum.fixture.json"
            ),
            _ => unreachable!("unknown fixture"),
        };
        let fixture = serde_json::from_str::<Value>(fixture).unwrap();
        fixture.get("fileData").unwrap().clone()
    }

    fn model_from_file_data(file_data: Value) -> Result<RuntimeModel, RuntimeError> {
        let file_data = file_data.to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        RuntimeModel::from_payload_with_limits(&payload, RuntimeLimits::default())
    }

    fn model_from_fixture(name: &str) -> RuntimeModel {
        model_from_file_data(fixture_file_data(name)).unwrap()
    }

    fn model_error_from_file_data(file_data: Value) -> RuntimeError {
        match model_from_file_data(file_data) {
            Ok(_) => panic!("expected model validation error"),
            Err(error) => error,
        }
    }

    #[test]
    fn evaluates_draw_order_culling_and_hit_testing() {
        let mut model = model_from_fixture("draw-hit-culling");
        model.update(0.0).unwrap();
        assert_eq!(model.meshes().len(), 2);
        assert_eq!(model.meshes()[0].id, "mesh-back");
        assert_eq!(model.meshes()[1].id, "mesh-front");
        assert!(model.meshes()[1].culled);
        assert!(!model.meshes()[1].visible);
        let rect_hit = model.hit_test(22.0, 22.0).unwrap().unwrap();
        assert_eq!(rect_hit.collider_id, "ui-rect");
        assert!(model.hit_test(2.0, 2.0).unwrap().is_none());
    }

    #[test]
    fn evaluates_parameter_binding_and_skinning() {
        let mut model = model_from_fixture("binding-skinning");
        model.set_input("vivi.bone.rotate", 1.0).unwrap();
        model.update(0.0).unwrap();
        assert_eq!(model.get_input("vivi.bone.rotate").unwrap(), 1.0);
        let vertices = &model.meshes()[0].vertices;
        assert!((vertices[0] - 0.0).abs() < 1e-4);
        assert!((vertices[1] - 1.0).abs() < 1e-4);
        assert!((vertices[4] - -1.0).abs() < 1e-4);
    }

    #[test]
    fn rejects_invalid_dynamic_mesh_translation_metadata() {
        for key in ["x", "y"] {
            let mut file_data = fixture_file_data("draw-hit-culling");
            file_data["project"]["layers"][0][key] = Value::String("left".to_owned());
            let error = model_error_from_file_data(file_data);
            assert_eq!(error.status(), status::VALIDATION);
        }
    }

    #[test]
    fn rejects_invalid_dynamic_translation_metadata_on_bone_layers() {
        for key in ["x", "y"] {
            let mut file_data = fixture_file_data("binding-skinning");
            assert_eq!(file_data["project"]["layers"][0]["kind"], "bone");
            file_data["project"]["layers"][0][key] = Value::String("left".to_owned());
            let error = model_error_from_file_data(file_data);
            assert_eq!(error.status(), status::VALIDATION);
        }
    }

    #[test]
    fn evaluates_two_bone_ik() {
        let mut model = model_from_fixture("ik-two-bone");
        model.update(0.0).unwrap();
        let vertices = &model.meshes()[0].vertices;
        assert!((vertices[0] - 0.0).abs() < 1e-4);
        assert!((vertices[1] - 10.0).abs() < 1e-4);
        assert!((vertices[2] - 10.0).abs() < 1e-4);
        assert!((vertices[3] - 10.0).abs() < 1e-4);
    }

    #[test]
    fn evaluates_pendulum_physics() {
        let mut model = model_from_fixture("physics-pendulum");
        model.set_input("vivi.motion.x", 1.0).unwrap();
        model.update(1.0 / 120.0).unwrap();
        let value = model.get_input("vivi.physics.angle").unwrap();
        assert!((value - 0.00006944444444444444).abs() < 1e-10);
    }

    #[test]
    fn failed_physics_update_rolls_back_observable_state() {
        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[{"id":"mesh-body","name":"Body","visible":true,"opacity":1,"x":0,"y":0,"width":10,"height":10,"blendMode":"normal","expanded":true,"kind":"viviMesh","children":[],"drawOrder":10,"mesh":{"vertices":[0,0,10,0,0,10],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}}],"parameters":[{"id":"vivi.motion.x","name":"Motion X","minValue":-1,"maxValue":1,"defaultValue":0}],"physicsGroups":[{"id":"physics-broken","name":"Broken Physics","enabled":true,"pendulums":[{"length":1,"mass":1,"damping":0}],"inputs":[{"parameterId":"vivi.motion.x","weight":1,"type":"x"}],"outputs":[{"parameterId":"vivi.missing","pendulumIndex":0,"weight":1,"type":"angle"}],"gravityDirection":0,"gravityStrength":9.8,"wind":0}],"skins":{},"colliders":[],"stateMachines":[],"expressionPresets":[]},"atlases":[{"image":"host-atlas-0","width":16,"height":16,"entries":[{"layerId":"mesh-body","x":0,"y":0,"width":10,"height":10}]}]}"#;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let mut model =
            RuntimeModel::from_payload_with_limits(&payload, RuntimeLimits::default()).unwrap();
        model.set_input("vivi.motion.x", 1.0).unwrap();
        let before_meshes = model.meshes().to_vec();

        let error = model.update(1.0 / 120.0).unwrap_err();
        assert_eq!(error.status(), status::EVALUATION);
        assert_eq!(model.get_input("vivi.motion.x").unwrap(), 1.0);
        assert_eq!(model.meshes(), before_meshes.as_slice());
    }

    #[test]
    fn applies_expression_preset_to_known_parameters_only() {
        let payload = br##"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":[{"id":"vivi.head.yaw","name":"Head Yaw","minValue":-1,"maxValue":1,"defaultValue":0}],"expressionPresets":[{"id":"happy","name":"Happy","color":"#ffeeaa","hotkey":1,"values":{"missing.parameter":1,"vivi.head.yaw":2}}]},"atlases":[]}"##;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let mut model =
            RuntimeModel::from_payload_with_limits(&payload, RuntimeLimits::default()).unwrap();

        assert_eq!(model.expression_presets().len(), 1);
        assert_eq!(model.expression_presets()[0].values.len(), 2);
        model.apply_expression_preset("happy").unwrap();
        assert_eq!(model.get_input("vivi.head.yaw").unwrap(), 1.0);
        let error = model.apply_expression_preset("missing").unwrap_err();
        assert_eq!(error.status(), status::INVALID_ARGUMENT);
    }

    #[test]
    fn deterministic_update_fuzz_smoke_does_not_panic() {
        let mut model = model_from_fixture("physics-pendulum");
        let mut seed = 0x1234_5678_u64;
        for _ in 0..1_000 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let input = ((seed >> 33) as f64 / u32::MAX as f64) * 2.0 - 1.0;
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let delta = ((seed >> 33) as f64 / u32::MAX as f64) * (1.0 / 30.0);
            model.set_input("vivi.motion.x", input).unwrap();
            model.update(delta).unwrap();
            assert!(model.get_input("vivi.physics.angle").unwrap().is_finite());
        }
    }
}
