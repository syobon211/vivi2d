//! Allocation-free category-11 identity, mask expansion and command sealing.

use std::mem::{align_of, offset_of, size_of};

use serde_json::{Map, Value};

use crate::model::RangeV1;
use crate::{EvaluationLoweringError, EvaluationLoweringErrorKind, EvaluationLoweringFoundationV1};

#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct MeshTopologyV1 {
    pub(crate) id: RangeV1,
    pub(crate) mesh_slot: u32,
    pub(crate) texture_slot: u32,
    pub(crate) draw_order: i32,
    pub(crate) masks: RangeV1,
    pub(crate) visible: u32,
    pub(crate) mask_source: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct MaskEdgeV1 {
    pub(crate) source_slot: u32,
    pub(crate) invert: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct DrawCommandV1 {
    pub(crate) words: [u32; 6],
}

pub(crate) struct TopologyV1 {
    pub(crate) id_bytes: Vec<u8>,
    pub(crate) meshes: Vec<MeshTopologyV1>,
    pub(crate) edges: Vec<MaskEdgeV1>,
    pub(crate) draw_order: Vec<u32>,
    pub(crate) commands: Vec<DrawCommandV1>,
    counts: [u32; 5],
    pub(crate) reserved_capacities: [usize; 5],
}

impl TopologyV1 {
    pub(crate) fn empty(counts: [u32; 5]) -> Self {
        Self {
            id_bytes: Vec::new(),
            meshes: Vec::new(),
            edges: Vec::new(),
            draw_order: Vec::new(),
            commands: Vec::new(),
            counts,
            reserved_capacities: [0; 5],
        }
    }

    pub(crate) fn capacities(&self) -> [usize; 5] {
        [
            self.id_bytes.capacity(),
            self.meshes.capacity(),
            self.edges.capacity(),
            self.draw_order.capacity(),
            self.commands.capacity(),
        ]
    }

    pub(crate) fn id(&self, slot: usize) -> Result<&str, EvaluationLoweringError> {
        let row = self.meshes.get(slot).ok_or_else(internal)?;
        std::str::from_utf8(slice(&self.id_bytes, row.id)?).map_err(|_| internal())
    }

    pub(crate) fn fill(
        self,
        foundation: &EvaluationLoweringFoundationV1,
    ) -> Result<Self, EvaluationLoweringError> {
        self.fill_from_value(foundation, foundation.candidate.value())
    }

    // The production caller always passes the retained candidate. Tests may
    // borrow a shape-equivalent post-validation leaf witness without opening
    // the validated-candidate constructor or changing its private payload.
    pub(crate) fn fill_from_value(
        mut self,
        foundation: &EvaluationLoweringFoundationV1,
        root: &Value,
    ) -> Result<Self, EvaluationLoweringError> {
        let layers = root
            .get("layers")
            .and_then(Value::as_array)
            .ok_or_else(internal)?;
        crate::lower::visit_layers(layers, true, &mut |layer, visible| {
            if layer.get("kind").and_then(Value::as_str) != Some("viviMesh") {
                return Ok(());
            }
            let id = string(layer, "id")?;
            if id.is_empty() {
                return Err(internal());
            }
            for slot in 0..self.meshes.len() {
                if self.id(slot)? == id {
                    return Err(internal());
                }
            }
            let range = RangeV1 {
                start: u32::try_from(self.id_bytes.len()).map_err(|_| internal())?,
                len: u32::try_from(id.len()).map_err(|_| internal())?,
            };
            for byte in id.bytes() {
                push(&mut self.id_bytes, byte, self.counts[0])?;
            }
            let mesh_slot = u32::try_from(self.meshes.len()).map_err(|_| internal())?;
            let draw_order = match layer.get("drawOrder") {
                None => 500,
                Some(v) => {
                    let value = v.as_f64().ok_or_else(internal)?;
                    let integer = value as i32;
                    if value != f64::from(integer) {
                        return Err(internal());
                    }
                    integer
                }
            };
            let texture_slot = texture_slot(root, foundation, id)?;
            push(
                &mut self.meshes,
                MeshTopologyV1 {
                    id: range,
                    mesh_slot,
                    texture_slot,
                    draw_order,
                    masks: RangeV1::default(),
                    visible: u32::from(visible),
                    mask_source: 0,
                },
                self.counts[1],
            )?;
            push(&mut self.draw_order, mesh_slot, self.counts[3])
        })?;
        let mut slot = 0_usize;
        crate::lower::visit_layers(layers, true, &mut |layer, _| {
            if layer.get("kind").and_then(Value::as_str) != Some("viviMesh") {
                return Ok(());
            }
            let start = u32::try_from(self.edges.len()).map_err(|_| internal())?;
            match (layer.get("clipMaskIds"), layer.get("clipMasks")) {
                (None, None) => (),
                (Some(ids), None) => {
                    for id in ids.as_array().ok_or_else(internal)? {
                        self.add_edge(id.as_str().ok_or_else(internal)?, false)?;
                    }
                }
                (None, Some(edges)) => {
                    for edge in edges.as_array().ok_or_else(internal)? {
                        let edge = edge.as_object().ok_or_else(internal)?;
                        self.add_edge(
                            string(edge, "layerId")?,
                            edge.get("invert")
                                .and_then(Value::as_bool)
                                .ok_or_else(internal)?,
                        )?;
                    }
                }
                _ => return Err(internal()),
            }
            let end = u32::try_from(self.edges.len()).map_err(|_| internal())?;
            self.meshes.get_mut(slot).ok_or_else(internal)?.masks = RangeV1 {
                start,
                len: end.checked_sub(start).ok_or_else(internal)?,
            };
            slot += 1;
            Ok(())
        })?;
        if self.id_bytes.len() != self.counts[0] as usize
            || self.meshes.len() != self.counts[1] as usize
            || self.edges.len() != self.counts[2] as usize
            || self.draw_order.len() != self.counts[3] as usize
            || foundation.reservation_plan.direct_mesh_records.len() != self.meshes.len()
            || foundation.reservation_plan.mesh_evaluator_specs.len() != self.meshes.len()
        {
            return Err(internal());
        }
        // Complete key, so no stable-sort allocation or unspecified tie behavior.
        let meshes = &self.meshes;
        self.draw_order
            .sort_unstable_by_key(|slot| (meshes[*slot as usize].draw_order, *slot));
        for order in 0..self.draw_order.len() {
            let slot = self.draw_order[order];
            let row = self.meshes[slot as usize];
            let emit = row.visible != 0 || row.mask_source == 0;
            let mut path = [u32::MAX; 9];
            let mut active = 0_u32;
            self.expand_masks(slot, &mut path, 0, &mut active, emit)?;
            if emit {
                self.command(1, slot, active, 0)?;
                while active != 0 {
                    active -= 1;
                    self.command(3, 0, active, 0)?;
                }
            }
        }
        self.verify_commands()?;
        if self.capacities() != self.reserved_capacities {
            return Err(internal());
        }
        Ok(self)
    }

    fn add_edge(&mut self, id: &str, invert: bool) -> Result<(), EvaluationLoweringError> {
        let mut source = None;
        for slot in 0..self.meshes.len() {
            if self.id(slot)? == id {
                source = Some(slot);
                break;
            }
        }
        let slot = source.ok_or_else(internal)?;
        self.meshes[slot].mask_source = 1;
        push(
            &mut self.edges,
            MaskEdgeV1 {
                source_slot: u32::try_from(slot).map_err(|_| internal())?,
                invert: u32::from(invert),
            },
            self.counts[2],
        )
    }

    fn expand_masks(
        &mut self,
        slot: u32,
        path: &mut [u32; 9],
        level: usize,
        active: &mut u32,
        emit: bool,
    ) -> Result<(), EvaluationLoweringError> {
        if level >= path.len() || path[..level].contains(&slot) {
            return Err(internal());
        }
        path[level] = slot;
        let masks = self.meshes.get(slot as usize).ok_or_else(internal)?.masks;
        let range = range(masks, self.edges.len())?;
        for index in range {
            let edge = self.edges[index];
            if edge.invert > 1 {
                return Err(internal());
            }
            self.expand_masks(edge.source_slot, path, level + 1, active, emit)?;
            *active = active.checked_add(1).ok_or_else(internal)?;
            if *active > 8 {
                return Err(internal());
            }
            if emit {
                self.command(2, edge.source_slot, *active, edge.invert)?;
            }
        }
        Ok(())
    }

    fn command(
        &mut self,
        kind: u32,
        mesh: u32,
        depth: u32,
        flags: u32,
    ) -> Result<(), EvaluationLoweringError> {
        push(
            &mut self.commands,
            DrawCommandV1 {
                words: [24, kind, mesh, depth, flags, 0],
            },
            self.counts[4],
        )
    }

    fn verify_commands(&self) -> Result<(), EvaluationLoweringError> {
        let mut depth = 0_u32;
        for command in &self.commands {
            let [size, kind, mesh, actual_depth, flags, reserved] = command.words;
            if size != 24 || reserved != 0 {
                return Err(internal());
            }
            match kind {
                1 if (mesh as usize) < self.meshes.len() && flags == 0 => (),
                2 if (mesh as usize) < self.meshes.len() && flags <= 1 => {
                    depth = depth.checked_add(1).ok_or_else(internal)?;
                }
                3 if mesh == 0 && flags == 0 => {
                    depth = depth.checked_sub(1).ok_or_else(internal)?;
                }
                _ => return Err(internal()),
            }
            if depth > 8 || actual_depth != depth {
                return Err(internal());
            }
        }
        if depth != 0 {
            return Err(internal());
        }
        Ok(())
    }
}

fn texture_slot(
    root: &Value,
    foundation: &EvaluationLoweringFoundationV1,
    mesh_id: &str,
) -> Result<u32, EvaluationLoweringError> {
    let mut matched = None;
    for atlas in root
        .get("atlases")
        .and_then(Value::as_array)
        .ok_or_else(internal)?
    {
        let atlas = atlas.as_object().ok_or_else(internal)?;
        let atlas_id = string(atlas, "id")?;
        for entry in atlas
            .get("entries")
            .and_then(Value::as_array)
            .ok_or_else(internal)?
        {
            if entry
                .get("layerId")
                .and_then(Value::as_str)
                .ok_or_else(internal)?
                != mesh_id
            {
                continue;
            }
            if matched.is_some() {
                return Err(internal());
            }
            let mut slot = None;
            for (index, binding) in foundation.texture_plan.textures.iter().enumerate() {
                if binding.id.strip_prefix("atlas:") == Some(atlas_id) {
                    if slot.is_some()
                        || atlas.get("width").and_then(Value::as_f64)
                            != Some(f64::from(binding.width))
                        || atlas.get("height").and_then(Value::as_f64)
                            != Some(f64::from(binding.height))
                    {
                        return Err(internal());
                    }
                    slot = Some(u32::try_from(index).map_err(|_| internal())?);
                }
            }
            matched = Some(slot.ok_or_else(internal)?);
        }
    }
    matched.ok_or_else(internal)
}

pub(crate) fn range(
    value: RangeV1,
    length: usize,
) -> Result<std::ops::Range<usize>, EvaluationLoweringError> {
    let start = usize::try_from(value.start).map_err(|_| internal())?;
    let end = start
        .checked_add(usize::try_from(value.len).map_err(|_| internal())?)
        .ok_or_else(internal)?;
    if end > length {
        return Err(internal());
    }
    Ok(start..end)
}
pub(crate) fn slice<T>(values: &[T], value: RangeV1) -> Result<&[T], EvaluationLoweringError> {
    Ok(&values[range(value, values.len())?])
}
fn push<T>(values: &mut Vec<T>, value: T, count: u32) -> Result<(), EvaluationLoweringError> {
    if values.len() >= count as usize || values.len() >= values.capacity() {
        return Err(internal());
    }
    values.push(value);
    Ok(())
}
fn string<'a>(
    value: &'a Map<String, Value>,
    key: &str,
) -> Result<&'a str, EvaluationLoweringError> {
    value.get(key).and_then(Value::as_str).ok_or_else(internal)
}
pub(crate) fn internal() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::Internal)
}

const _: () = {
    assert!(size_of::<MeshTopologyV1>() == 36);
    assert!(align_of::<MeshTopologyV1>() == 4);
    assert!(offset_of!(MeshTopologyV1, id) == 0);
    assert!(offset_of!(MeshTopologyV1, mesh_slot) == 8);
    assert!(offset_of!(MeshTopologyV1, texture_slot) == 12);
    assert!(offset_of!(MeshTopologyV1, draw_order) == 16);
    assert!(offset_of!(MeshTopologyV1, masks) == 20);
    assert!(offset_of!(MeshTopologyV1, visible) == 28);
    assert!(offset_of!(MeshTopologyV1, mask_source) == 32);
    assert!(size_of::<MaskEdgeV1>() == 8);
    assert!(align_of::<MaskEdgeV1>() == 4);
    assert!(offset_of!(MaskEdgeV1, source_slot) == 0);
    assert!(offset_of!(MaskEdgeV1, invert) == 4);
    assert!(size_of::<DrawCommandV1>() == 24);
    assert!(align_of::<DrawCommandV1>() == 4);
    assert!(offset_of!(DrawCommandV1, words) == 0);
};
