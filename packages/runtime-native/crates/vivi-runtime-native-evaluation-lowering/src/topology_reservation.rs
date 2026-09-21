//! Five C11 storage sites, checked and reserved before any retained C9 fill.

use std::alloc::Layout;

use serde_json::{Map, Value};

use crate::reservation::{Category9SiteCountsV1, ReservationSiteV1, ReservationStateV1};
use crate::topology::{DrawCommandV1, MaskEdgeV1, MeshTopologyV1, TopologyV1};
use crate::{EvaluationLoweringError, EvaluationLoweringErrorKind};

pub(crate) const SITE_IDS: [&str; 5] = [
    "topology.id-bytes",
    "topology.mesh-records",
    "topology.mask-edges",
    "topology.draw-order",
    "topology.draw-commands",
];
const ELEMENT_BYTES: [u64; 5] = [1, 36, 8, 4, 24];

pub(crate) struct TopologyCountsV1 {
    pub(crate) counts: [u32; 5],
    usize_counts: [usize; 5],
    #[cfg(test)]
    pub(crate) combined_bytes: u64,
}

impl TopologyCountsV1 {
    pub(crate) fn census(
        value: &Value,
        c9: &Category9SiteCountsV1,
    ) -> Result<Self, EvaluationLoweringError> {
        let layers = value
            .get("layers")
            .and_then(Value::as_array)
            .ok_or_else(internal)?;
        let mut ids = 0_u32;
        let mut edges = 0_u32;
        crate::lower::visit_layers(layers, true, &mut |layer, _| {
            if layer.get("kind").and_then(Value::as_str) == Some("viviMesh") {
                let (id_bytes, edge_count) = leaf_counts(layer)?;
                ids = ids.checked_add(id_bytes).ok_or_else(resource)?;
                edges = edges.checked_add(edge_count).ok_or_else(resource)?;
            }
            Ok(())
        })?;
        Self::checked(
            ids,
            c9.count(ReservationSiteV1::DirectMeshRecords),
            edges,
            c9.total_logical_bytes(),
        )
    }

    pub(crate) fn checked(
        ids: u32,
        meshes: u32,
        edges: u32,
        c9_bytes: u64,
    ) -> Result<Self, EvaluationLoweringError> {
        let commands = meshes.checked_mul(17).ok_or_else(resource)?;
        let counts = [ids, meshes, edges, meshes, commands];
        let mut products = [0_u64; 5];
        for index in 0..5 {
            products[index] = u64::from(counts[index])
                .checked_mul(ELEMENT_BYTES[index])
                .ok_or_else(resource)?;
        }
        let mut total = c9_bytes;
        for product in products {
            total = total.checked_add(product).ok_or_else(resource)?;
        }
        if total > 0x7fff_ffff {
            return Err(resource());
        }
        let mut usize_counts = [0; 5];
        for index in 0..5 {
            let n = usize::try_from(counts[index]).map_err(|_| resource())?;
            let layout = match index {
                0 => Layout::array::<u8>(n),
                1 => Layout::array::<MeshTopologyV1>(n),
                2 => Layout::array::<MaskEdgeV1>(n),
                3 => Layout::array::<u32>(n),
                _ => Layout::array::<DrawCommandV1>(n),
            }
            .map_err(|_| resource())?;
            if u64::try_from(layout.size()).map_err(|_| resource())? != products[index]
                || layout.size() > isize::MAX as usize
            {
                return Err(resource());
            }
            usize_counts[index] = n;
        }
        Ok(Self {
            counts,
            usize_counts,
            #[cfg(test)]
            combined_bytes: total,
        })
    }

    pub(crate) fn reserve(
        &self,
        state: &mut ReservationStateV1,
    ) -> Result<TopologyV1, EvaluationLoweringError> {
        let mut topology = TopologyV1::empty(self.counts);
        reserve(&mut topology.id_bytes, 0, self, state)?;
        reserve(&mut topology.meshes, 1, self, state)?;
        reserve(&mut topology.edges, 2, self, state)?;
        reserve(&mut topology.draw_order, 3, self, state)?;
        reserve(&mut topology.commands, 4, self, state)?;
        topology.reserved_capacities = topology.capacities();
        Ok(topology)
    }
}

// Storage-only formulas. Incumbent C8/C9 rejects malformed shared fields first;
// these deliberately do not introduce another semantic validation stage.
pub(crate) fn leaf_counts(
    layer: &Map<String, Value>,
) -> Result<(u32, u32), EvaluationLoweringError> {
    let ids = layer.get("id").and_then(Value::as_str).map_or(0, str::len);
    let a = layer
        .get("clipMaskIds")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let b = layer
        .get("clipMasks")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let edges = a.checked_add(b).ok_or_else(resource)?;
    Ok((
        u32::try_from(ids).map_err(|_| resource())?,
        u32::try_from(edges).map_err(|_| resource())?,
    ))
}

fn reserve<T>(
    values: &mut Vec<T>,
    site: usize,
    counts: &TopologyCountsV1,
    state: &mut ReservationStateV1,
) -> Result<(), EvaluationLoweringError> {
    if counts.counts[site] == 0 {
        return Ok(());
    }
    state.begin_nonzero_attempt(SITE_IDS[site], counts.counts[site])?;
    values
        .try_reserve_exact(counts.usize_counts[site])
        .map_err(|_| resource())
}

fn resource() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::ResourceLimitExceeded)
}
fn internal() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::Internal)
}
