#![cfg(not(target_family = "wasm"))]

//! Native, test-only allocator observation for the exact production modules.
//!
//! The library intentionally exposes no public test hook. This separate test
//! crate therefore compiles the same two production source files by path and
//! exercises the exact 21-callable surface while allocator observation is armed.
//! It is not linked into a production artifact.

use std::alloc::{GlobalAlloc, Layout, System};
use std::hint::black_box;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

#[path = "../src/binary64.rs"]
mod binary64;
#[path = "../src/transcendental.rs"]
mod transcendental;

use binary64::DetF64;

struct ObservedSystem;

static OBSERVING: AtomicBool = AtomicBool::new(false);
static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

#[global_allocator]
static ALLOCATOR: ObservedSystem = ObservedSystem;

unsafe impl GlobalAlloc for ObservedSystem {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        observe_allocation();
        // SAFETY: the request is forwarded unchanged to the system allocator.
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        observe_allocation();
        // SAFETY: the request is forwarded unchanged to the system allocator.
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        // SAFETY: the pointer and layout came from the forwarded allocator.
        unsafe { System.dealloc(pointer, layout) }
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        observe_allocation();
        // SAFETY: the pointer/layout pair and new size are forwarded unchanged.
        unsafe { System.realloc(pointer, layout, new_size) }
    }
}

fn observe_allocation() {
    if OBSERVING.load(Ordering::SeqCst) {
        ALLOCATIONS.fetch_add(1, Ordering::SeqCst);
    }
}

struct ObservationWindow;

impl ObservationWindow {
    fn begin() -> Self {
        ALLOCATIONS.store(0, Ordering::SeqCst);
        assert!(!OBSERVING.swap(true, Ordering::SeqCst));
        Self
    }
}

impl Drop for ObservationWindow {
    fn drop(&mut self) {
        OBSERVING.store(false, Ordering::SeqCst);
    }
}

#[test]
fn selected_raw_bit_wrapper_closure_allocates_nothing() {
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

    let window = ObservationWindow::begin();
    let mut raw_sink = 0_u64;
    let mut bool_sink = false;

    raw_sink ^= black_box(zero).to_bits();
    raw_sink ^= black_box(nan).to_bits();
    black_box(zero.classify());
    black_box(min_subnormal.classify());
    black_box(one.classify());
    black_box(infinity.classify());
    black_box(nan.classify());
    bool_sink ^= black_box(one).is_finite();
    bool_sink ^= black_box(infinity).is_finite();

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
    drop(window);
    black_box((raw_sink, bool_sink));
    assert_eq!(ALLOCATIONS.load(Ordering::SeqCst), 0);
}
