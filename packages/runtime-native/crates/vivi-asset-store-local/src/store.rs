use std::path::{Path, PathBuf};

use rusqlite::{
    Connection, ErrorCode, OpenFlags, OptionalExtension as _, TransactionBehavior, params,
};
use sha2::{Digest as _, Sha256};
use vivi_asset_resolver::{
    AssetReadStore, AssetRef, Descriptor, Digest, EmbeddedBlobStore, ObjectRead, ObjectSnapshot,
    ObjectState, OperationError, ParsedManifest, PrincipalId, StorageKind, parse_chunk_manifest,
};

use crate::error::{
    LocalStoreError, immutable_conflict, integrity, invalid_input, principal_mismatch, unavailable,
};
use crate::filesystem::{
    FileIdentity, prepare_database_path, reject_wal_sidecars, validate_hot_journal,
    validate_preopen_state, validate_rollback_header, verify_database_path,
};
use crate::principal::principal_key;
use crate::schema::{configure_connection, initialize_or_validate};

const BLOB_MAX_BYTES: usize = 16_777_216;
const CHUNK_MAX_BYTES: usize = 8_388_608;
const LOGICAL_MAX_BYTES: u64 = 68_719_476_736;

/// One principal-bound, immutable local content-addressed store.
pub struct LocalImmutableAssetStore {
    pub(crate) connection: Connection,
    pub(crate) principal_key: [u8; 32],
    path: PathBuf,
    identity: FileIdentity,
}

impl LocalImmutableAssetStore {
    /// Opens or creates a store at an absolute path beneath a trusted private
    /// directory. The opaque principal is retained only as a domain-separated
    /// digest; its raw bytes are never persisted.
    pub fn open(
        trusted_db_path: impl AsRef<Path>,
        principal: PrincipalId,
    ) -> Result<Self, LocalStoreError> {
        let principal_key = principal_key(&principal)?;
        let (path, identity) = prepare_database_path(trusted_db_path.as_ref())?;
        validate_preopen_state(&path, identity)?;
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_PRIVATE_CACHE
            | OpenFlags::SQLITE_OPEN_NOFOLLOW
            | OpenFlags::SQLITE_OPEN_EXRESCODE;
        let mut connection = Connection::open_with_flags(&path, flags).map_err(map_sql_error)?;
        verify_database_path(&path, identity)?;
        configure_connection(&connection)?;
        initialize_or_validate(&mut connection, &principal_key)?;
        validate_rollback_header(&path, false)?;
        verify_database_path(&path, identity)?;
        Ok(Self {
            connection,
            principal_key,
            path,
            identity,
        })
    }

    /// Inserts a raw-hashed physical chunk. The final chunk may be shorter,
    /// but no chunk may be empty or exceed 8 MiB.
    pub fn put_verified_chunk_if_absent(
        &mut self,
        principal: &PrincipalId,
        address: Digest,
        bytes: &[u8],
    ) -> Result<(), LocalStoreError> {
        self.require_principal(principal)?;
        self.verify_boundary()?;
        if bytes.is_empty() || bytes.len() > CHUNK_MAX_BYTES || sha256(bytes) != address {
            return Err(invalid_input());
        }
        self.insert_exact_object(address, bytes)?;
        self.verify_boundary()
    }

    /// Parses the frozen manifest grammar and stores the received bytes under
    /// the address of their received-value JCS representation.
    pub fn put_chunk_manifest_if_absent(
        &mut self,
        principal: &PrincipalId,
        raw: &[u8],
    ) -> Result<ParsedManifest, OperationError<LocalStoreError>> {
        self.require_principal(principal)
            .map_err(OperationError::StoreUnavailable)?;
        self.verify_boundary()
            .map_err(OperationError::StoreUnavailable)?;
        let parsed = parse_chunk_manifest(raw).map_err(OperationError::Asset)?;
        self.insert_exact_object(parsed.object_address, raw)
            .map_err(OperationError::StoreUnavailable)?;
        self.verify_boundary()
            .map_err(OperationError::StoreUnavailable)?;
        Ok(parsed)
    }

    fn principal_matches(&self, principal: &PrincipalId) -> bool {
        principal_key(principal)
            .map(|candidate| candidate == self.principal_key)
            .unwrap_or(false)
    }

    fn require_principal(&self, principal: &PrincipalId) -> Result<(), LocalStoreError> {
        if self.principal_matches(principal) {
            Ok(())
        } else {
            Err(principal_mismatch())
        }
    }

    fn verify_boundary(&self) -> Result<(), LocalStoreError> {
        verify_database_path(&self.path, self.identity)?;
        reject_wal_sidecars(&self.path)?;
        if !validate_hot_journal(&self.path)? {
            validate_rollback_header(&self.path, false)?;
        }
        verify_database_path(&self.path, self.identity)
    }

    fn insert_exact_object(
        &mut self,
        address: Digest,
        bytes: &[u8],
    ) -> Result<(), LocalStoreError> {
        if bytes.len() > BLOB_MAX_BYTES {
            return Err(invalid_input());
        }
        let byte_size = i64::try_from(bytes.len()).map_err(|_| invalid_input())?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_write_error)?;
        let inserted = transaction
            .execute(
                "INSERT INTO objects (principal_key, address, byte_size, bytes) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (principal_key, address) DO NOTHING",
                params![
                    self.principal_key.as_slice(),
                    address.as_bytes().as_slice(),
                    byte_size,
                    bytes
                ],
            )
            .map_err(map_write_error)?;
        if inserted == 0 {
            let winner = transaction
                .query_row(
                    "SELECT byte_size, bytes FROM objects WHERE principal_key = ?1 AND address = ?2",
                    params![self.principal_key.as_slice(), address.as_bytes().as_slice()],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?)),
                )
                .optional()
                .map_err(map_write_error)?
                .ok_or_else(immutable_conflict)?;
            if winner.0 != byte_size || winner.1.as_slice() != bytes {
                return Err(immutable_conflict());
            }
        }
        transaction.commit().map_err(map_write_error)
    }

    fn validate_descriptor_object(
        transaction: &rusqlite::Transaction<'_>,
        principal_key: &[u8; 32],
        reference: &AssetRef,
    ) -> Result<(), LocalStoreError> {
        let physical = transaction
            .query_row(
                "SELECT byte_size, bytes FROM objects WHERE principal_key = ?1 AND address = ?2",
                params![
                    principal_key.as_slice(),
                    reference.object_address.as_bytes().as_slice()
                ],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?)),
            )
            .optional()
            .map_err(map_write_error)?
            .ok_or_else(invalid_input)?;
        if physical.0 < 0 || usize::try_from(physical.0).ok() != Some(physical.1.len()) {
            return Err(integrity());
        }
        match reference.storage_kind {
            StorageKind::Blob => {
                if reference.size_bytes > BLOB_MAX_BYTES as u64
                    || reference.object_address != reference.content_sha256
                    || reference.size_bytes != physical.1.len() as u64
                    || sha256(&physical.1) != reference.object_address
                {
                    return Err(invalid_input());
                }
            }
            StorageKind::ChunkManifest => {
                if reference.size_bytes <= BLOB_MAX_BYTES as u64
                    || reference.size_bytes > LOGICAL_MAX_BYTES
                {
                    return Err(invalid_input());
                }
                let parsed = parse_chunk_manifest(&physical.1).map_err(|_| invalid_input())?;
                if parsed.object_address != reference.object_address
                    || parsed.content_sha256 != reference.content_sha256
                    || parsed.media_type != reference.media_type
                    || parsed.size_bytes != reference.size_bytes
                {
                    return Err(invalid_input());
                }
            }
        }
        Ok(())
    }
}

impl AssetReadStore for LocalImmutableAssetStore {
    type Error = LocalStoreError;

    fn descriptor(
        &self,
        principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        if !self.principal_matches(principal) {
            return Ok(None);
        }
        self.verify_boundary()?;
        if !valid_reference_shape(expected) {
            return Ok(None);
        }
        let Some(size_bytes) = i64::try_from(expected.size_bytes).ok() else {
            return Ok(None);
        };
        let found: Option<i64> = self
            .connection
            .query_row(
                "SELECT 1 FROM descriptors AS d INNER JOIN objects AS o ON o.principal_key = d.principal_key AND o.address = d.object_address WHERE d.principal_key = ?1 AND d.storage_kind = ?2 AND d.object_address = ?3 AND d.content_sha256 = ?4 AND d.media_type = ?5 AND d.size_bytes = ?6",
                params![
                    self.principal_key.as_slice(),
                    storage_kind(expected.storage_kind),
                    expected.object_address.as_bytes().as_slice(),
                    expected.content_sha256.as_bytes().as_slice(),
                    expected.media_type,
                    size_bytes
                ],
                |row| row.get(0),
            )
            .optional()
            .map_err(map_sql_error)?;
        self.verify_boundary()?;
        Ok(found.map(|_| Descriptor::from_reference(expected)))
    }

    fn object(
        &self,
        principal: &PrincipalId,
        object_address: Digest,
        max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        if !self.principal_matches(principal) {
            return Ok(ObjectRead::Missing);
        }
        self.verify_boundary()?;
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(map_sql_error)?;
        let metadata = transaction
            .query_row(
                "SELECT byte_size, length(bytes) FROM objects WHERE principal_key = ?1 AND address = ?2",
                params![self.principal_key.as_slice(), object_address.as_bytes().as_slice()],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(map_sql_error)?;
        let Some((declared, actual)) = metadata else {
            transaction.commit().map_err(map_sql_error)?;
            self.verify_boundary()?;
            return Ok(ObjectRead::Missing);
        };
        if declared < 0 || actual < 0 || declared != actual || declared > BLOB_MAX_BYTES as i64 {
            return Err(integrity());
        }
        if declared as u64 > max_bytes {
            transaction.commit().map_err(map_sql_error)?;
            self.verify_boundary()?;
            return Ok(ObjectRead::TooLarge);
        }
        let bytes: Vec<u8> = transaction
            .query_row(
                "SELECT bytes FROM objects WHERE principal_key = ?1 AND address = ?2",
                params![
                    self.principal_key.as_slice(),
                    object_address.as_bytes().as_slice()
                ],
                |row| row.get(0),
            )
            .map_err(map_sql_error)?;
        if bytes.len() != declared as usize {
            return Err(integrity());
        }
        if !physical_address_matches(object_address, &bytes) {
            return Err(integrity());
        }
        transaction.commit().map_err(map_sql_error)?;
        self.verify_boundary()?;
        Ok(ObjectRead::Snapshot(ObjectSnapshot {
            address: object_address,
            storage_generation: 0,
            state: ObjectState::Active,
            bytes,
        }))
    }
}

impl EmbeddedBlobStore for LocalImmutableAssetStore {
    type Error = LocalStoreError;

    fn put_verified_blob_if_absent(
        &mut self,
        principal: &PrincipalId,
        address: Digest,
        bytes: &[u8],
    ) -> Result<(), Self::Error> {
        self.require_principal(principal)?;
        self.verify_boundary()?;
        if bytes.len() > BLOB_MAX_BYTES || sha256(bytes) != address {
            return Err(invalid_input());
        }
        self.insert_exact_object(address, bytes)?;
        self.verify_boundary()
    }

    fn put_descriptor_if_absent(
        &mut self,
        principal: &PrincipalId,
        reference: &AssetRef,
        descriptor: &Descriptor,
    ) -> Result<(), Self::Error> {
        self.require_principal(principal)?;
        self.verify_boundary()?;
        if descriptor != &Descriptor::from_reference(reference) || !valid_reference_shape(reference)
        {
            return Err(invalid_input());
        }
        let size_bytes = i64::try_from(reference.size_bytes).map_err(|_| invalid_input())?;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_write_error)?;
        Self::validate_descriptor_object(&transaction, &self.principal_key, reference)?;
        let inserted = transaction
            .execute(
                "INSERT INTO descriptors (principal_key, storage_kind, object_address, content_sha256, media_type, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (principal_key, storage_kind, object_address, content_sha256, media_type, size_bytes) DO NOTHING",
                params![
                    self.principal_key.as_slice(),
                    storage_kind(reference.storage_kind),
                    reference.object_address.as_bytes().as_slice(),
                    reference.content_sha256.as_bytes().as_slice(),
                    reference.media_type,
                    size_bytes
                ],
            )
            .map_err(map_write_error)?;
        if inserted == 0 {
            let winner: Option<i64> = transaction
                .query_row(
                    "SELECT 1 FROM descriptors WHERE principal_key = ?1 AND storage_kind = ?2 AND object_address = ?3 AND content_sha256 = ?4 AND media_type = ?5 AND size_bytes = ?6",
                    params![
                        self.principal_key.as_slice(),
                        storage_kind(reference.storage_kind),
                        reference.object_address.as_bytes().as_slice(),
                        reference.content_sha256.as_bytes().as_slice(),
                        reference.media_type,
                        size_bytes
                    ],
                    |row| row.get(0),
                )
                .optional()
                .map_err(map_write_error)?;
            if winner.is_none() {
                return Err(immutable_conflict());
            }
        }
        transaction.commit().map_err(map_write_error)?;
        self.verify_boundary()
    }
}

fn storage_kind(kind: StorageKind) -> i64 {
    match kind {
        StorageKind::Blob => 0,
        StorageKind::ChunkManifest => 1,
    }
}

fn valid_media_type(media_type: &str) -> bool {
    !media_type.is_empty()
        && media_type.len() <= 255
        && !media_type.bytes().any(|byte| byte <= 0x1f || byte == 0x7f)
}

fn valid_reference_shape(reference: &AssetRef) -> bool {
    if !valid_media_type(&reference.media_type) || reference.size_bytes > LOGICAL_MAX_BYTES {
        return false;
    }
    match reference.storage_kind {
        StorageKind::Blob => {
            reference.size_bytes <= BLOB_MAX_BYTES as u64
                && reference.object_address == reference.content_sha256
        }
        StorageKind::ChunkManifest => {
            reference.size_bytes > BLOB_MAX_BYTES as u64
                && reference.size_bytes <= LOGICAL_MAX_BYTES
        }
    }
}

fn sha256(bytes: &[u8]) -> Digest {
    let hash = Sha256::digest(bytes);
    let mut result = [0_u8; Digest::LENGTH];
    result.copy_from_slice(&hash);
    Digest::from_bytes(result)
}

fn physical_address_matches(address: Digest, bytes: &[u8]) -> bool {
    sha256(bytes) == address
        || parse_chunk_manifest(bytes)
            .map(|manifest| manifest.object_address == address)
            .unwrap_or(false)
}

fn map_write_error(error: rusqlite::Error) -> LocalStoreError {
    map_sql_error(error)
}

pub(crate) fn map_sql_error(error: rusqlite::Error) -> LocalStoreError {
    match error.sqlite_error_code() {
        Some(
            ErrorCode::DatabaseCorrupt
            | ErrorCode::SchemaChanged
            | ErrorCode::TooBig
            | ErrorCode::ConstraintViolation
            | ErrorCode::TypeMismatch
            | ErrorCode::NotADatabase,
        ) => integrity(),
        Some(
            ErrorCode::PermissionDenied
            | ErrorCode::OperationAborted
            | ErrorCode::DatabaseBusy
            | ErrorCode::DatabaseLocked
            | ErrorCode::OutOfMemory
            | ErrorCode::ReadOnly
            | ErrorCode::OperationInterrupted
            | ErrorCode::SystemIoFailure
            | ErrorCode::DiskFull
            | ErrorCode::CannotOpen
            | ErrorCode::FileLockingProtocolFailed
            | ErrorCode::NoLargeFileSupport
            | ErrorCode::AuthorizationForStatementDenied,
        )
        | None => unavailable(),
        Some(_) => unavailable(),
    }
}
