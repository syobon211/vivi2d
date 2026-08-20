use std::fs::{self, OpenOptions};
use std::io::{Seek as _, SeekFrom, Write as _};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Barrier};
use std::thread;

use base64::Engine as _;
use rusqlite::config::DbConfig;
use rusqlite::{Connection, params};
use sha2::{Digest as _, Sha256};
use tempfile::TempDir;
use vivi_asset_resolver::{
    AssetReadStore as _, AssetRef, Descriptor, Digest, EmbeddedBlobStore as _, ObjectRead,
    ObjectState, OperationError, PrincipalId, ResolvePng, StorageKind, materialize_prepared_png,
    prepare_embedded_png, resolve_referenced_png,
};

use crate::error::LocalStoreErrorKind;
use crate::schema::{
    APPLICATION_ID, BUSY_TIMEOUT_MS, CACHE_SIZE_KIB, CREATE_DESCRIPTORS_SQL, CREATE_META_SQL,
    CREATE_OBJECTS_SQL, JOURNAL_SIZE_LIMIT, MAX_PAGE_COUNT, PAGE_SIZE, USER_VERSION,
};
use crate::{LocalImmutableAssetStore, LocalStoreError};

const PRINCIPAL: &[u8] = b"local-project-principal";
const PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQMgljAAABlQCdTUEI3wAAAABJRU5ErkJggg==";

fn principal() -> PrincipalId {
    PrincipalId::new(PRINCIPAL)
}

fn database() -> (TempDir, PathBuf) {
    let directory = tempfile::tempdir().expect("private temporary directory");
    let path = directory.path().join("assets.sqlite3");
    (directory, path)
}

fn digest(bytes: &[u8]) -> Digest {
    let hash = Sha256::digest(bytes);
    let mut value = [0_u8; Digest::LENGTH];
    value.copy_from_slice(&hash);
    Digest::from_bytes(value)
}

fn png_fixture() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(PNG_BASE64)
        .expect("frozen PNG fixture")
}

fn blob_reference(bytes: &[u8], media_type: &str) -> AssetRef {
    let hash = digest(bytes);
    AssetRef {
        object_address: hash,
        storage_kind: StorageKind::Blob,
        content_sha256: hash,
        media_type: media_type.to_owned(),
        size_bytes: bytes.len() as u64,
    }
}

fn open(path: &Path) -> LocalImmutableAssetStore {
    LocalImmutableAssetStore::open(path, principal()).expect("open local store")
}

#[test]
fn embedded_materialization_survives_restart_and_resolves() {
    let (_directory, path) = database();
    let bytes = png_fixture();
    let prepared = prepare_embedded_png(&bytes, 1, 1).expect("attested fixture");
    let reference = {
        let mut store = open(&path);
        materialize_prepared_png(&mut store, &principal(), &prepared)
            .unwrap_or_else(|error| panic!("materialize: {error}"))
    };

    let store = open(&path);
    let resolved = resolve_referenced_png(&store, &principal(), &reference, 1, 1)
        .unwrap_or_else(|error| panic!("resolve: {error}"));
    let ResolvePng::Ready(ready) = resolved else {
        panic!("persisted embedded asset must resolve");
    };
    assert_eq!(ready.logical_bytes(), bytes);
    assert_eq!(ready.source_generations(), &[(reference.object_address, 0)]);
}

#[test]
fn manifest_chunks_survive_restart_and_resolve() {
    let (_directory, path) = database();
    let png = large_valid_png();
    let content_sha256 = digest(&png);
    let chunks = png
        .chunks(8_388_608)
        .map(|bytes| (digest(bytes), bytes.to_vec()))
        .collect::<Vec<_>>();
    let chunk_json = chunks
        .iter()
        .map(|(address, bytes)| {
            format!(
                "{{\"sha256\":\"{}\",\"sizeBytes\":{}}}",
                address.to_lower_hex(),
                bytes.len()
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let manifest = format!(
        "{{\"schema\":\"vivi2d.assetChunkManifest.v1\",\"mediaType\":\"image/png\",\"contentSha256\":\"{}\",\"sizeBytes\":{},\"chunkSizeBytes\":8388608,\"chunks\":[{}]}}",
        content_sha256.to_lower_hex(),
        png.len(),
        chunk_json
    )
    .into_bytes();

    let reference = {
        let mut store = open(&path);
        for (address, bytes) in &chunks {
            store
                .put_verified_chunk_if_absent(&principal(), *address, bytes)
                .expect("verified chunk");
        }
        let parsed = store
            .put_chunk_manifest_if_absent(&principal(), &manifest)
            .unwrap_or_else(|error| panic!("manifest: {error}"));
        let reference = AssetRef {
            object_address: parsed.object_address,
            storage_kind: StorageKind::ChunkManifest,
            content_sha256,
            media_type: "image/png".to_owned(),
            size_bytes: png.len() as u64,
        };
        store
            .put_descriptor_if_absent(
                &principal(),
                &reference,
                &Descriptor::from_reference(&reference),
            )
            .expect("manifest descriptor");
        reference
    };

    let store = open(&path);
    let resolved = resolve_referenced_png(&store, &principal(), &reference, 1, 1)
        .unwrap_or_else(|error| panic!("resolve manifest: {error}"));
    let ResolvePng::Ready(ready) = resolved else {
        panic!("persisted manifest asset must resolve");
    };
    assert_eq!(ready.logical_bytes(), png);
    assert!(
        ready
            .source_generations()
            .iter()
            .all(|(_, generation)| *generation == 0)
    );
}

#[test]
fn wrong_principal_is_rejected_before_any_sql() {
    let (_directory, path) = database();
    let mut store = open(&path);
    store
        .connection
        .execute_batch("DROP TABLE descriptors; DROP TABLE objects;")
        .expect("sabotage SQL surfaces");
    let wrong = PrincipalId::new(b"wrong-principal");
    let bytes = b"payload";
    let reference = blob_reference(bytes, "application/octet-stream");

    assert_eq!(
        store
            .descriptor(&wrong, &reference)
            .expect("wrong read is local"),
        None
    );
    assert_eq!(
        store
            .object(&wrong, reference.object_address, bytes.len() as u64)
            .expect("wrong read is local"),
        ObjectRead::Missing
    );
    assert_eq!(
        store
            .put_verified_blob_if_absent(&wrong, reference.object_address, bytes)
            .expect_err("wrong write"),
        LocalStoreError::new(LocalStoreErrorKind::PrincipalMismatch)
    );
    match store.put_chunk_manifest_if_absent(&wrong, b"not JSON") {
        Err(OperationError::StoreUnavailable(error)) => {
            assert_eq!(error.kind(), LocalStoreErrorKind::PrincipalMismatch);
        }
        _ => panic!("wrong principal must win before parsing or SQL"),
    }
}

#[test]
fn physical_bounds_and_length_first_reads_are_enforced() {
    let (_directory, path) = database();
    let mut store = open(&path);
    let maximum = vec![0x5a; 16_777_216];
    let maximum_address = digest(&maximum);
    store
        .put_verified_blob_if_absent(&principal(), maximum_address, &maximum)
        .expect("exact physical maximum");
    assert_eq!(
        store
            .object(&principal(), maximum_address, 16_777_215)
            .expect("bounded metadata read"),
        ObjectRead::TooLarge
    );
    let over = vec![0x5a; 16_777_217];
    assert_eq!(
        store
            .put_verified_blob_if_absent(&principal(), digest(&over), &over)
            .expect_err("max plus one"),
        LocalStoreError::new(LocalStoreErrorKind::InvalidInput)
    );
    let ObjectRead::Snapshot(snapshot) = store
        .object(&principal(), maximum_address, 16_777_216)
        .expect("exact bounded read")
    else {
        panic!("exact maximum must be readable");
    };
    assert_eq!(snapshot.state, ObjectState::Active);
    assert_eq!(snapshot.storage_generation, 0);
    assert_eq!(snapshot.bytes.len(), 16_777_216);
}

#[test]
fn multiple_media_descriptors_share_one_physical_object() {
    let (_directory, path) = database();
    let mut store = open(&path);
    let bytes = b"same physical bytes";
    let address = digest(bytes);
    store
        .put_verified_blob_if_absent(&principal(), address, bytes)
        .expect("physical object");
    let first = blob_reference(bytes, "application/octet-stream");
    let second = blob_reference(bytes, "application/x-vivi-test");
    for reference in [&first, &second] {
        store
            .put_descriptor_if_absent(
                &principal(),
                reference,
                &Descriptor::from_reference(reference),
            )
            .expect("descriptor variant");
        assert_eq!(
            store.descriptor(&principal(), reference).expect("lookup"),
            Some(Descriptor::from_reference(reference))
        );
    }
    let object_count: i64 = store
        .connection
        .query_row("SELECT count(*) FROM objects", [], |row| row.get(0))
        .expect("object count");
    assert_eq!(object_count, 1);
}

#[test]
fn immutable_inserts_are_idempotent_and_never_overwrite() {
    let (_directory, path) = database();
    let mut store = open(&path);
    let bytes = b"immutable";
    let address = digest(bytes);
    store
        .put_verified_blob_if_absent(&principal(), address, bytes)
        .expect("first insert");
    store
        .put_verified_blob_if_absent(&principal(), address, bytes)
        .expect("idempotent insert");
    store
        .connection
        .execute(
            "UPDATE objects SET bytes = ?1 WHERE address = ?2",
            params![b"tampered!".as_slice(), address.as_bytes().as_slice()],
        )
        .expect("simulate same-size external corruption");
    assert_eq!(
        store
            .put_verified_blob_if_absent(&principal(), address, bytes)
            .expect_err("winner must be compared"),
        LocalStoreError::new(LocalStoreErrorKind::ImmutableConflict)
    );
    assert_eq!(
        store
            .object(&principal(), address, bytes.len() as u64)
            .expect_err("corrupt bytes must not escape"),
        LocalStoreError::new(LocalStoreErrorKind::IntegrityViolation)
    );
}

#[test]
fn concurrent_first_open_and_same_insert_converge() {
    let directory = tempfile::tempdir().expect("private temporary directory");
    let bytes = b"concurrent immutable object".to_vec();
    let address = digest(&bytes);
    for round in 0..16 {
        let path = directory.path().join(format!("concurrent-{round}.sqlite3"));
        let barrier = Arc::new(Barrier::new(2));
        let handles = (0..2)
            .map(|_| {
                let path = path.clone();
                let barrier = Arc::clone(&barrier);
                let bytes = bytes.clone();
                thread::spawn(move || {
                    barrier.wait();
                    let mut store = open(&path);
                    store
                        .put_verified_blob_if_absent(&principal(), address, &bytes)
                        .expect("concurrent idempotent insert");
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            handle.join().expect("worker");
        }
        let store = open(&path);
        assert!(matches!(
            store.object(&principal(), address, bytes.len() as u64),
            Ok(ObjectRead::Snapshot(_))
        ));
    }
}

#[test]
fn schema_header_pragmas_and_principal_digest_are_pinned() {
    let (_directory, path) = database();
    let store = open(&path);
    for (name, expected) in [
        ("application_id", APPLICATION_ID),
        ("user_version", USER_VERSION),
        ("page_size", PAGE_SIZE),
        ("max_page_count", MAX_PAGE_COUNT),
        ("busy_timeout", BUSY_TIMEOUT_MS),
        ("cache_size", CACHE_SIZE_KIB),
        ("journal_size_limit", JOURNAL_SIZE_LIMIT),
        ("synchronous", 3),
        ("temp_store", 2),
        ("mmap_size", 0),
        ("cell_size_check", 1),
        ("foreign_keys", 1),
        ("trusted_schema", 0),
    ] {
        let actual: i64 = store
            .connection
            .pragma_query_value(None, name, |row| row.get(0))
            .expect("pinned pragma");
        assert_eq!(actual, expected, "PRAGMA {name}");
    }
    let journal: String = store
        .connection
        .pragma_query_value(None, "journal_mode", |row| row.get(0))
        .expect("journal mode");
    assert_eq!(journal, "delete");
    assert!(
        store
            .connection
            .db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE)
            .expect("defensive")
    );
    assert!(
        !store
            .connection
            .db_config(DbConfig::SQLITE_DBCONFIG_DQS_DDL)
            .expect("DQS DDL")
    );
    assert!(
        !store
            .connection
            .db_config(DbConfig::SQLITE_DBCONFIG_DQS_DML)
            .expect("DQS DML")
    );
    let schema = store
        .connection
        .prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .expect("exact schema");
    assert_eq!(
        schema,
        vec![
            ("descriptors".to_owned(), CREATE_DESCRIPTORS_SQL.to_owned()),
            ("objects".to_owned(), CREATE_OBJECTS_SQL.to_owned()),
            ("store_meta".to_owned(), CREATE_META_SQL.to_owned()),
        ]
    );
    let stored_key: Vec<u8> = store
        .connection
        .query_row("SELECT principal_key FROM store_meta", [], |row| row.get(0))
        .expect("principal key");
    assert_eq!(stored_key.len(), 32);
    assert_ne!(stored_key, PRINCIPAL);
}

#[test]
fn descriptor_last_requires_an_exact_existing_object() {
    let (_directory, path) = database();
    let mut store = open(&path);
    let bytes = b"descriptor last";
    let reference = blob_reference(bytes, "application/octet-stream");
    let descriptor = Descriptor::from_reference(&reference);
    assert_eq!(
        store
            .put_descriptor_if_absent(&principal(), &reference, &descriptor)
            .expect_err("object first"),
        LocalStoreError::new(LocalStoreErrorKind::InvalidInput)
    );
    assert_eq!(
        store.descriptor(&principal(), &reference).expect("lookup"),
        None
    );
    store
        .put_verified_blob_if_absent(&principal(), reference.object_address, bytes)
        .expect("object");
    let mut wrong = descriptor.clone();
    wrong.media_type = "application/wrong".to_owned();
    assert_eq!(
        store
            .put_descriptor_if_absent(&principal(), &reference, &wrong)
            .expect_err("exact tuple"),
        LocalStoreError::new(LocalStoreErrorKind::InvalidInput)
    );
    assert_eq!(
        store.descriptor(&principal(), &reference).expect("lookup"),
        None
    );
}

#[test]
fn descriptor_schema_enforces_kind_and_size_boundaries() {
    let (_directory, path) = database();
    let mut store = open(&path);
    let bytes = b"descriptor constraint object";
    let address = digest(bytes);
    store
        .put_verified_blob_if_absent(&principal(), address, bytes)
        .expect("object");
    let key = store.principal_key;
    let insert = |kind: i64, content: Digest, size: i64| {
        store.connection.execute(
            "INSERT INTO descriptors (principal_key, storage_kind, object_address, content_sha256, media_type, size_bytes) VALUES (?1, ?2, ?3, ?4, 'application/test', ?5)",
            params![key.as_slice(), kind, address.as_bytes().as_slice(), content.as_bytes().as_slice(), size],
        )
    };
    assert!(insert(0, digest(b"different"), bytes.len() as i64).is_err());
    assert!(insert(0, address, 16_777_217).is_err());
    assert!(insert(1, address, 16_777_216).is_err());
    assert!(insert(1, address, 68_719_476_737).is_err());
}

#[test]
fn address_size_and_bytes_corruption_never_escape_as_snapshots() {
    let (_directory, path) = database();
    let mut store = open(&path);
    let bytes = b"integrity target";
    let original = digest(bytes);
    store
        .put_verified_blob_if_absent(&principal(), original, bytes)
        .expect("object");
    store
        .connection
        .execute_batch("PRAGMA ignore_check_constraints = ON")
        .expect("test-only corruption mode");
    store
        .connection
        .execute(
            "UPDATE objects SET byte_size = byte_size + 1 WHERE address = ?1",
            params![original.as_bytes().as_slice()],
        )
        .expect("size corruption");
    assert_integrity(store.object(&principal(), original, 1_024));
    store
        .connection
        .execute(
            "UPDATE objects SET byte_size = length(bytes) WHERE address = ?1",
            params![original.as_bytes().as_slice()],
        )
        .expect("restore size");
    let forged = digest(b"forged key");
    store
        .connection
        .execute(
            "UPDATE objects SET address = ?1 WHERE address = ?2",
            params![forged.as_bytes().as_slice(), original.as_bytes().as_slice()],
        )
        .expect("address corruption");
    assert_integrity(store.object(&principal(), forged, 1_024));
    store
        .connection
        .execute(
            "UPDATE objects SET bytes = zeroblob(length(bytes)) WHERE address = ?1",
            params![forged.as_bytes().as_slice()],
        )
        .expect("byte corruption");
    assert_integrity(store.object(&principal(), forged, 1_024));
}

#[test]
fn malformed_schema_header_wal_and_live_replacement_are_rejected() {
    let (_directory, path) = database();
    drop(open(&path));
    let raw = Connection::open(&path).expect("raw connection");
    raw.execute("CREATE TABLE unexpected (value INTEGER)", [])
        .expect("schema drift");
    drop(raw);
    assert_kind(
        LocalImmutableAssetStore::open(&path, principal()),
        LocalStoreErrorKind::IntegrityViolation,
    );

    let (_directory, wal_path) = database();
    drop(open(&wal_path));
    let raw = Connection::open(&wal_path).expect("raw WAL connection");
    let mode: String = raw
        .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))
        .expect("switch WAL");
    assert_eq!(mode, "wal");
    drop(raw);
    assert_kind(
        LocalImmutableAssetStore::open(&wal_path, principal()),
        LocalStoreErrorKind::IntegrityViolation,
    );

    let (_directory, live_path) = database();
    let store = open(&live_path);
    let alias = live_path.with_extension("hardlink");
    fs::hard_link(&live_path, &alias).expect("create hard link");
    assert_eq!(
        store
            .object(&principal(), digest(b"absent"), 16)
            .expect_err("link count drift"),
        LocalStoreError::new(LocalStoreErrorKind::PathRejected)
    );
}

#[test]
fn sqlite_prefix_lookalikes_cannot_hide_extra_schema_objects() {
    let (_directory, path) = database();
    drop(open(&path));
    let raw = Connection::open(&path).expect("raw connection");
    raw.execute_batch(
        "CREATE TABLE sqliteEvil (value INTEGER);\
         CREATE INDEX sqliteEvilIndex ON sqliteEvil(value);\
         CREATE VIEW sqliteEvilView AS SELECT value FROM sqliteEvil;\
         CREATE TRIGGER sqliteEvilTrigger AFTER INSERT ON sqliteEvil BEGIN SELECT 1; END;",
    )
    .expect("lookalike schema");
    drop(raw);
    assert_kind(
        LocalImmutableAssetStore::open(&path, principal()),
        LocalStoreErrorKind::IntegrityViolation,
    );
}

#[test]
fn sqlite_internal_statistics_cannot_bypass_exact_schema_pin() {
    let (_directory, path) = database();
    drop(open(&path));
    let raw = Connection::open(&path).expect("raw connection");
    raw.execute_batch("ANALYZE").expect("create sqlite_stat1");
    let statistics_sql: Option<String> = raw
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name = 'sqlite_stat1'",
            [],
            |row| row.get(0),
        )
        .expect("sqlite_stat1 schema");
    assert!(statistics_sql.is_some());
    drop(raw);
    assert_kind(
        LocalImmutableAssetStore::open(&path, principal()),
        LocalStoreErrorKind::IntegrityViolation,
    );
}

#[test]
fn utf16_exact_schema_is_rejected_before_store_use() {
    let (_directory, path) = database();
    let _ = super::filesystem::prepare_database_path(&path).expect("private precreated DB");
    let raw = Connection::open(&path).expect("raw UTF-16 connection");
    raw.pragma_update(None, "encoding", "UTF-16le")
        .expect("UTF-16 before schema");
    raw.execute(CREATE_META_SQL, []).expect("meta schema");
    raw.execute(CREATE_OBJECTS_SQL, []).expect("object schema");
    raw.execute(CREATE_DESCRIPTORS_SQL, [])
        .expect("descriptor schema");
    let key = super::principal::principal_key(&principal()).expect("principal key");
    raw.execute(
        "INSERT INTO store_meta (singleton, principal_key) VALUES (1, ?1)",
        params![key.as_slice()],
    )
    .expect("principal row");
    raw.pragma_update(None, "application_id", APPLICATION_ID)
        .expect("application id");
    raw.pragma_update(None, "user_version", USER_VERSION)
        .expect("user version");
    let encoding: String = raw
        .pragma_query_value(None, "encoding", |row| row.get(0))
        .expect("encoding");
    assert_eq!(encoding, "UTF-16le");
    drop(raw);

    assert_kind(
        LocalImmutableAssetStore::open(&path, principal()),
        LocalStoreErrorKind::IntegrityViolation,
    );
}

#[test]
fn genuine_hot_journal_recovers_even_with_a_damaged_main_header() {
    let (_directory, path) = database();
    drop(open(&path));
    let status = Command::new(std::env::current_exe().expect("test executable"))
        .arg("--exact")
        .arg("tests::hot_journal_crash_helper")
        .arg("--nocapture")
        .env("VIVI_ASSET_STORE_CRASH_DB", &path)
        .status()
        .expect("crash helper");
    assert!(status.success());
    let journal = PathBuf::from(format!("{}-journal", path.display()));
    assert!(fs::metadata(&journal).expect("hot journal").len() > 512);

    let mut main = OpenOptions::new().write(true).open(&path).expect("main DB");
    main.seek(SeekFrom::Start(0)).expect("header seek");
    main.write_all(&[0_u8; 16]).expect("damage main header");
    main.sync_all().expect("damage durable");
    drop(main);

    let store = open(&path);
    assert_eq!(
        store
            .connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .expect("recovered header"),
        USER_VERSION
    );
    assert!(
        !journal.exists(),
        "SQLite consumed the hot rollback journal"
    );
}

#[test]
fn hot_journal_crash_helper() {
    let Ok(path) = std::env::var("VIVI_ASSET_STORE_CRASH_DB") else {
        return;
    };
    let connection = Connection::open(path).expect("helper connection");
    connection
        .execute_batch(
            "PRAGMA journal_mode = DELETE;\
             PRAGMA synchronous = EXTRA;\
             PRAGMA cache_size = 1;\
             PRAGMA cache_spill = ON;\
             BEGIN IMMEDIATE;\
             PRAGMA user_version = 2;\
             CREATE TABLE crash_probe (value BLOB);\
             INSERT INTO crash_probe VALUES (zeroblob(1048576));",
        )
        .expect("leave uncommitted, spilled transaction");
    std::process::exit(0);
}

#[test]
fn preopen_links_symlinks_and_hostile_journals_are_rejected() {
    let (_directory, path) = database();
    drop(open(&path));
    let main_link = path.with_extension("main-hardlink");
    fs::hard_link(&path, &main_link).expect("main hard link");
    assert_kind(
        LocalImmutableAssetStore::open(&path, principal()),
        LocalStoreErrorKind::PathRejected,
    );

    let (_directory, journal_path) = database();
    drop(open(&journal_path));
    let journal = PathBuf::from(format!("{}-journal", journal_path.display()));
    fs::write(&journal, vec![0_u8; 512]).expect("journal candidate");
    let journal_link = journal.with_extension("hardlink");
    fs::hard_link(&journal, &journal_link).expect("journal hard link");
    assert_kind(
        LocalImmutableAssetStore::open(&journal_path, principal()),
        LocalStoreErrorKind::PathRejected,
    );
}

#[test]
fn live_path_replacement_is_rejected_by_stable_file_identity() {
    let (_directory, path) = database();
    let store = open(&path);
    let old = path.with_extension("old");
    if fs::rename(&path, &old).is_err() {
        #[cfg(not(windows))]
        panic!("Unix must permit the replacement probe");
        #[cfg(windows)]
        {
            // SQLite's Windows VFS denies rename of its live handle. The Win32
            // file-index check covers the platforms/filesystems that permit it.
            return;
        }
    }
    fs::copy(&old, &path).expect("replacement file");
    assert_eq!(
        store
            .object(&principal(), digest(b"absent"), 16)
            .expect_err("replacement identity"),
        LocalStoreError::new(LocalStoreErrorKind::PathRejected)
    );
}

#[cfg(windows)]
#[test]
fn windows_reparse_points_are_rejected_when_symlink_creation_is_available() {
    use std::os::windows::fs::{symlink_dir, symlink_file};

    let (_directory, path) = database();
    drop(open(&path));
    let file_link = path.with_extension("symlink");
    if symlink_file(&path, &file_link).is_err() {
        return;
    }
    assert_kind(
        LocalImmutableAssetStore::open(&file_link, principal()),
        LocalStoreErrorKind::PathRejected,
    );

    let outer = tempfile::tempdir().expect("outer");
    let parent_link = outer.path().join("linked-parent");
    if symlink_dir(path.parent().expect("parent"), &parent_link).is_ok() {
        assert_kind(
            LocalImmutableAssetStore::open(parent_link.join("assets.sqlite3"), principal()),
            LocalStoreErrorKind::PathRejected,
        );
    }

    let (_directory, journal_path) = database();
    drop(open(&journal_path));
    let target = journal_path.with_extension("journal-target");
    fs::write(&target, vec![0_u8; 512]).expect("target");
    let journal = PathBuf::from(format!("{}-journal", journal_path.display()));
    symlink_file(&target, &journal).expect("journal reparse point");
    assert_kind(
        LocalImmutableAssetStore::open(&journal_path, principal()),
        LocalStoreErrorKind::PathRejected,
    );
}

#[cfg(unix)]
#[test]
fn unix_database_parent_and_journal_symlinks_are_rejected() {
    use std::os::unix::fs as unix_fs;

    let (_directory, path) = database();
    drop(open(&path));
    let file_symlink = path.with_extension("symlink");
    unix_fs::symlink(&path, &file_symlink).expect("DB symlink");
    assert_kind(
        LocalImmutableAssetStore::open(&file_symlink, principal()),
        LocalStoreErrorKind::PathRejected,
    );

    let outer = tempfile::tempdir().expect("outer");
    let parent_symlink = outer.path().join("linked-parent");
    unix_fs::symlink(path.parent().expect("parent"), &parent_symlink).expect("parent symlink");
    assert_kind(
        LocalImmutableAssetStore::open(parent_symlink.join("assets.sqlite3"), principal()),
        LocalStoreErrorKind::PathRejected,
    );

    let (_directory, journal_path) = database();
    drop(open(&journal_path));
    let target = journal_path.with_extension("journal-target");
    fs::write(&target, vec![0_u8; 512]).expect("target");
    let journal = PathBuf::from(format!("{}-journal", journal_path.display()));
    unix_fs::symlink(&target, &journal).expect("journal symlink");
    assert_kind(
        LocalImmutableAssetStore::open(&journal_path, principal()),
        LocalStoreErrorKind::PathRejected,
    );
}

#[test]
fn path_sidecar_and_principal_bounds_are_rejected() {
    assert_kind(
        LocalImmutableAssetStore::open("relative.sqlite3", principal()),
        LocalStoreErrorKind::PathRejected,
    );
    for suffix in ["-wal", "-shm"] {
        let (_directory, path) = database();
        let sidecar = PathBuf::from(format!("{}{}", path.display(), suffix));
        fs::write(&sidecar, []).expect("hostile sidecar");
        assert_kind(
            LocalImmutableAssetStore::open(&path, principal()),
            LocalStoreErrorKind::PathRejected,
        );
    }
    let (_directory, path) = database();
    assert_kind(
        LocalImmutableAssetStore::open(&path, PrincipalId::new(Vec::<u8>::new())),
        LocalStoreErrorKind::InvalidInput,
    );
    assert_kind(
        LocalImmutableAssetStore::open(&path, PrincipalId::new(vec![0_u8; 4_097])),
        LocalStoreErrorKind::InvalidInput,
    );
}

#[test]
fn errors_are_fully_redacted() {
    let secret_path = "C:\\secret\\tenant.sqlite3";
    let secret_principal = "principal-secret-value";
    let secret_media = "application/secret-media";
    let error = LocalStoreError::new(LocalStoreErrorKind::IntegrityViolation);
    let rendered = format!("{error:?} / {error}");
    for secret in [
        secret_path,
        secret_principal,
        secret_media,
        "SQLITE",
        "objects",
    ] {
        assert!(!rendered.contains(secret));
    }
}

#[test]
fn bundled_sqlite_version_is_exactly_pinned() {
    assert_eq!(rusqlite::version(), "3.53.2");
}

#[test]
fn sqlite_failures_are_classified_without_native_text() {
    use rusqlite::ffi;

    for code in [
        ffi::SQLITE_BUSY,
        ffi::SQLITE_LOCKED,
        ffi::SQLITE_NOMEM,
        ffi::SQLITE_READONLY,
        ffi::SQLITE_INTERRUPT,
        ffi::SQLITE_IOERR,
        ffi::SQLITE_FULL,
        ffi::SQLITE_CANTOPEN,
        ffi::SQLITE_PROTOCOL,
        ffi::SQLITE_PERM,
    ] {
        let error = rusqlite::Error::SqliteFailure(ffi::Error::new(code), None);
        assert_eq!(
            super::store::map_sql_error(error).kind(),
            LocalStoreErrorKind::StoreUnavailable
        );
    }
    for code in [
        ffi::SQLITE_CORRUPT,
        ffi::SQLITE_SCHEMA,
        ffi::SQLITE_TOOBIG,
        ffi::SQLITE_CONSTRAINT,
        ffi::SQLITE_MISMATCH,
        ffi::SQLITE_NOTADB,
    ] {
        let error = rusqlite::Error::SqliteFailure(ffi::Error::new(code), None);
        assert_eq!(
            super::store::map_sql_error(error).kind(),
            LocalStoreErrorKind::IntegrityViolation
        );
    }
}

fn assert_kind(
    result: Result<LocalImmutableAssetStore, LocalStoreError>,
    expected: LocalStoreErrorKind,
) {
    match result {
        Ok(_) => panic!("expected {expected:?}"),
        Err(error) => assert_eq!(error.kind(), expected),
    }
}

fn assert_integrity(result: Result<ObjectRead, LocalStoreError>) {
    assert_eq!(
        result.expect_err("corruption must be rejected"),
        LocalStoreError::new(LocalStoreErrorKind::IntegrityViolation)
    );
}

fn large_valid_png() -> Vec<u8> {
    let base = png_fixture();
    let insertion = 8 + 12 + 13;
    let target = 16_777_217_usize;
    let padding_length = target
        .checked_sub(base.len() + 12)
        .expect("fixture fits target");
    let mut result = Vec::with_capacity(target);
    result.extend_from_slice(&base[..insertion]);
    result.extend_from_slice(&(padding_length as u32).to_be_bytes());
    let crc_start = result.len();
    result.extend_from_slice(b"aaAa");
    result.resize(result.len() + padding_length, 0x5a);
    let crc = crc32(&result[crc_start..]);
    result.extend_from_slice(&crc.to_be_bytes());
    result.extend_from_slice(&base[insertion..]);
    assert_eq!(result.len(), target);
    result
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb_88320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}
