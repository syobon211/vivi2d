use crate::{AssetRef, Descriptor, Digest, ObjectRead, PrincipalId};

/// Principal-scoped read boundary. Both methods return owned snapshots so a
/// storage generation cannot change underneath verification.
pub trait AssetReadStore {
    type Error;

    fn descriptor(
        &self,
        principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error>;

    fn object(
        &self,
        principal: &PrincipalId,
        object_address: Digest,
        max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error>;
}

/// Minimal write seam for embedded blobs. Durable stores own deduplication and
/// transactional policy. A descriptor failure may leave an unreferenced blob;
/// normal owner-ref GC is allowed to collect it.
pub trait EmbeddedBlobStore {
    type Error;

    fn put_verified_blob_if_absent(
        &mut self,
        principal: &PrincipalId,
        address: Digest,
        bytes: &[u8],
    ) -> Result<(), Self::Error>;

    fn put_descriptor_if_absent(
        &mut self,
        principal: &PrincipalId,
        reference: &AssetRef,
        descriptor: &Descriptor,
    ) -> Result<(), Self::Error>;
}
