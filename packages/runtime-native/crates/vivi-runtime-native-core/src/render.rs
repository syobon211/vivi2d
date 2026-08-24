use std::collections::{HashMap, HashSet};

use crate::RuntimeError;
use crate::status;

/// Fixed byte size of one Runtime ABI 0.2 draw command.
pub const DRAW_COMMAND_STRUCT_SIZE: u32 = 24;

/// `BEGIN_MASK` flag that inverts the mask inside its current parent mask.
pub const DRAW_COMMAND_FLAG_MASK_INVERT: u32 = 1;

/// Maximum active mask depth accepted by the runtime.
pub const MAX_MASK_DEPTH: u32 = 8;

/// Required-render-feature bit for draw-command rendering.
pub const RENDER_FEATURE_DRAW_COMMANDS: u64 = 1;

/// Runtime ABI 0.2 draw-command kinds.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DrawCommandType {
    /// Draw a color mesh.
    DrawMesh = 1,
    /// Begin an alpha mask.
    BeginMask = 2,
    /// End the innermost alpha mask.
    EndMask = 3,
}

/// Fixed-layout Runtime ABI 0.2 draw command.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(C)]
pub struct DrawCommand {
    /// Fixed structure size, always 24.
    pub struct_size: u32,
    /// Numeric [`DrawCommandType`] value.
    pub command_type: u32,
    /// Stable V2 render-mesh slot for draw and begin commands, or zero for end.
    pub mesh_index: u32,
    /// Active mask depth after this command executes.
    pub mask_depth: u32,
    /// `BEGIN_MASK` flags; all other command kinds require zero.
    pub flags: u32,
    /// Reserved field, always zero.
    pub reserved: u32,
}

#[derive(Clone, Debug)]
pub(crate) struct ClipMaskEdge {
    pub(crate) layer_id: String,
    pub(crate) invert: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct RenderLayerTopology {
    pub(crate) id: String,
    pub(crate) clip_masks: Vec<ClipMaskEdge>,
    pub(crate) draw_order: i32,
    pub(crate) visible: bool,
    pub(crate) mesh_slot: u32,
}

pub(crate) fn build_draw_commands(
    layers: &[RenderLayerTopology],
) -> Result<Vec<DrawCommand>, RuntimeError> {
    let mut layers_by_id = HashMap::with_capacity(layers.len());
    let mut slots = HashSet::with_capacity(layers.len());
    for layer in layers {
        if layers_by_id.insert(layer.id.as_str(), layer).is_some() {
            return Err(draw_commands_error(format!(
                "duplicate render mesh ID: {}",
                layer.id
            )));
        }
        if !slots.insert(layer.mesh_slot) || layer.mesh_slot as usize >= layers.len() {
            return Err(draw_commands_error(format!(
                "invalid render mesh slot for {}: {}",
                layer.id, layer.mesh_slot
            )));
        }
    }

    let mask_source_ids = layers
        .iter()
        .flat_map(|layer| layer.clip_masks.iter().map(|edge| edge.layer_id.as_str()))
        .collect::<HashSet<_>>();
    let mut render_order = layers.iter().collect::<Vec<_>>();
    render_order.sort_by_key(|layer| (layer.draw_order, layer.mesh_slot));

    let mut commands = Vec::new();
    for layer in render_order {
        let command_start = commands.len();
        let begin_count = emit_masks(layer, &layers_by_id, &mut commands, &mut Vec::new(), 0)?;
        // An invisible referenced mesh is mask-only. It remains addressable in
        // the V2 table, but never gets an ordinary color draw command.
        if !layer.visible && mask_source_ids.contains(layer.id.as_str()) {
            commands.truncate(command_start);
            continue;
        }
        commands.push(command(
            DrawCommandType::DrawMesh,
            layer.mesh_slot,
            begin_count,
        ));
        for depth_after in (0..begin_count).rev() {
            commands.push(command(DrawCommandType::EndMask, 0, depth_after));
        }
    }

    validate_draw_commands(&commands, layers.len())?;
    Ok(commands)
}

fn emit_masks(
    layer: &RenderLayerTopology,
    layers: &HashMap<&str, &RenderLayerTopology>,
    commands: &mut Vec<DrawCommand>,
    stack: &mut Vec<String>,
    mut depth: u32,
) -> Result<u32, RuntimeError> {
    if stack.iter().any(|id| id == &layer.id) {
        return Err(draw_commands_error(format!(
            "clip-mask cycle at render mesh {}",
            layer.id
        )));
    }
    stack.push(layer.id.clone());
    for edge in &layer.clip_masks {
        if depth >= MAX_MASK_DEPTH || stack.len() as u32 > MAX_MASK_DEPTH {
            return Err(RuntimeError::new(
                status::LIMIT_EXCEEDED,
                format!("clip-mask graph exceeds runtime maximum depth {MAX_MASK_DEPTH}"),
            ));
        }
        let mask = layers.get(edge.layer_id.as_str()).ok_or_else(|| {
            draw_commands_error(format!(
                "render mesh {} references missing mask mesh {}",
                layer.id, edge.layer_id
            ))
        })?;
        depth = emit_masks(mask, layers, commands, stack, depth)?;
        depth = depth
            .checked_add(1)
            .ok_or_else(|| RuntimeError::new(status::LIMIT_EXCEEDED, "clip-mask depth overflow"))?;
        if depth > MAX_MASK_DEPTH {
            return Err(RuntimeError::new(
                status::LIMIT_EXCEEDED,
                format!("clip-mask depth exceeds runtime limit: {depth} > {MAX_MASK_DEPTH}"),
            ));
        }
        commands.push(command_with_flags(
            DrawCommandType::BeginMask,
            mask.mesh_slot,
            depth,
            u32::from(edge.invert) * DRAW_COMMAND_FLAG_MASK_INVERT,
        ));
    }
    stack.pop();
    Ok(depth)
}

fn command(command_type: DrawCommandType, mesh_index: u32, mask_depth: u32) -> DrawCommand {
    command_with_flags(command_type, mesh_index, mask_depth, 0)
}

fn command_with_flags(
    command_type: DrawCommandType,
    mesh_index: u32,
    mask_depth: u32,
    flags: u32,
) -> DrawCommand {
    DrawCommand {
        struct_size: DRAW_COMMAND_STRUCT_SIZE,
        command_type: command_type as u32,
        mesh_index,
        mask_depth,
        flags,
        reserved: 0,
    }
}

/// Validate the fixed-layout command stream against the Runtime ABI 0.2 rules.
///
/// This is public only so sibling native ABI adapters can share the exact same
/// defensive validator; it is not a separately versioned consumer API.
#[doc(hidden)]
pub fn validate_draw_commands(
    commands: &[DrawCommand],
    mesh_count: usize,
) -> Result<(), RuntimeError> {
    let mut depth = 0_u32;
    for command in commands {
        if command.struct_size != DRAW_COMMAND_STRUCT_SIZE || command.reserved != 0 {
            return Err(draw_commands_error("invalid fixed draw-command fields"));
        }
        match command.command_type {
            value if value == DrawCommandType::BeginMask as u32 => {
                if command.flags & !DRAW_COMMAND_FLAG_MASK_INVERT != 0 {
                    return Err(draw_commands_error("invalid BEGIN_MASK flags"));
                }
                if command.mesh_index as usize >= mesh_count {
                    return Err(draw_commands_error("BEGIN_MASK mesh slot is out of range"));
                }
                depth = depth
                    .checked_add(1)
                    .ok_or_else(|| draw_commands_error("mask depth overflow"))?;
                if depth > MAX_MASK_DEPTH {
                    return Err(draw_commands_error("draw-command mask depth exceeds 8"));
                }
            }
            value if value == DrawCommandType::DrawMesh as u32 => {
                if command.flags != 0 {
                    return Err(draw_commands_error("DRAW_MESH flags must be zero"));
                }
                if command.mesh_index as usize >= mesh_count {
                    return Err(draw_commands_error("DRAW_MESH slot is out of range"));
                }
            }
            value if value == DrawCommandType::EndMask as u32 => {
                if command.flags != 0 || command.mesh_index != 0 {
                    return Err(draw_commands_error(
                        "END_MASK flags and mesh index must be zero",
                    ));
                }
                depth = depth
                    .checked_sub(1)
                    .ok_or_else(|| draw_commands_error("unmatched END_MASK"))?;
            }
            _ => return Err(draw_commands_error("unknown draw-command type")),
        }
        if command.mask_depth != depth {
            return Err(draw_commands_error("draw-command mask depth mismatch"));
        }
    }
    if depth != 0 {
        return Err(draw_commands_error("unclosed mask command"));
    }
    Ok(())
}

fn draw_commands_error(message: impl Into<String>) -> RuntimeError {
    RuntimeError::new(status::DRAW_COMMANDS_INVALID, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn topology(
        id: impl Into<String>,
        mesh_slot: u32,
        clip_masks: Vec<ClipMaskEdge>,
    ) -> RenderLayerTopology {
        RenderLayerTopology {
            id: id.into(),
            clip_masks,
            draw_order: mesh_slot as i32,
            visible: true,
            mesh_slot,
        }
    }

    fn edge(layer_id: impl Into<String>, invert: bool) -> ClipMaskEdge {
        ClipMaskEdge {
            layer_id: layer_id.into(),
            invert,
        }
    }

    #[test]
    fn command_validator_rejects_every_reserved_or_structural_violation() {
        let valid = [
            command_with_flags(DrawCommandType::BeginMask, 0, 1, 1),
            command(DrawCommandType::DrawMesh, 0, 1),
            command(DrawCommandType::EndMask, 0, 0),
        ];
        validate_draw_commands(&valid, 1).unwrap();

        let invalid = [
            DrawCommand {
                struct_size: 23,
                ..valid[1]
            },
            DrawCommand {
                command_type: 0,
                ..valid[1]
            },
            DrawCommand {
                mesh_index: 1,
                ..valid[1]
            },
            DrawCommand {
                flags: 1,
                ..valid[1]
            },
            DrawCommand {
                mesh_index: 1,
                ..valid[2]
            },
            DrawCommand {
                flags: 2,
                ..valid[0]
            },
            DrawCommand {
                reserved: 1,
                ..valid[1]
            },
        ];
        for command in invalid {
            let error = validate_draw_commands(&[command], 1).unwrap_err();
            assert_eq!(error.status(), status::DRAW_COMMANDS_INVALID);
        }
    }

    #[test]
    fn command_validator_rejects_unmatched_and_excessive_masks() {
        let error =
            validate_draw_commands(&[command(DrawCommandType::EndMask, 0, 0)], 1).unwrap_err();
        assert_eq!(error.status(), status::DRAW_COMMANDS_INVALID);

        let commands = (1..=MAX_MASK_DEPTH + 1)
            .map(|depth| command(DrawCommandType::BeginMask, 0, depth))
            .collect::<Vec<_>>();
        let error = validate_draw_commands(&commands, 1).unwrap_err();
        assert_eq!(error.status(), status::DRAW_COMMANDS_INVALID);
    }

    #[test]
    fn internal_topology_preserves_editor_lowered_invert_flag() {
        let layers = [
            topology("mask", 0, Vec::new()),
            topology("target", 1, vec![edge("mask", true)]),
        ];

        let commands = build_draw_commands(&layers).unwrap();
        let begin = commands
            .iter()
            .find(|command| command.command_type == DrawCommandType::BeginMask as u32)
            .unwrap();
        assert_eq!(begin.flags, DRAW_COMMAND_FLAG_MASK_INVERT);
    }

    #[test]
    fn long_mask_chain_stops_at_ninth_edge_without_deep_recursion() {
        const CHAIN_LENGTH: usize = 4_096;
        let layers = (0..=CHAIN_LENGTH)
            .map(|index| {
                let clip_masks = (index < CHAIN_LENGTH)
                    .then(|| edge(format!("mesh-{}", index + 1), false))
                    .into_iter()
                    .collect();
                topology(format!("mesh-{index}"), index as u32, clip_masks)
            })
            .collect::<Vec<_>>();

        let error = build_draw_commands(&layers).unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);
    }
}
