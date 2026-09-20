//! Test-only raw-bit dispatch for the deterministic-math WASM execution gate.
//!
//! Numeric results are binary64 bits. Boolean tags are false = 0 and true = 1;
//! class tags are zero = 0, subnormal = 1, normal = 2, infinite = 3, and NaN = 4.
//! Unsupported opcodes trap. This module is absent from production builds.

use crate::binary64::{DetF64, DetF64Class};

/// Invokes one of the fixed 20 test operations on raw bits; unary operations ignore `b`.
pub fn invoke(opcode: u32, a: u64, b: u64) -> u64 {
    let a = DetF64::from_bits(a);
    match opcode {
        0 => a.to_bits(),
        1 => a.add(DetF64::from_bits(b)).to_bits(),
        2 => a.sub(DetF64::from_bits(b)).to_bits(),
        3 => a.mul(DetF64::from_bits(b)).to_bits(),
        4 => a.div(DetF64::from_bits(b)).to_bits(),
        5 => a.c_fmod(DetF64::from_bits(b)).to_bits(),
        6 => a.neg().to_bits(),
        7 => a.abs().to_bits(),
        8 => a.sin().to_bits(),
        9 => a.cos().to_bits(),
        10 => a.atan2(DetF64::from_bits(b)).to_bits(),
        11 => a.acos().to_bits(),
        12 => a.sqrt().to_bits(),
        13 => u64::from(a.eq(DetF64::from_bits(b))),
        14 => u64::from(a.lt(DetF64::from_bits(b))),
        15 => u64::from(a.le(DetF64::from_bits(b))),
        16 => u64::from(a.gt(DetF64::from_bits(b))),
        17 => u64::from(a.ge(DetF64::from_bits(b))),
        18 => match a.classify() {
            DetF64Class::Zero => 0,
            DetF64Class::Subnormal => 1,
            DetF64Class::Normal => 2,
            DetF64Class::Infinite => 3,
            DetF64Class::Nan => 4,
        },
        19 => u64::from(a.is_finite()),
        _ => core::arch::wasm32::unreachable(),
    }
}
