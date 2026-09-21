//! Ephemeral, untrusted physical inputs; no filesystem or durable receipt.

use crate::{EvaluationTexturePlanV1, LocalAssetHostError, PrepareActivationTextureSetV1};
use std::cell::Cell;
use vivi_asset_resolver::{
    AssetError, AssetErrorCode, AssetReadStore, AssetRef, Descriptor, Digest, ObjectRead,
    ObjectSnapshot, ObjectState, PrincipalId,
};

const MAX_OBJECTS: usize = 288;
const MAX_BYTES: usize = 67_108_864;

/// One captured untrusted object, not an integrity or storage attestation.
pub struct EvaluationPhysicalObjectV1 {
    /// Exact supplied address; the resolver verifies it against the bytes.
    pub object_address: Digest,
    /// Call-owned immutable bytes, including raw manifests when applicable.
    pub bytes: Vec<u8>,
}

/// Resolves a finite owned physical batch through the existing full assembler.
///
/// Revision one denotes this call's immutable bytes only. No store, principal
/// authority, durable receipt or freshness claim is created. Normal resolver
/// errors precede the final unused-input check; Missing carries no partial PNGs.
pub fn prepare_activation_texture_set_from_bytes(
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
    objects: Vec<EvaluationPhysicalObjectV1>,
) -> Result<PrepareActivationTextureSetV1, LocalAssetHostError> {
    if objects.len() > MAX_OBJECTS {
        return Err(LocalAssetHostError::resource_limit_exceeded());
    }
    let mut total = 0usize;
    for (index, object) in objects.iter().enumerate() {
        total = total
            .checked_add(object.bytes.len())
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if total > MAX_BYTES {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }
        if objects[..index]
            .iter()
            .any(|prior| prior.object_address == object.object_address)
        {
            return Err(input_set_error());
        }
    }
    // A single fixed internal namespace, not an authenticated caller principal.
    let principal = PrincipalId::new(Vec::new());
    let store = PhysicalInputs {
        plan,
        objects,
        used: Cell::new([0; 5]),
        principal: &principal,
    };
    let outcome = crate::activation::prepare_activation_texture_set_from_store(
        &store,
        &principal,
        request_generation,
        plan,
        &|error| error,
    )?;
    let used = store.used.get();
    if (0..store.objects.len()).any(|index| used[index / 64] & (1u64 << (index % 64)) == 0) {
        return Err(input_set_error());
    }
    Ok(outcome)
}

fn input_set_error() -> LocalAssetHostError {
    LocalAssetHostError::from_asset(AssetError::new(
        AssetErrorCode::RefSetMismatch,
        "evaluation physical input set rejected",
    ))
}

struct PhysicalInputs<'a> {
    plan: &'a EvaluationTexturePlanV1,
    objects: Vec<EvaluationPhysicalObjectV1>,
    used: Cell<[u64; 5]>,
    principal: &'a PrincipalId,
}

impl AssetReadStore for PhysicalInputs<'_> {
    type Error = LocalAssetHostError;

    fn descriptor(
        &self,
        principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        if principal != self.principal
            || !self
                .plan
                .textures
                .iter()
                .any(|binding| binding.asset == *expected)
        {
            return Ok(None);
        }
        let mut media_type = String::new();
        media_type
            .try_reserve_exact(expected.media_type.len())
            .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;
        media_type.push_str(&expected.media_type);
        Ok(Some(Descriptor {
            storage_kind: expected.storage_kind,
            content_sha256: expected.content_sha256,
            media_type,
            size_bytes: expected.size_bytes,
        }))
    }

    fn object(
        &self,
        principal: &PrincipalId,
        address: Digest,
        max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        if principal != self.principal {
            return Ok(ObjectRead::Missing);
        }
        let Some((index, object)) = self
            .objects
            .iter()
            .enumerate()
            .find(|(_, item)| item.object_address == address)
        else {
            return Ok(ObjectRead::Missing);
        };
        if object.bytes.len() as u64 > max_bytes {
            return Ok(ObjectRead::TooLarge);
        }
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(object.bytes.len())
            .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;
        bytes.extend_from_slice(&object.bytes);
        let mut used = self.used.get();
        used[index / 64] |= 1u64 << (index % 64);
        self.used.set(used);
        Ok(ObjectRead::Snapshot(ObjectSnapshot {
            address,
            storage_generation: 1,
            state: ObjectState::Active,
            bytes,
        }))
    }
}

#[cfg(test)]
mod tests;
