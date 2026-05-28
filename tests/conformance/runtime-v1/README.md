# Runtime v1 Conformance Fixtures

These fixtures define the shared Runtime Spec v1 behavior for the TypeScript
reference runtime, future WASM runtimes, and future native bindings.

## Format

Each `*.fixture.json` file contains:

- `name`: stable fixture identifier.
- `description`: short human-readable purpose.
- `fileData`: public `ViviFileData` payload.
- `runtimeOptions`: optional host limits or runtime options.
- `actions`: optional ordered calls such as `setInput`, `applyExpressionPreset`,
  and `update`.
- `expect`: expected runtime snapshots for success fixtures.
- `expectError`: canonical `VIVI_ERR_*` code for rejection fixtures.

Fixtures are synthetic and must not contain third-party artwork, generated
private-profile deformation data, or product-specific compatibility payloads.

`manifest.json` is the canonical fixture registry. Every `*.fixture.json` file
must be listed in the manifest, and every manifest entry must point to an
existing fixture. The runner validates this before executing fixtures so future
runtime implementations share the same ordered suite.

## Current Coverage

| Fixture | Category | Expected result |
| --- | --- | --- |
| `basic-mesh.fixture.json` | Minimal mesh, host atlas, scalar input, expression preset, mesh hit test | Success |
| `binding-skinning.fixture.json` | Parameter binding and static linear blend skinning | Success |
| `draw-hit-culling.fixture.json` | Draw order, blend modes, culling, rectangle/circle hit testing | Success |
| `ik-two-bone.fixture.json` | Two-bone IK through skinned mesh output | Success |
| `physics-pendulum.fixture.json` | Deterministic pendulum physics scalar output | Success |
| `limit-max-meshes.fixture.json` | Host structural limit rejection | `VIVI_ERR_LIMIT_EXCEEDED` |
| `private-profile-raw-key.fixture.json` | Private-profile raw marker rejection | `VIVI_ERR_PRIVATE_PROFILE` |
| `texture-missing-atlas-entry.fixture.json` | Mesh without runtime atlas entry rejection | `VIVI_ERR_TEXTURE` |
| `texture-duplicate-atlas-entry.fixture.json` | Mesh with duplicate runtime atlas entries rejection | `VIVI_ERR_TEXTURE` |

## Runner Contract

`runner.ts` is adapter-based. Runtime implementations provide an adapter with
load, mutation, query, update, and hit-test methods. The runner owns comparison
rules and tolerance handling so implementation packages do not duplicate
expected snapshots. Fixture order comes from `manifest.json`, not directory
enumeration.
