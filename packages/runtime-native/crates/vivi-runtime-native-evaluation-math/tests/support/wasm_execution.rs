#![cfg(all(test, target_family = "wasm"))]
#![deny(unsafe_code)]

use vivi_runtime_native_evaluation_math::wasm_test_adapter;

/// Test-only raw-bit entry point; absent from the production rlib.
#[allow(unsafe_code)] // Solely for the no_mangle export attribute below.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_math_test_invoke(opcode: u32, a: u64, b: u64) -> u64 {
    wasm_test_adapter::invoke(opcode, a, b)
}
