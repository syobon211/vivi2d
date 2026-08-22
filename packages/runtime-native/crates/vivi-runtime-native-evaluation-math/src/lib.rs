#![no_std]
#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Consumer-zero deterministic binary64 oracle for Evaluation math.
//!
//! This rlib has no product-public items and no production consumer. It only
//! contains a kernel candidate implementing the adopted exact 21-callable
//! raw-bit surface. It does not implement checkpoints, the Evaluation graph,
//! category 10, projection,
//! status mapping, serialization, I/O, FFI, or a runtime/editor/WASM bridge.

mod binary64;
mod transcendental;

// A consumer-zero crate has no caller by construction. Keep every approved
// crate-private callable live for linting and source review without exporting
// it or executing any math during initialization.
const _: () = {
    use binary64::{DetF64, DetF64Class};

    let _: fn(u64) -> DetF64 = DetF64::from_bits;
    let _: fn(DetF64) -> u64 = DetF64::to_bits;
    let _: fn(DetF64) -> DetF64Class = DetF64::classify;
    let _: fn(DetF64) -> bool = DetF64::is_finite;
    let _: fn(DetF64, DetF64) -> DetF64 = DetF64::add;
    let _: fn(DetF64, DetF64) -> DetF64 = DetF64::sub;
    let _: fn(DetF64, DetF64) -> DetF64 = DetF64::mul;
    let _: fn(DetF64, DetF64) -> DetF64 = DetF64::div;
    let _: fn(DetF64, DetF64) -> DetF64 = DetF64::c_fmod;
    let _: fn(DetF64) -> DetF64 = DetF64::neg;
    let _: fn(DetF64) -> DetF64 = DetF64::abs;
    let _: fn(DetF64) -> DetF64 = DetF64::sin;
    let _: fn(DetF64) -> DetF64 = DetF64::cos;
    let _: fn(DetF64, DetF64) -> DetF64 = DetF64::atan2;
    let _: fn(DetF64) -> DetF64 = DetF64::acos;
    let _: fn(DetF64) -> DetF64 = DetF64::sqrt;
    let _: fn(DetF64, DetF64) -> bool = DetF64::eq;
    let _: fn(DetF64, DetF64) -> bool = DetF64::lt;
    let _: fn(DetF64, DetF64) -> bool = DetF64::le;
    let _: fn(DetF64, DetF64) -> bool = DetF64::gt;
    let _: fn(DetF64, DetF64) -> bool = DetF64::ge;
};

/// Exact UTF-8 byte length of the adopted deterministic-math contract draft.
const APPROVED_CONTRACT_DRAFT_BYTES: usize = 38_965;
/// SHA-256 of the adopted deterministic-math contract draft.
const APPROVED_CONTRACT_DRAFT_SHA256: &str =
    "d39ed92629b89a3bf2e4c4cb37657e7407ede750896caf619cd121fa3ab9b75a";
/// Exact UTF-8 byte length of the adopted deterministic-math vectors.
const APPROVED_VECTORS_BYTES: usize = 79_921;
/// SHA-256 of the adopted deterministic-math vectors and copied fixture.
const APPROVED_VECTORS_SHA256: &str =
    "0a467b96d93ea0b7b8d12f8b8229d050b50945c40fff29c8ace0469b76cdec00";
/// Exact UTF-8 byte length of the deterministic-math approval record.
const APPROVED_REVIEW_BYTES: usize = 24_456;
/// SHA-256 of the deterministic-math approval record.
const APPROVED_REVIEW_SHA256: &str =
    "ae47988b58c56b32ec4a6c06809c61d5112ab1a68c8e5534e94c4a7c0b508cd7";

// Keep the private evidence identities live without adding a callable surface.
const _: (usize, &str, usize, &str, usize, &str) = (
    APPROVED_CONTRACT_DRAFT_BYTES,
    APPROVED_CONTRACT_DRAFT_SHA256,
    APPROVED_VECTORS_BYTES,
    APPROVED_VECTORS_SHA256,
    APPROVED_REVIEW_BYTES,
    APPROVED_REVIEW_SHA256,
);

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod tests;
