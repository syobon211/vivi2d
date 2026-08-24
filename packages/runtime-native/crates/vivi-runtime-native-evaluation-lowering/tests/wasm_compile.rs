#![cfg(not(target_arch = "wasm32"))]

// Native-only compile-driver evidence. The emitted repository-external rlib is
// neither host-run nor represented as a product WASM surface.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const PROBE_TEMPLATE: &str = r###"
// The four production modules below only need these external types and
// functions at their signatures. The stubs are deliberately inert: this
// harness tests the actual lowering source for wasm32 code generation without
// copying or executing its census, reservation, or materialization logic.
extern crate self as serde_json;
extern crate self as vivi_runtime_native_preactivation;

use std::collections::BTreeMap;

pub type Map<K, V> = BTreeMap<K, V>;

pub enum Value {
    Null,
    Bool(bool),
    U64(u64),
    F64(f64),
    String(String),
    Array(Vec<Value>),
    Object(Map<String, Value>),
}

impl Value {
    pub fn as_object(&self) -> Option<&Map<String, Value>> {
        match self {
            Self::Object(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Self::Array(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(value) => Some(value),
            _ => None,
        }
    }

    pub const fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(value) => Some(*value),
            _ => None,
        }
    }

    pub const fn as_f64(&self) -> Option<f64> {
        match self {
            Self::F64(value) => Some(*value),
            Self::U64(value) => Some(*value as f64),
            _ => None,
        }
    }

    pub const fn as_u64(&self) -> Option<u64> {
        match self {
            Self::U64(value) => Some(*value),
            _ => None,
        }
    }
}

pub struct ValidatedEvaluationPayloadV1 {
    generation: u64,
    value: Value,
}

impl ValidatedEvaluationPayloadV1 {
    pub const fn request_generation(&self) -> u64 {
        self.generation
    }

    pub const fn value(&self) -> &Value {
        &self.value
    }
}

pub struct EvaluationTextureBindingV1;

pub struct EvaluationTexturePlanV1 {
    pub textures: Vec<EvaluationTextureBindingV1>,
}

#[derive(Clone, Copy)]
pub enum EvaluationPreactivationErrorKind {
    Correlation,
    ResourceLimitExceeded,
    InvalidTexturePlan,
    Asset,
    Store,
    Internal,
}

#[derive(Clone, Copy)]
pub struct EvaluationPreactivationError {
    kind: EvaluationPreactivationErrorKind,
}

impl EvaluationPreactivationError {
    pub const fn kind(self) -> EvaluationPreactivationErrorKind {
        self.kind
    }
}

pub struct CorrelatedEvaluationActivationV1 {
    candidate: ValidatedEvaluationPayloadV1,
    texture_plan: EvaluationTexturePlanV1,
}

impl CorrelatedEvaluationActivationV1 {
    pub const fn request_generation(&self) -> u64 {
        self.candidate.request_generation()
    }

    pub fn into_parts(self) -> (ValidatedEvaluationPayloadV1, EvaluationTexturePlanV1) {
        (self.candidate, self.texture_plan)
    }
}

pub fn correlate_evaluation_activation_v1(
    _request_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    texture_plan: EvaluationTexturePlanV1,
) -> Result<CorrelatedEvaluationActivationV1, EvaluationPreactivationError> {
    Ok(CorrelatedEvaluationActivationV1 {
        candidate,
        texture_plan,
    })
}

#[path = r#"__ERROR_RS__"#]
pub mod error;
#[path = r#"__MODEL_RS__"#]
pub mod model;
#[path = r#"__RESERVATION_RS__"#]
mod reservation;
#[path = r#"__LOWER_RS__"#]
mod lower;

// These retained Rust-function-pointer statics make the actual public entry,
// its complete private call graph, public getters/error methods, and the
// low-level reservation surface codegen-reachable.
#[used]
pub static ACTUAL_PUBLIC_ENTRY_CODEGEN_ROOT: fn(
    u64,
    ValidatedEvaluationPayloadV1,
    EvaluationTexturePlanV1,
) -> Result<model::EvaluationLoweringFoundationV1, error::EvaluationLoweringError> =
    lower::lower_evaluation_foundation_v1;

fn probe_actual_public_surface(
    candidate: ValidatedEvaluationPayloadV1,
    plan: EvaluationTexturePlanV1,
) -> (i32, u32, u64, usize, usize, usize, usize, usize) {
    match lower::lower_evaluation_foundation_v1(0, candidate, plan) {
        Ok(foundation) => (
            0,
            u32::MAX,
            foundation.request_generation(),
            foundation.texture_binding_count(),
            foundation.mesh_count(),
            foundation.direct_projected_scalar_count(),
            foundation.derived_evaluation_mesh_count(),
            foundation.mask_edge_count(),
        ),
        Err(error) => (
            error.load_status(),
            error.kind() as u32,
            0,
            0,
            0,
            0,
            0,
            0,
        ),
    }
}

#[used]
pub static ACTUAL_PUBLIC_SURFACE_CODEGEN_ROOT: fn(
    ValidatedEvaluationPayloadV1,
    EvaluationTexturePlanV1,
) -> (i32, u32, u64, usize, usize, usize, usize, usize) = probe_actual_public_surface;

fn probe_actual_reservation_surface(
    ordered_counts: [u32; 39],
) -> i32 {
    let result = reservation::Category9SiteCountsV1::try_from_ordered(ordered_counts)
        .and_then(|counts| {
            let buffers = reservation::Category9ReservationBuffersV1::reserve_all(&counts)?;
            let (plan, capacities) = buffers.finish(
                model::InlinePhysicsGroupV1::default(),
                model::InlineIkControllerV1::default(),
            );
            reservation::Category9ReservationBuffersV1::verify_plan(
                &plan,
                &counts,
                &capacities,
            )
        });
    result.map_or_else(|error| error.load_status(), |()| 0)
}

#[used]
pub static ACTUAL_RESERVATION_CODEGEN_ROOT: fn([u32; 39]) -> i32 =
    probe_actual_reservation_surface;
"###;

struct ExternalTempDir {
    path: PathBuf,
}

impl ExternalTempDir {
    fn create() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is after the Unix epoch")
            .as_nanos();
        let path = env::temp_dir().join(format!(
            "vivi2d-category9-wasm-compile-{}-{nonce}",
            std::process::id()
        ));
        assert!(
            !path.starts_with(Path::new(env!("CARGO_MANIFEST_DIR"))),
            "wasm compile output must be repository-external"
        );
        fs::create_dir(&path).expect("create unique external probe directory");
        Self { path }
    }
}

impl Drop for ExternalTempDir {
    fn drop(&mut self) {
        let expected_prefix = format!("vivi2d-category9-wasm-compile-{}-", std::process::id());
        if self
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(&expected_prefix))
        {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

fn source_path(path: &Path) -> &str {
    let path = path.to_str().expect("workspace source path is UTF-8");
    assert!(
        !path.contains("\"#"),
        "source path is safe for a raw literal"
    );
    path
}

fn pinned_rustc_1_89() -> PathBuf {
    let located = Command::new("rustup")
        .args(["which", "--toolchain", "1.89.0", "rustc"])
        .output()
        .expect("rustup locates pinned rustc 1.89.0");
    assert!(
        located.status.success(),
        "rustup could not locate rustc 1.89.0:\n{}",
        String::from_utf8_lossy(&located.stderr)
    );
    let rustc = PathBuf::from(
        String::from_utf8(located.stdout)
            .expect("rustup path is UTF-8")
            .trim(),
    );
    let version = Command::new(&rustc)
        .arg("--version")
        .output()
        .expect("run pinned rustc --version");
    assert!(version.status.success(), "pinned rustc --version succeeds");
    assert!(
        String::from_utf8_lossy(&version.stdout).starts_with("rustc 1.89.0 "),
        "unexpected pinned compiler: {}",
        String::from_utf8_lossy(&version.stdout)
    );
    rustc
}

#[test]
fn actual_lowering_sources_compile_for_wasm32_without_a_product_surface_claim() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sources = manifest.join("src");
    let error_rs = sources.join("error.rs");
    let model_rs = sources.join("model.rs");
    let reservation_rs = sources.join("reservation.rs");
    let lower_rs = sources.join("lower.rs");
    for source in [&error_rs, &model_rs, &reservation_rs, &lower_rs] {
        assert!(
            source.is_file(),
            "actual lowering source exists: {source:?}"
        );
    }

    let probe = PROBE_TEMPLATE
        .replace("__ERROR_RS__", source_path(&error_rs))
        .replace("__MODEL_RS__", source_path(&model_rs))
        .replace("__RESERVATION_RS__", source_path(&reservation_rs))
        .replace("__LOWER_RS__", source_path(&lower_rs));
    let temporary = ExternalTempDir::create();
    let probe_rs = temporary.path.join("category9_wasm_probe.rs");
    let artifact = temporary.path.join("category9_wasm_probe.rlib");
    fs::write(&probe_rs, probe).expect("write repository-external probe source");

    // No synthetic target_arch cfg is supplied. rustc receives only the
    // standard wasm32-unknown-unknown target configuration and this artifact is
    // never host-run or represented as a product WASM surface.
    let output = Command::new(pinned_rustc_1_89())
        .arg("--edition=2024")
        .args(["--target", "wasm32-unknown-unknown"])
        .arg("-Dwarnings")
        .arg("--crate-type=lib")
        .arg("--crate-name=category9_wasm_compile_probe")
        .arg(&probe_rs)
        .arg("-o")
        .arg(&artifact)
        .output()
        .expect("invoke pinned rustc for wasm32-unknown-unknown");
    assert!(
        output.status.success(),
        "actual Category 9 sources failed wasm32 compilation:\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        artifact.metadata().expect("probe artifact metadata").len() > 0,
        "rustc emitted a nonempty repository-external compile artifact"
    );
}
