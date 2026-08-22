#![cfg(target_family = "wasm")]
#![forbid(unsafe_code)]

//! Compile-only wasm32 reachability harness for the exact production modules.
//!
//! This separate test target has no exported ABI and is never presented as
//! raw-bit execution evidence. Its purpose is to keep every selected wrapper
//! body reachable during `wasm32-unknown-unknown --all-targets --no-run`.

use core::hint::black_box;

#[path = "../src/binary64.rs"]
mod binary64;
#[path = "../src/transcendental.rs"]
mod transcendental;

use binary64::DetF64;

#[test]
fn compile_all_selected_raw_bit_wrapper_paths() {
    let zero = DetF64::from_bits(0x0000_0000_0000_0000);
    let negative_zero = DetF64::from_bits(0x8000_0000_0000_0000);
    let min_subnormal = DetF64::from_bits(0x0000_0000_0000_0001);
    let half = DetF64::from_bits(0x3fe0_0000_0000_0000);
    let negative_half = DetF64::from_bits(0xbfe0_0000_0000_0000);
    let one = DetF64::from_bits(0x3ff0_0000_0000_0000);
    let two = DetF64::from_bits(0x4000_0000_0000_0000);
    let pi = DetF64::from_bits(0x4009_21fb_5444_2d18);
    let huge = DetF64::from_bits(0x43e0_0000_0000_0000);
    let infinity = DetF64::from_bits(0x7ff0_0000_0000_0000);
    let nan = DetF64::from_bits(0x7ff0_0000_0000_0001);

    let mut raw_sink = black_box(zero).to_bits() ^ black_box(nan).to_bits();
    let mut bool_sink = black_box(one).is_finite() ^ black_box(infinity).is_finite();
    black_box(zero.classify());
    black_box(min_subnormal.classify());
    black_box(one.classify());
    black_box(infinity.classify());
    black_box(nan.classify());

    raw_sink ^= black_box(one).add(black_box(two)).to_bits();
    raw_sink ^= black_box(one).sub(black_box(two)).to_bits();
    raw_sink ^= black_box(one).mul(black_box(two)).to_bits();
    raw_sink ^= black_box(one).div(black_box(two)).to_bits();
    raw_sink ^= black_box(pi).c_fmod(black_box(two)).to_bits();
    raw_sink ^= black_box(negative_zero).neg().to_bits();
    raw_sink ^= black_box(negative_zero).abs().to_bits();

    for input in [zero, negative_zero, one, pi, huge, infinity, nan] {
        raw_sink ^= black_box(input).sin().to_bits();
        raw_sink ^= black_box(input).cos().to_bits();
    }
    for (y, x) in [
        (zero, one),
        (negative_zero, one),
        (zero, negative_zero),
        (one, one),
        (min_subnormal, one),
        (nan, one),
    ] {
        raw_sink ^= black_box(y).atan2(black_box(x)).to_bits();
    }
    for input in [
        negative_zero,
        zero,
        half,
        negative_half,
        one,
        two,
        nan,
        infinity,
    ] {
        raw_sink ^= black_box(input).acos().to_bits();
        raw_sink ^= black_box(input).sqrt().to_bits();
    }

    bool_sink ^= black_box(zero).eq(black_box(negative_zero));
    bool_sink ^= black_box(zero).lt(black_box(one));
    bool_sink ^= black_box(zero).le(black_box(one));
    bool_sink ^= black_box(one).gt(black_box(zero));
    bool_sink ^= black_box(one).ge(black_box(one));
    bool_sink ^= black_box(nan).eq(black_box(one));
    black_box((raw_sink, bool_sink));
}
