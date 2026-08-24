use std::vec::Vec;

use crate::binary64::{DetF64, DetF64Class};
use crate::{
    APPROVED_CONTRACT_DRAFT_BYTES, APPROVED_CONTRACT_DRAFT_SHA256, APPROVED_REVIEW_BYTES,
    APPROVED_REVIEW_SHA256, APPROVED_VECTORS_BYTES, APPROVED_VECTORS_SHA256,
};

const VECTORS: &[u8] = include_bytes!("../fixtures/evaluation-deterministic-math-v1-vectors.json");
const VECTOR_TEXT: &str = include_str!("../fixtures/evaluation-deterministic-math-v1-vectors.json");

fn matching_delimiter(source: &str, start: usize, open: u8, close: u8) -> usize {
    let mut depth = 0_usize;
    let mut in_string = false;
    let mut escaped = false;
    for (offset, byte) in source.as_bytes()[start..].iter().copied().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
            continue;
        }
        if byte == b'"' {
            in_string = true;
        } else if byte == open {
            depth += 1;
        } else if byte == close {
            depth -= 1;
            if depth == 0 {
                return start + offset;
            }
        }
    }
    panic!("unterminated JSON delimiter")
}

fn array_body<'a>(source: &'a str, marker: &str) -> &'a str {
    let marker_start = source.find(marker).expect("array marker exists");
    let start = marker_start + marker.len() - 1;
    assert_eq!(source.as_bytes()[start], b'[');
    let end = matching_delimiter(source, start, b'[', b']');
    &source[start + 1..end]
}

fn objects(source: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut depth = 0_usize;
    let mut object_start = 0_usize;
    let mut in_string = false;
    let mut escaped = false;
    for (index, byte) in source.as_bytes().iter().copied().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
            continue;
        }
        if byte == b'"' {
            in_string = true;
        } else if byte == b'{' {
            if depth == 0 {
                object_start = index;
            }
            depth += 1;
        } else if byte == b'}' {
            depth -= 1;
            if depth == 0 {
                result.push(&source[object_start..=index]);
            }
        }
    }
    assert_eq!(depth, 0);
    result
}

fn string_field<'a>(object: &'a str, marker: &str) -> &'a str {
    let start = object.find(marker).expect("string field exists") + marker.len();
    let remainder = &object[start..];
    let length = remainder.find('"').expect("string field terminates");
    &remainder[..length]
}

fn string_array_field<'a>(object: &'a str, marker: &str) -> Vec<&'a str> {
    let start = object.find(marker).expect("array field exists") + marker.len() - 1;
    let end = matching_delimiter(object, start, b'[', b']');
    let body = &object[start + 1..end];
    let mut result = Vec::new();
    let mut rest = body;
    while let Some(open) = rest.find('"') {
        rest = &rest[open + 1..];
        let close = rest.find('"').expect("array string terminates");
        result.push(&rest[..close]);
        rest = &rest[close + 1..];
    }
    result
}

fn boolean_field(object: &str, marker: &str) -> bool {
    let start = object.find(marker).expect("boolean field exists") + marker.len();
    let value = &object[start..];
    if value.starts_with("true") {
        true
    } else if value.starts_with("false") {
        false
    } else {
        panic!("invalid JSON boolean")
    }
}

fn bits(value: &str) -> u64 {
    assert_eq!(value.len(), 16);
    u64::from_str_radix(value, 16).expect("raw binary64 bits")
}

fn evaluate_kernel(op: &str, inputs: &[&str]) -> u64 {
    let first = DetF64::from_bits(bits(inputs[0]));
    let result = match op {
        "add" => first.add(DetF64::from_bits(bits(inputs[1]))),
        "sub" => first.sub(DetF64::from_bits(bits(inputs[1]))),
        "mul" => first.mul(DetF64::from_bits(bits(inputs[1]))),
        "div" => first.div(DetF64::from_bits(bits(inputs[1]))),
        "c_fmod" => first.c_fmod(DetF64::from_bits(bits(inputs[1]))),
        "neg" => first.neg(),
        "abs" => first.abs(),
        "sin" => first.sin(),
        "cos" => first.cos(),
        "atan2" => first.atan2(DetF64::from_bits(bits(inputs[1]))),
        "acos" => first.acos(),
        "sqrt" => first.sqrt(),
        _ => panic!("unrecognized kernel operation"),
    };
    result.to_bits()
}

fn evaluate_comparison(op: &str, lhs: DetF64, rhs: DetF64) -> bool {
    match op {
        "eq" => lhs.eq(rhs),
        "lt" => lhs.lt(rhs),
        "le" => lhs.le(rhs),
        "gt" => lhs.gt(rhs),
        "ge" => lhs.ge(rhs),
        _ => panic!("unrecognized comparison operation"),
    }
}

fn class_matches(actual: DetF64Class, expected: &str) -> bool {
    matches!(
        (actual, expected),
        (DetF64Class::Zero, "zero")
            | (DetF64Class::Subnormal, "subnormal")
            | (DetF64Class::Normal, "normal")
            | (DetF64Class::Infinite, "infinite")
            | (DetF64Class::Nan, "nan")
    )
}

#[test]
fn approved_fixture_is_exact_utf8_without_bom() {
    assert_eq!(VECTORS.len(), APPROVED_VECTORS_BYTES);
    assert_eq!(sha256(VECTORS), APPROVED_VECTOR_SHA256_BYTES);
    assert!(!VECTORS.starts_with(&[0xef, 0xbb, 0xbf]));
    assert!(!VECTORS.contains(&b'\r'));
    assert_eq!(VECTORS.last(), Some(&b'\n'));
    assert_eq!(VECTOR_TEXT.as_bytes(), VECTORS);

    assert_eq!(APPROVED_CONTRACT_DRAFT_BYTES, 38_965);
    assert_eq!(
        APPROVED_CONTRACT_DRAFT_SHA256,
        "d39ed92629b89a3bf2e4c4cb37657e7407ede750896caf619cd121fa3ab9b75a"
    );
    assert_eq!(
        APPROVED_VECTORS_SHA256,
        "0a467b96d93ea0b7b8d12f8b8229d050b50945c40fff29c8ace0469b76cdec00"
    );
    assert_eq!(APPROVED_REVIEW_BYTES, 24_456);
    assert_eq!(
        APPROVED_REVIEW_SHA256,
        "ae47988b58c56b32ec4a6c06809c61d5112ab1a68c8e5534e94c4a7c0b508cd7"
    );
}

#[test]
fn all_eighteen_frozen_constants_round_trip_as_raw_bits() {
    let constants = objects(array_body(VECTOR_TEXT, "\"constants\": ["));
    assert_eq!(constants.len(), 18);
    for constant in constants {
        let id = string_field(constant, "\"id\": \"");
        let expected = bits(string_field(constant, "\"bits\": \""));
        assert_eq!(DetF64::from_bits(expected).to_bits(), expected, "{id}");
    }
}

#[test]
fn all_eighty_five_curated_kernel_vectors_are_bit_exact() {
    let cases = objects(array_body(VECTOR_TEXT, "\"curatedKernelVectors\": ["));
    assert_eq!(cases.len(), 85);
    for case in cases {
        let id = string_field(case, "\"id\": \"");
        let op = string_field(case, "\"op\": \"");
        let inputs = string_array_field(case, "\"inputBits\": [");
        let expected = bits(string_field(case, "\"expectedBits\": \""));
        assert_eq!(evaluate_kernel(op, &inputs), expected, "{id}");
    }
}

#[test]
fn all_twelve_comparison_vectors_are_exact() {
    let cases = objects(array_body(VECTOR_TEXT, "\"comparisonVectors\": ["));
    assert_eq!(cases.len(), 12);
    for case in cases {
        let id = string_field(case, "\"id\": \"");
        let op = string_field(case, "\"op\": \"");
        let inputs = string_array_field(case, "\"inputBits\": [");
        let lhs = DetF64::from_bits(bits(inputs[0]));
        let rhs = DetF64::from_bits(bits(inputs[1]));
        let expected = boolean_field(case, "\"expectedBoolean\": ");
        assert_eq!(evaluate_comparison(op, lhs, rhs), expected, "{id}");
    }
}

#[test]
fn all_eleven_wrapper_utility_vectors_are_exact() {
    let cases = objects(array_body(VECTOR_TEXT, "\"wrapperUtilityVectors\": ["));
    assert_eq!(cases.len(), 11);
    for case in cases {
        let id = string_field(case, "\"id\": \"");
        let op = string_field(case, "\"op\": \"");
        let input = string_array_field(case, "\"inputBits\": [");
        let value = DetF64::from_bits(bits(input[0]));
        match op {
            "from_bits_to_bits" => assert_eq!(
                value.to_bits(),
                bits(string_field(case, "\"expectedBits\": \"")),
                "{id}"
            ),
            "classify" => assert!(
                class_matches(
                    value.classify(),
                    string_field(case, "\"expectedClass\": \"")
                ),
                "{id}"
            ),
            "is_finite" => assert_eq!(
                value.is_finite(),
                boolean_field(case, "\"expectedBoolean\": "),
                "{id}"
            ),
            _ => panic!("unrecognized utility operation"),
        }
    }
}

#[test]
fn every_nan_boundary_is_positive_canonical_quiet_nan() {
    const NAN: u64 = 0x7ff8_0000_0000_0000;
    let encodings = [
        0x7ff0_0000_0000_0001,
        0x7ff8_0000_0000_0042,
        0xfff0_0000_0000_0001,
        0xffff_ffff_ffff_ffff,
    ];
    for encoding in encodings {
        assert_eq!(DetF64::from_bits(encoding).to_bits(), NAN);
    }

    let nan = DetF64::from_bits(encodings[2]);
    let one = DetF64::from_bits(0x3ff0_0000_0000_0000);
    for output in [
        nan.add(one),
        nan.sub(one),
        nan.mul(one),
        nan.div(one),
        nan.c_fmod(one),
        nan.neg(),
        nan.abs(),
        nan.sin(),
        nan.cos(),
        nan.atan2(one),
        nan.acos(),
        nan.sqrt(),
    ] {
        assert_eq!(output.to_bits(), NAN);
    }
    for comparison in [
        nan.eq(one),
        nan.lt(one),
        nan.le(one),
        nan.gt(one),
        nan.ge(one),
        one.eq(nan),
        one.lt(nan),
        one.le(nan),
        one.gt(nan),
        one.ge(nan),
    ] {
        assert!(!comparison);
    }
}

#[test]
fn signed_zero_and_subnormal_semantics_are_preserved() {
    let positive_zero = DetF64::from_bits(0);
    let negative_zero = DetF64::from_bits(0x8000_0000_0000_0000);
    let min_subnormal = DetF64::from_bits(1);
    let one = DetF64::from_bits(0x3ff0_0000_0000_0000);

    assert!(positive_zero.eq(negative_zero));
    assert!(!positive_zero.lt(negative_zero));
    assert!(!positive_zero.gt(negative_zero));
    assert_eq!(negative_zero.neg().to_bits(), 0);
    assert_eq!(negative_zero.abs().to_bits(), 0);
    assert_eq!(min_subnormal.add(positive_zero).to_bits(), 1);
    assert_eq!(min_subnormal.mul(one).to_bits(), 1);
    assert_eq!(min_subnormal.div(one).to_bits(), 1);
    assert_eq!(min_subnormal.c_fmod(one).to_bits(), 1);
}

#[test]
fn manifest_and_production_sources_keep_the_consumer_zero_boundary() {
    let manifest = include_str!("../Cargo.toml");
    assert!(manifest.contains("publish = false"));
    assert!(manifest.contains("crate-type = [\"rlib\"]"));
    assert!(manifest.contains("autobins = false"));
    assert!(manifest.contains(
        "fpmath = { version = \"=0.1.1\", default-features = false, features = [\"soft-float\"] }"
    ));
    assert!(
        manifest.contains("rustc_apfloat = { version = \"=0.2.3\", default-features = false }")
    );
    for forbidden in [
        "serde",
        "[build-dependencies]",
        "[dev-dependencies]",
        "vivi-runtime-native-core",
        "vivi-runtime-native-evaluation-lowering",
        "vivi-runtime-native-c-abi",
        "vivi-runtime-native-wasm",
    ] {
        assert!(!manifest.contains(forbidden));
    }

    let library = include_str!("lib.rs");
    assert!(library.contains("#![no_std]"));
    assert!(library.contains("#![forbid(unsafe_code)]"));
    assert!(library.contains("exact 21-callable"));
    assert!(library.contains("does not implement checkpoints"));

    let binary64 = include_str!("binary64.rs");
    let transcendental = include_str!("transcendental.rs");
    for source in [binary64, transcendental] {
        for forbidden in [
            "f64::from_bits",
            "f64::to_bits",
            "SoftF64::to_host",
            "SoftF64::from_host",
            "mul_add",
            "ieee_rem",
            " as f64",
            " as f32",
            "serde",
            "std::",
            "alloc::",
            "Vec<",
            "String",
            "extern \"C\"",
            "#[no_mangle]",
        ] {
            assert!(
                !source.contains(forbidden),
                "forbidden source token: {forbidden}"
            );
        }
        for line in source.lines() {
            assert!(!line.trim_start().starts_with("pub "));
        }
    }
    assert_eq!(binary64.matches("Round::NearestTiesToEven").count(), 4);
    assert_eq!(binary64.matches("rustc_apfloat::Float::c_fmod(").count(), 1);
    assert_eq!(transcendental.matches("SoftF64::from_bits").count(), 6);
}

const APPROVED_VECTOR_SHA256_BYTES: [u8; 32] = [
    0x0a, 0x46, 0x7b, 0x96, 0xd9, 0x3e, 0xa0, 0xb7, 0xb8, 0xd1, 0x2f, 0x8b, 0x82, 0x29, 0xd0, 0x50,
    0xb5, 0x09, 0x45, 0xc4, 0x0f, 0xff, 0x29, 0xc8, 0xac, 0xe0, 0x46, 0x9b, 0x76, 0xcd, 0xec, 0x00,
];

const SHA256_ROUND_CONSTANTS: [u32; 64] = [
    0x428a_2f98,
    0x7137_4491,
    0xb5c0_fbcf,
    0xe9b5_dba5,
    0x3956_c25b,
    0x59f1_11f1,
    0x923f_82a4,
    0xab1c_5ed5,
    0xd807_aa98,
    0x1283_5b01,
    0x2431_85be,
    0x550c_7dc3,
    0x72be_5d74,
    0x80de_b1fe,
    0x9bdc_06a7,
    0xc19b_f174,
    0xe49b_69c1,
    0xefbe_4786,
    0x0fc1_9dc6,
    0x240c_a1cc,
    0x2de9_2c6f,
    0x4a74_84aa,
    0x5cb0_a9dc,
    0x76f9_88da,
    0x983e_5152,
    0xa831_c66d,
    0xb003_27c8,
    0xbf59_7fc7,
    0xc6e0_0bf3,
    0xd5a7_9147,
    0x06ca_6351,
    0x1429_2967,
    0x27b7_0a85,
    0x2e1b_2138,
    0x4d2c_6dfc,
    0x5338_0d13,
    0x650a_7354,
    0x766a_0abb,
    0x81c2_c92e,
    0x9272_2c85,
    0xa2bf_e8a1,
    0xa81a_664b,
    0xc24b_8b70,
    0xc76c_51a3,
    0xd192_e819,
    0xd699_0624,
    0xf40e_3585,
    0x106a_a070,
    0x19a4_c116,
    0x1e37_6c08,
    0x2748_774c,
    0x34b0_bcb5,
    0x391c_0cb3,
    0x4ed8_aa4a,
    0x5b9c_ca4f,
    0x682e_6ff3,
    0x748f_82ee,
    0x78a5_636f,
    0x84c8_7814,
    0x8cc7_0208,
    0x90be_fffa,
    0xa450_6ceb,
    0xbef9_a3f7,
    0xc671_78f2,
];

fn sha256(input: &[u8]) -> [u8; 32] {
    let mut state = [
        0x6a09_e667,
        0xbb67_ae85,
        0x3c6e_f372,
        0xa54f_f53a,
        0x510e_527f,
        0x9b05_688c,
        0x1f83_d9ab,
        0x5be0_cd19,
    ];

    let complete_bytes = input.len() / 64 * 64;
    for block in input[..complete_bytes].chunks_exact(64) {
        sha256_compress(&mut state, block);
    }

    let remainder = &input[complete_bytes..];
    let padded_length = if remainder.len() < 56 { 64 } else { 128 };
    let mut padded = [0_u8; 128];
    padded[..remainder.len()].copy_from_slice(remainder);
    padded[remainder.len()] = 0x80;
    let bit_length = (input.len() as u64) * 8;
    padded[padded_length - 8..padded_length].copy_from_slice(&bit_length.to_be_bytes());
    for block in padded[..padded_length].chunks_exact(64) {
        sha256_compress(&mut state, block);
    }

    let mut digest = [0_u8; 32];
    for (chunk, word) in digest.chunks_exact_mut(4).zip(state) {
        chunk.copy_from_slice(&word.to_be_bytes());
    }
    digest
}

fn sha256_compress(state: &mut [u32; 8], block: &[u8]) {
    let mut schedule = [0_u32; 64];
    for (index, word) in schedule[..16].iter_mut().enumerate() {
        let offset = index * 4;
        *word = u32::from_be_bytes(
            block[offset..offset + 4]
                .try_into()
                .expect("four-byte SHA-256 word"),
        );
    }
    for index in 16..64 {
        let s0 = schedule[index - 15].rotate_right(7)
            ^ schedule[index - 15].rotate_right(18)
            ^ (schedule[index - 15] >> 3);
        let s1 = schedule[index - 2].rotate_right(17)
            ^ schedule[index - 2].rotate_right(19)
            ^ (schedule[index - 2] >> 10);
        schedule[index] = schedule[index - 16]
            .wrapping_add(s0)
            .wrapping_add(schedule[index - 7])
            .wrapping_add(s1);
    }

    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for index in 0..64 {
        let choose = (e & f) ^ (!e & g);
        let majority = (a & b) ^ (a & c) ^ (b & c);
        let upper_a = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let upper_e = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let first = h
            .wrapping_add(upper_e)
            .wrapping_add(choose)
            .wrapping_add(SHA256_ROUND_CONSTANTS[index])
            .wrapping_add(schedule[index]);
        let second = upper_a.wrapping_add(majority);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(first);
        d = c;
        c = b;
        b = a;
        a = first.wrapping_add(second);
    }

    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}
