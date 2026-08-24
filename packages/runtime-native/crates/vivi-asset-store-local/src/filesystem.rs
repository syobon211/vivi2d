use std::fs::{self, File, OpenOptions};
use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::{LocalStoreError, integrity, path_rejected, unavailable};

#[derive(Clone, Copy)]
pub(crate) struct FileIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(windows)]
    volume: u32,
    #[cfg(windows)]
    index: u64,
}

const SHARING_RETRY_COUNT: usize = 1_000;
const SHARING_RETRY_DELAY: Duration = Duration::from_millis(5);

pub(crate) fn prepare_database_path(
    path: &Path,
) -> Result<(PathBuf, FileIdentity), LocalStoreError> {
    if !path.is_absolute() || path.file_name().is_none() {
        return Err(path_rejected());
    }
    let parent = path.parent().ok_or_else(path_rejected)?;
    validate_private_parent(parent)?;
    let canonical_parent = fs::canonicalize(parent).map_err(|_| path_rejected())?;
    let canonical_path = canonical_parent.join(path.file_name().ok_or_else(path_rejected)?);

    match metadata_or_missing(&canonical_path, false)? {
        Some(_) => validate_database_file(&canonical_path),
        None => match create_private_file(&canonical_path) {
            Ok(file) => {
                file.sync_all().map_err(|_| unavailable())?;
                drop(file);
                sync_parent_after_create(&canonical_parent)?;
                validate_database_file(&canonical_path)
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                validate_database_file(&canonical_path)
            }
            Err(_) => Err(unavailable()),
        },
    }
    .map(|identity| (canonical_path, identity))
}

/// Captures one coherent pre-open rollback-journal state without treating a
/// trusted SQLite writer's create/delete window as a hostile leaf. Every pass
/// remains bound to the exact main-file identity established by `prepare`.
pub(crate) fn validate_preopen_state(
    path: &Path,
    expected: FileIdentity,
) -> Result<(), LocalStoreError> {
    let mut last_header_error = None;
    for attempt in 0..3 {
        reject_wal_sidecars(path)?;
        let journal_before = validate_hot_journal(path)?;
        let header = validate_rollback_header(path, true);
        let journal_after = validate_hot_journal(path)?;
        verify_database_path(path, expected)?;

        match header {
            Ok(()) => return Ok(()),
            Err(_) if journal_before || journal_after => return Ok(()),
            Err(error) => last_header_error = Some(error),
        }
        if attempt != 2 {
            std::thread::yield_now();
        }
    }
    Err(last_header_error.unwrap_or_else(integrity))
}

pub(crate) fn verify_database_path(
    path: &Path,
    expected: FileIdentity,
) -> Result<(), LocalStoreError> {
    let actual = validate_database_file(path)?;
    #[cfg(unix)]
    if actual.device != expected.device || actual.inode != expected.inode {
        return Err(path_rejected());
    }
    #[cfg(windows)]
    if actual.volume != expected.volume || actual.index != expected.index {
        return Err(path_rejected());
    }
    Ok(())
}

/// A regular hot rollback journal is accepted so SQLite can recover it. Any
/// pre-existing non-regular or linked sidecar is rejected before SQLite sees it.
pub(crate) fn validate_hot_journal(path: &Path) -> Result<bool, LocalStoreError> {
    let mut journal_name = path.as_os_str().to_os_string();
    journal_name.push("-journal");
    let journal = PathBuf::from(journal_name);
    match metadata_or_missing(&journal, true)? {
        Some(metadata) => {
            validate_regular_private_metadata(&metadata)?;
            #[cfg(windows)]
            if windows_file_identity(&journal, true)?.is_none() {
                return Ok(false);
            }
            Ok(true)
        }
        None => Ok(false),
    }
}

/// WAL is outside this store's durability boundary. Reject its sidecars before
/// SQLite has an opportunity to consume them while switching journal modes.
pub(crate) fn reject_wal_sidecars(path: &Path) -> Result<(), LocalStoreError> {
    for suffix in ["-wal", "-shm"] {
        let mut name = path.as_os_str().to_os_string();
        name.push(suffix);
        match metadata_or_missing(&PathBuf::from(name), false)? {
            None => {}
            Some(_) => return Err(path_rejected()),
        }
    }
    Ok(())
}

pub(crate) fn validate_rollback_header(
    path: &Path,
    allow_empty: bool,
) -> Result<(), LocalStoreError> {
    let mut file = open_read_with_sharing_retry(path)?;
    let length = file.metadata().map_err(|_| integrity())?.len();
    if length == 0 && allow_empty {
        return Ok(());
    }
    if length < 100 {
        return Err(integrity());
    }
    let mut header = [0_u8; 100];
    file.read_exact(&mut header).map_err(|_| integrity())?;
    if &header[..16] != b"SQLite format 3\0"
        || header[18] != 1
        || header[19] != 1
        || u16::from_be_bytes([header[16], header[17]]) != 4_096
    {
        return Err(integrity());
    }
    Ok(())
}

fn validate_private_parent(path: &Path) -> Result<(), LocalStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| path_rejected())?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return Err(path_rejected());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        if metadata.mode() & 0o077 != 0 {
            return Err(path_rejected());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt as _;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(path_rejected());
        }
    }
    Ok(())
}

fn validate_database_file(path: &Path) -> Result<FileIdentity, LocalStoreError> {
    let metadata = metadata_or_missing(path, false)?.ok_or_else(path_rejected)?;
    validate_regular_private_metadata(&metadata)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        if metadata.nlink() != 1 || metadata.mode() & 0o077 != 0 {
            return Err(path_rejected());
        }
        Ok(FileIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(windows)]
    {
        windows_file_identity(path, false)?.ok_or_else(path_rejected)
    }
}

fn metadata_or_missing(
    path: &Path,
    delete_pending_is_transient: bool,
) -> Result<Option<fs::Metadata>, LocalStoreError> {
    let mut access_denied_exhaustion = false;
    for attempt in 0..SHARING_RETRY_COUNT {
        match fs::symlink_metadata(path) {
            Ok(metadata) => return Ok(Some(metadata)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) if is_transient_sharing(&error) => {
                access_denied_exhaustion = false;
                if attempt + 1 != SHARING_RETRY_COUNT {
                    std::thread::sleep(SHARING_RETRY_DELAY);
                }
            }
            Err(error) if delete_pending_is_transient && is_access_denied(&error) => {
                access_denied_exhaustion = true;
                if attempt + 1 != SHARING_RETRY_COUNT {
                    std::thread::sleep(SHARING_RETRY_DELAY);
                }
            }
            Err(_) => return Err(path_rejected()),
        }
    }
    if access_denied_exhaustion {
        Err(path_rejected())
    } else {
        Err(unavailable())
    }
}

fn open_read_with_sharing_retry(path: &Path) -> Result<File, LocalStoreError> {
    for attempt in 0..SHARING_RETRY_COUNT {
        match File::open(path) {
            Ok(file) => return Ok(file),
            Err(error) if is_transient_sharing(&error) => {
                if attempt + 1 != SHARING_RETRY_COUNT {
                    std::thread::sleep(SHARING_RETRY_DELAY);
                }
            }
            Err(_) => return Err(integrity()),
        }
    }
    Err(unavailable())
}

fn is_transient_sharing(error: &std::io::Error) -> bool {
    #[cfg(windows)]
    {
        matches!(error.raw_os_error(), Some(32 | 33))
    }
    #[cfg(not(windows))]
    {
        let _ = error;
        false
    }
}

fn is_access_denied(error: &std::io::Error) -> bool {
    #[cfg(windows)]
    {
        error.raw_os_error() == Some(5)
    }
    #[cfg(not(windows))]
    {
        let _ = error;
        false
    }
}

fn validate_regular_private_metadata(metadata: &fs::Metadata) -> Result<(), LocalStoreError> {
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(path_rejected());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        if metadata.nlink() != 1 || metadata.mode() & 0o077 != 0 {
            return Err(path_rejected());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt as _;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(path_rejected());
        }
    }
    Ok(())
}

fn create_private_file(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    options.open(path)
}

#[cfg(unix)]
fn sync_parent_after_create(parent: &Path) -> Result<(), LocalStoreError> {
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| unavailable())
}

#[cfg(windows)]
fn sync_parent_after_create(_parent: &Path) -> Result<(), LocalStoreError> {
    // The trusted Windows application-support parent owns DACL/directory
    // durability policy. The main file itself is flushed above.
    Ok(())
}

#[cfg(windows)]
fn windows_file_identity(
    path: &Path,
    disappearing_is_missing: bool,
) -> Result<Option<FileIdentity>, LocalStoreError> {
    use std::os::windows::fs::OpenOptionsExt as _;
    use std::os::windows::io::AsRawHandle as _;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_DELETE,
        FILE_SHARE_READ, FILE_SHARE_WRITE, GetFileInformationByHandle,
    };

    let mut file = None;
    let mut access_denied_exhaustion = false;
    for attempt in 0..SHARING_RETRY_COUNT {
        match OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
        {
            Ok(opened) => {
                file = Some(opened);
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) if is_transient_sharing(&error) => {
                access_denied_exhaustion = false;
                if attempt + 1 != SHARING_RETRY_COUNT {
                    std::thread::sleep(SHARING_RETRY_DELAY);
                }
            }
            Err(error) if disappearing_is_missing && is_access_denied(&error) => {
                access_denied_exhaustion = true;
                if attempt + 1 != SHARING_RETRY_COUNT {
                    std::thread::sleep(SHARING_RETRY_DELAY);
                }
            }
            Err(_) => return Err(path_rejected()),
        }
    }
    let file = match file {
        Some(file) => file,
        None if access_denied_exhaustion => return Err(path_rejected()),
        None => return Err(unavailable()),
    };
    let mut information = BY_HANDLE_FILE_INFORMATION::default();
    // SAFETY: `file` owns a live OS handle for the duration of the call and
    // `information` is a writable, correctly sized Win32 output structure.
    let succeeded = unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut information) };
    if succeeded == 0 || information.dwFileAttributes & 0x400 != 0 {
        return Err(path_rejected());
    }
    // A rollback journal that SQLite has marked delete-pending remains
    // openable through the race window but reports zero links. It is already
    // outside the namespace and is equivalent to a disappeared journal.
    if disappearing_is_missing && information.nNumberOfLinks == 0 {
        return Ok(None);
    }
    if information.nNumberOfLinks != 1 {
        return Err(path_rejected());
    }
    Ok(Some(FileIdentity {
        volume: information.dwVolumeSerialNumber,
        index: (u64::from(information.nFileIndexHigh) << 32) | u64::from(information.nFileIndexLow),
    }))
}
