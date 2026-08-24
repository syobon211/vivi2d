use std::time::Duration;

use rusqlite::config::DbConfig;
use rusqlite::limits::Limit;
use rusqlite::{Connection, OptionalExtension as _, TransactionBehavior, params};

use crate::error::{LocalStoreError, integrity, unavailable};

pub(crate) const APPLICATION_ID: i64 = 0x5641_5331; // "VAS1"
pub(crate) const USER_VERSION: i64 = 1;
pub(crate) const PAGE_SIZE: i64 = 4_096;
pub(crate) const MAX_PAGE_COUNT: i64 = 33_554_432;
pub(crate) const BUSY_TIMEOUT_MS: i64 = 5_000;
pub(crate) const CACHE_SIZE_KIB: i64 = -8_192;
pub(crate) const JOURNAL_SIZE_LIMIT: i64 = 0;

pub(crate) const CREATE_META_SQL: &str = "CREATE TABLE store_meta (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), principal_key BLOB NOT NULL CHECK (length(principal_key) = 32)) STRICT, WITHOUT ROWID";
pub(crate) const CREATE_OBJECTS_SQL: &str = "CREATE TABLE objects (principal_key BLOB NOT NULL CHECK (length(principal_key) = 32), address BLOB NOT NULL CHECK (length(address) = 32), byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 16777216), bytes BLOB NOT NULL CHECK (length(bytes) = byte_size), PRIMARY KEY (principal_key, address)) STRICT, WITHOUT ROWID";
pub(crate) const CREATE_DESCRIPTORS_SQL: &str = "CREATE TABLE descriptors (principal_key BLOB NOT NULL CHECK (length(principal_key) = 32), storage_kind INTEGER NOT NULL CHECK (storage_kind IN (0, 1)), object_address BLOB NOT NULL CHECK (length(object_address) = 32), content_sha256 BLOB NOT NULL CHECK (length(content_sha256) = 32), media_type TEXT NOT NULL CHECK (length(CAST(media_type AS BLOB)) BETWEEN 1 AND 255), size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 0 AND 68719476736), CHECK ((storage_kind = 0 AND size_bytes <= 16777216 AND object_address = content_sha256) OR (storage_kind = 1 AND size_bytes BETWEEN 16777217 AND 68719476736)), PRIMARY KEY (principal_key, storage_kind, object_address, content_sha256, media_type, size_bytes), FOREIGN KEY (principal_key, object_address) REFERENCES objects(principal_key, address)) STRICT, WITHOUT ROWID";

const EXPECTED_SCHEMA: [(&str, &str); 3] = [
    ("descriptors", CREATE_DESCRIPTORS_SQL),
    ("objects", CREATE_OBJECTS_SQL),
    ("store_meta", CREATE_META_SQL),
];

pub(crate) fn configure_connection(connection: &Connection) -> Result<(), LocalStoreError> {
    set_config(connection, DbConfig::SQLITE_DBCONFIG_ENABLE_FKEY, true)?;
    set_config(connection, DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)?;
    set_config(connection, DbConfig::SQLITE_DBCONFIG_DQS_DDL, false)?;
    set_config(connection, DbConfig::SQLITE_DBCONFIG_DQS_DML, false)?;

    set_limit(connection, Limit::SQLITE_LIMIT_LENGTH, 16_781_312)?;
    set_limit(connection, Limit::SQLITE_LIMIT_SQL_LENGTH, 65_536)?;
    set_limit(connection, Limit::SQLITE_LIMIT_COLUMN, 32)?;
    set_limit(connection, Limit::SQLITE_LIMIT_EXPR_DEPTH, 64)?;
    set_limit(connection, Limit::SQLITE_LIMIT_COMPOUND_SELECT, 4)?;
    set_limit(connection, Limit::SQLITE_LIMIT_VDBE_OP, 20_000)?;
    set_limit(connection, Limit::SQLITE_LIMIT_FUNCTION_ARG, 16)?;
    set_limit(connection, Limit::SQLITE_LIMIT_ATTACHED, 0)?;
    set_limit(connection, Limit::SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 256)?;
    set_limit(connection, Limit::SQLITE_LIMIT_VARIABLE_NUMBER, 16)?;
    set_limit(connection, Limit::SQLITE_LIMIT_TRIGGER_DEPTH, 0)?;
    set_limit(connection, Limit::SQLITE_LIMIT_WORKER_THREADS, 0)?;

    connection
        .busy_timeout(Duration::from_millis(BUSY_TIMEOUT_MS as u64))
        .map_err(|_| unavailable())?;
    set_pragma_integer(connection, "synchronous", "EXTRA", 3)?;
    set_pragma_integer(connection, "temp_store", "MEMORY", 2)?;
    set_pragma_integer(connection, "mmap_size", 0_i64, 0)?;
    set_pragma_integer(connection, "cell_size_check", true, 1)?;
    set_pragma_integer(connection, "foreign_keys", true, 1)?;
    set_pragma_integer(connection, "cache_size", CACHE_SIZE_KIB, CACHE_SIZE_KIB)?;
    require_pragma_integer(connection, "busy_timeout", BUSY_TIMEOUT_MS)?;
    require_pragma_integer(connection, "trusted_schema", 0)?;
    require_pragma_integer(connection, "page_size", PAGE_SIZE)?;
    set_pragma_text(connection, "encoding", "UTF-8", "UTF-8")?;
    Ok(())
}

pub(crate) fn initialize_or_validate(
    connection: &mut Connection,
    principal_key: &[u8; 32],
) -> Result<(), LocalStoreError> {
    require_pragma_text(connection, "journal_mode", "delete")?;
    // The empty-vs-existing decision is made only after the write lock. Two
    // concurrent first opens therefore converge on the same initialized DB.
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| unavailable())?;
    let application_id = pragma_integer(&transaction, "application_id")?;
    let user_version = pragma_integer(&transaction, "user_version")?;
    let object_count: i64 = transaction
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE sql IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|_| integrity())?;

    if application_id == 0 && user_version == 0 && object_count == 0 {
        transaction
            .execute(CREATE_META_SQL, [])
            .map_err(|_| integrity())?;
        transaction
            .execute(CREATE_OBJECTS_SQL, [])
            .map_err(|_| integrity())?;
        transaction
            .execute(CREATE_DESCRIPTORS_SQL, [])
            .map_err(|_| integrity())?;
        transaction
            .execute(
                "INSERT INTO store_meta (singleton, principal_key) VALUES (1, ?1)",
                params![principal_key.as_slice()],
            )
            .map_err(|_| integrity())?;
        transaction
            .pragma_update(None, "application_id", APPLICATION_ID)
            .map_err(|_| integrity())?;
        transaction
            .pragma_update(None, "user_version", USER_VERSION)
            .map_err(|_| integrity())?;
    } else if application_id != APPLICATION_ID || user_version != USER_VERSION {
        return Err(integrity());
    }
    transaction.commit().map_err(|_| unavailable())?;

    // Only a freshly initialized or already identified store may receive
    // persistent journal/quota settings.
    set_pragma_text(connection, "journal_mode", "DELETE", "delete")?;
    set_pragma_integer(
        connection,
        "journal_size_limit",
        JOURNAL_SIZE_LIMIT,
        JOURNAL_SIZE_LIMIT,
    )?;
    set_pragma_integer(connection, "max_page_count", MAX_PAGE_COUNT, MAX_PAGE_COUNT)?;

    set_config(connection, DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
    validate_header(connection)?;
    validate_schema(connection)?;
    validate_principal(connection, principal_key)?;
    validate_database(connection)
}

fn validate_header(connection: &Connection) -> Result<(), LocalStoreError> {
    if pragma_integer(connection, "application_id")? != APPLICATION_ID
        || pragma_integer(connection, "user_version")? != USER_VERSION
        || pragma_integer(connection, "page_size")? != PAGE_SIZE
    {
        return Err(integrity());
    }
    Ok(())
}

fn validate_schema(connection: &Connection) -> Result<(), LocalStoreError> {
    let mut statement = connection
        .prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name")
        .map_err(|_| integrity())?;
    let mut rows = statement.query([]).map_err(|_| integrity())?;
    for (expected_name, expected_sql) in EXPECTED_SCHEMA {
        let row = rows
            .next()
            .map_err(|_| integrity())?
            .ok_or_else(integrity)?;
        let name: String = row.get(0).map_err(|_| integrity())?;
        let sql: String = row.get(1).map_err(|_| integrity())?;
        if name != expected_name || sql != expected_sql {
            return Err(integrity());
        }
    }
    if rows.next().map_err(|_| integrity())?.is_some() {
        return Err(integrity());
    }
    Ok(())
}

fn validate_principal(connection: &Connection, expected: &[u8; 32]) -> Result<(), LocalStoreError> {
    let stored = connection
        .query_row(
            "SELECT principal_key FROM store_meta WHERE singleton = 1",
            [],
            |row| row.get::<_, Vec<u8>>(0),
        )
        .optional()
        .map_err(|_| integrity())?
        .ok_or_else(integrity)?;
    if stored.as_slice() != expected {
        return Err(crate::error::principal_mismatch());
    }
    Ok(())
}

fn validate_database(connection: &Connection) -> Result<(), LocalStoreError> {
    let mut quick = connection
        .prepare("PRAGMA quick_check(1)")
        .map_err(|_| integrity())?;
    let mut quick_rows = quick.query([]).map_err(|_| integrity())?;
    let row = quick_rows
        .next()
        .map_err(|_| integrity())?
        .ok_or_else(integrity)?;
    let result: String = row.get(0).map_err(|_| integrity())?;
    if result != "ok" || quick_rows.next().map_err(|_| integrity())?.is_some() {
        return Err(integrity());
    }

    let foreign_key_failure: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM pragma_foreign_key_check LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| integrity())?;
    if foreign_key_failure.is_some() {
        return Err(integrity());
    }
    Ok(())
}

fn set_config(
    connection: &Connection,
    config: DbConfig,
    value: bool,
) -> Result<(), LocalStoreError> {
    if connection
        .set_db_config(config, value)
        .map_err(|_| unavailable())?
        != value
        || connection.db_config(config).map_err(|_| unavailable())? != value
    {
        return Err(integrity());
    }
    Ok(())
}

fn set_limit(connection: &Connection, limit: Limit, value: i32) -> Result<(), LocalStoreError> {
    connection
        .set_limit(limit, value)
        .map_err(|_| unavailable())?;
    if connection.limit(limit).map_err(|_| unavailable())? != value {
        return Err(integrity());
    }
    Ok(())
}

fn set_pragma_integer(
    connection: &Connection,
    name: &str,
    value: impl rusqlite::ToSql,
    expected: i64,
) -> Result<(), LocalStoreError> {
    connection
        .pragma_update(None, name, value)
        .map_err(|_| unavailable())?;
    require_pragma_integer(connection, name, expected)
}

fn set_pragma_text(
    connection: &Connection,
    name: &str,
    value: &str,
    expected: &str,
) -> Result<(), LocalStoreError> {
    connection
        .pragma_update(None, name, value)
        .map_err(|_| unavailable())?;
    let actual: String = connection
        .pragma_query_value(None, name, |row| row.get(0))
        .map_err(|_| unavailable())?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(integrity());
    }
    Ok(())
}

fn require_pragma_text(
    connection: &Connection,
    name: &str,
    expected: &str,
) -> Result<(), LocalStoreError> {
    let actual: String = connection
        .pragma_query_value(None, name, |row| row.get(0))
        .map_err(|_| unavailable())?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(integrity());
    }
    Ok(())
}

fn require_pragma_integer(
    connection: &Connection,
    name: &str,
    expected: i64,
) -> Result<(), LocalStoreError> {
    if pragma_integer(connection, name)? != expected {
        return Err(integrity());
    }
    Ok(())
}

fn pragma_integer(connection: &Connection, name: &str) -> Result<i64, LocalStoreError> {
    connection
        .pragma_query_value(None, name, |row| row.get(0))
        .map_err(|_| unavailable())
}
