//! Bounded test observation of the adopted numeric checkpoints.
//!
//! Checkpoint/domain matching belongs to the frozen fixture/DAG checks, not a
//! runtime string registry. Production observation remains silent and zero-sized.

/// A numeric opcode together with its ordered raw binary64 operands.
#[derive(Clone, Copy)]
#[cfg_attr(test, derive(Debug, Eq, PartialEq))]
#[cfg_attr(
    not(test),
    allow(dead_code, reason = "Only the test observer reads operand payloads")
)]
pub(crate) enum Operation {
    Add(u64, u64),
    Sub(u64, u64),
    Mul(u64, u64),
    Div(u64, u64),
    CFmod(u64, u64),
    Sin(u64),
    Cos(u64),
    Sqrt(u64),
    /// Operands are y, then x, as written by the normative atan2 node.
    Atan2(u64, u64),
    Acos(u64),
}

/// The 22 owner-domain shapes in the frozen 160-checkpoint catalog.
///
/// Index order is normative. Fixed arrays encode the exact arity (at most
/// four); raw u64 indices retain the same value width on native and WASM.
#[derive(Clone, Copy)]
#[cfg_attr(test, derive(Debug, Eq, PartialEq))]
#[cfg_attr(
    not(test),
    allow(dead_code, reason = "Only the test observer reads owner payloads")
)]
pub(crate) enum OwnerTuple {
    /// bindingIndex, pointIndex
    BindingPoint([u64; 2]),
    /// bindingIndex, targetSlot
    BindingTarget([u64; 2]),
    /// targetSlot
    Target(u64),
    /// groupIndex, inputIndex
    PhysicsInput([u64; 2]),
    /// groupIndex, inputIndex, axis
    PhysicsInputAxis([u64; 3]),
    /// groupIndex
    PhysicsGroup(u64),
    /// groupIndex, substepIndex
    PhysicsSubstep([u64; 2]),
    /// groupIndex, substepIndex, pendulumIndex
    PhysicsPendulum([u64; 3]),
    /// groupIndex, outputIndex
    PhysicsOutput([u64; 2]),
    /// groupIndex, destinationSlot
    PhysicsDestination([u64; 2]),
    /// worldPass, boneDfsIndex
    WorldBone([u64; 2]),
    /// worldPass, boneDfsIndex, cell
    WorldCell([u64; 3]),
    /// controllerIndex, chainIndex
    ControllerChain([u64; 2]),
    /// controllerIndex, iterationIndex, sweepIndex
    ControllerSweep([u64; 3]),
    /// controllerIndex
    Controller(u64),
    /// controllerIndex, iterationIndex, sweepIndex, endOrdinal
    ControllerEnd([u64; 4]),
    /// controllerIndex, iterationIndex, sweepIndex, chainIndex
    ControllerPosition([u64; 4]),
    /// controllerIndex, iterationIndex
    ControllerIteration([u64; 2]),
    /// meshSlot, vertexIndex, weightIndex, cell
    SkinCell([u64; 4]),
    /// meshSlot, vertexIndex, weightIndex
    SkinWeight([u64; 3]),
    /// meshSlot, vertexIndex
    MeshVertex([u64; 2]),
    /// meshSlot, edgeIndex
    MeshEdge([u64; 2]),
}

/// One reached arithmetic node, including a nonfinite result before rejection.
#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct TraceRecord {
    pub(crate) checkpoint: &'static str,
    pub(crate) operation: Operation,
    pub(crate) result: u64,
    pub(crate) owners: OwnerTuple,
}

#[cfg(test)]
impl TraceRecord {
    /// Unused buffer storage, never a numerical expectation or recorded row.
    #[allow(
        dead_code,
        reason = "Used by the separate same-source C10 conformance harness"
    )]
    pub(crate) const EMPTY: Self = Self {
        checkpoint: "",
        operation: Operation::Add(0, 0),
        result: 0,
        owners: OwnerTuple::Target(0),
    };
}

/// One actual final projection attempt, including the first rejected result.
/// The unsuccessful classifier does not return a rounded binary32 value.
#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ProjectionRecord {
    pub(crate) mesh_slot: u32,
    pub(crate) vertex_index: usize,
    pub(crate) axis: usize,
    pub(crate) source: u64,
    pub(crate) result: Result<u32, crate::EvaluationLoweringErrorKind>,
    pub(crate) after_arithmetic_count: usize,
}

#[cfg(test)]
impl ProjectionRecord {
    #[allow(
        dead_code,
        reason = "Used by the separate same-source C10 conformance harness"
    )]
    pub(crate) const EMPTY: Self = Self {
        mesh_slot: 0,
        vertex_index: 0,
        axis: 0,
        source: 0,
        result: Ok(0),
        after_arithmetic_count: 0,
    };
}

/// A zero-sized production no-op; only tests can hold a trace buffer.
pub(crate) struct Observer<'a> {
    #[cfg(test)]
    records: Option<&'a mut [TraceRecord]>,
    #[cfg(test)]
    used: usize,
    #[cfg(test)]
    projections: Option<&'a mut [ProjectionRecord]>,
    #[cfg(test)]
    projections_used: usize,
    #[cfg(test)]
    controller: Option<crate::model::InlineIkControllerV1>,
    #[cfg(not(test))]
    lifetime: core::marker::PhantomData<&'a ()>,
}

impl<'a> Observer<'a> {
    #[inline(always)]
    pub(crate) const fn silent() -> Self {
        Self {
            #[cfg(test)]
            records: None,
            #[cfg(test)]
            used: 0,
            #[cfg(test)]
            projections: None,
            #[cfg(test)]
            projections_used: 0,
            #[cfg(test)]
            controller: None,
            #[cfg(not(test))]
            lifetime: core::marker::PhantomData,
        }
    }

    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) fn recording(records: &'a mut [TraceRecord]) -> Self {
        Self {
            records: Some(records),
            used: 0,
            projections: None,
            projections_used: 0,
            controller: None,
        }
    }

    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) fn recording_with_projections(
        records: &'a mut [TraceRecord],
        projections: &'a mut [ProjectionRecord],
    ) -> Self {
        Self {
            records: Some(records),
            used: 0,
            projections: Some(projections),
            projections_used: 0,
            controller: None,
        }
    }

    /// Observe the one existing conversion before its Result is propagated.
    /// This never recomputes a projection or exposes unused buffer slots.
    #[cfg(test)]
    pub(crate) fn record_projection(&mut self, mut record: ProjectionRecord) {
        if let Some(records) = self.projections.as_deref_mut() {
            record.after_arithmetic_count = self.used;
            *records
                .get_mut(self.projections_used)
                .expect("C10 test projection capacity exhausted") = record;
            self.projections_used += 1;
        }
    }

    #[cfg(test)]
    pub(crate) fn record_controller(&mut self, controller: crate::model::InlineIkControllerV1) {
        // One fixed inline snapshot, never a callback or allocation.
        self.controller = Some(controller);
    }

    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) fn controller(&self) -> Option<crate::model::InlineIkControllerV1> {
        self.controller
    }

    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) fn projections(&self) -> &[ProjectionRecord] {
        match self.projections.as_deref() {
            Some(records) => &records[..self.projections_used],
            None => &[],
        }
    }

    /// Record immediately after the numeric node, before its finite check.
    ///
    /// Capacity exhaustion is a fixed-message test panic, not dropped evidence
    /// or an evaluator status. Production has no buffer, counter, or branch.
    #[inline(always)]
    pub(crate) fn record(
        &mut self,
        checkpoint: &'static str,
        operation: Operation,
        result: u64,
        owners: OwnerTuple,
    ) {
        #[cfg(test)]
        if let Some(records) = self.records.as_deref_mut() {
            let slot = records
                .get_mut(self.used)
                .expect("C10 test trace capacity exhausted");
            *slot = TraceRecord {
                checkpoint,
                operation,
                result,
                owners,
            };
            self.used += 1;
        }
        #[cfg(not(test))]
        let _ = (checkpoint, operation, result, owners);
    }

    /// Only written rows are visible; unused caller storage is not evidence.
    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) fn records(&self) -> &[TraceRecord] {
        match self.records.as_deref() {
            Some(records) => &records[..self.used],
            None => &[],
        }
    }
}
