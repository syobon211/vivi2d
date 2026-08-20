//! Principal-scoped, append-only local Asset Model v1 storage.
//!
//! This native-only crate owns one SQLite database beneath a trusted private
//! application-support directory. It deliberately exposes no deletion, GC,
//! server-state, capability, IPC, C ABI, or WASM surface.

mod error;
mod filesystem;
mod principal;
mod schema;
mod store;

pub use error::{LocalStoreError, LocalStoreErrorKind};
pub use store::LocalImmutableAssetStore;

#[cfg(test)]
mod tests;
