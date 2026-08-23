# Runtime Spec v1

This document is the implementation-facing Runtime Spec. It records the current
v1 contract that conformance fixtures and runtime packages must target.

## Version

- Runtime Spec version: `1.0.0`
- Public profile: `publicProfileV1`
- Root package status: pre-1.0; this spec is not a shipped compatibility
  promise until the runtime package is published.

## Public Runtime Surface

Runtime v1 evaluates public Vivi2D playback data:

- scalar parameters
- expression presets that set scalar parameters
- `viviMesh`, group, and bone layer data
- texture atlas metadata
- static linear blend skinning
- parameter binding points for bones and IK controllers
- two-bone and CCD IK
- deterministic pendulum physics
- culling, draw order, mesh snapshots, and collider hit testing

Clip playback and state-machine control are reserved for a future Runtime Spec
v1.x extension. The current TypeScript facade keeps those method names so hosts
can feature-detect them, but they return `VIVI_ERR_UNSUPPORTED_OPERATION` and
are not part of the v1 conformance suite.

Runtime v1 rejects private-profile deformation features such as parameter-indexed
mesh vertex deltas, lattice/cage/mesh-link data, morph targets, corrective
deformation data, and animation tracks that directly mutate mesh vertices.

### Runtime ABI 0.2 feature build: clip masks

The Runtime ABI 0.2 feature build gives the public version 10 wire field
`clipMaskIds` rendering meaning without changing that wire format. A non-empty
ordered `clipMaskIds` array on a `viviMesh` layer names the mask-source mesh
layers for that target. Each ID is lowered to a non-inverted mask edge in array
order, and the runtime emits nested `BEGIN_MASK` commands, the target
`DRAW_MESH`, and matching `END_MASK` commands. The active depth after a begin
must not exceed the canonical `VIVI_RUNTIME_LIMITS.maxMaskDepth` value of `8`.
This fixed ceiling is not added to the ABI 0.1 `ViviRuntimeLimits` structure and
is not caller-configurable through that structure or the TypeScript
`RuntimeLimitOverrides` options.

A successfully loaded model with a non-empty mask dependency advertises the
ABI 0.2 draw-command required-render-feature bit. On that ABI 0.2 runtime, the
three inherited ABI 0.1 mesh APIs (`vivi_model_mesh_count`,
`vivi_model_mesh_snapshot`, and `vivi_model_mesh_snapshot_by_id`) fail closed
with `VIVI_ERR_RENDER_FEATURE_REQUIRED`; an unaware legacy host cannot silently
render the model without its masks. Models that do not require draw commands
continue to produce the same legacy mesh results.

The default ABI 0.1 build and the WASM runtime remain isolated from this ABI 0.2
feature. They do not expose the new symbols or activate draw-command lowering;
the legacy constructor continues to ignore `clipMaskIds` as it did before this
feature. The ABI 0.2 loader accepts the public version 10 profile's
`clipMaskIds` but does not accept the editor-only `clipMasks`/INVERT wire
representation.

The ABI 0.2 loader also fails closed on malformed render topology that had no
defined ABI 0.1 behavior. This includes duplicate mesh IDs, mask fields on
non-mesh layers, and a `clipMaskIds` value that is not an array of unique,
non-empty string IDs. Such inputs return `VIVI_ERR_DRAW_COMMANDS_INVALID`;
missing references and cyclic mask dependencies use the same status, while an
active mask depth greater than `8` returns `VIVI_ERR_LIMIT_EXCEEDED`. This
strictness does not change the result for valid unmasked models.

## Canonical Constants

The machine-readable constants are exposed from
`packages/core/src/runtime-spec.ts` and have their single definition in
`packages/model/src/runtime-spec.ts`:

- `VIVI_RUNTIME_SPEC_V1_VERSION`
- `VIVI_RUNTIME_SPEC_VERSION`
- `VIVI_RUNTIME_LIMITS`
- `VIVI_RUNTIME_TIMING`
- `VIVI_RUNTIME_TOLERANCES`
- `VIVI_BLEND_MODE`
- `VIVI_RUNTIME_ERROR_CODES`
- forbidden private-profile marker lists
- ignored Auto Setup metadata keys

Language bindings may expose idiomatic errors, but conformance compares against
the canonical error-code catalog.

## Reference Implementation

The TypeScript reference runtime is exposed through `ViviRuntime` in
`packages/core/src/runtime.ts`. It wraps `PublicViviModel` and provides a stable
facade for:

- loading public `ViviFileData`
- scalar input mutation with canonical errors
- parameter, texture, expression preset, render-list, mesh-snapshot, and hit-test
  queries
- update stepping with validated delta time

The facade intentionally hides editor project mutation from host code. WASM and
C ABI implementations must match the facade through the conformance suite
before any public native, WASM, or C ABI release.

The current C ABI surface remains private. Its default 0.1 header lives under
`packages/runtime-c-abi/`, and feature-gated native implementation slices exist
under `packages/runtime-native/`. Neither the tracked header nor those internal
implementation slices create a public ABI support promise; a selected version
must match this specification through the conformance suite before promotion.

Current implementation note: `RuntimeModel.update()` snapshots the
`PublicViviModel` runtime state before evaluation and restores that snapshot if
evaluation fails, then maps the failure to `VIVI_ERR_EVALUATION`.
Mesh vertex snapshots are copy-on-commit so host-retained snapshots are not
partially mutated by a failed update. A mesh snapshot also carries the layer
translation fields `x` and `y` so renderers can position unskinned meshes
without reading editor-layer structures.

## Conformance Scope

Phase 0 conformance fixtures live under `tests/conformance/runtime-v1/`.
`manifest.json` is the canonical ordered fixture registry for every runtime
implementation. The shared adapter runner is
`tests/conformance/runtime-v1/runner.ts`. The
TypeScript reference test in
`packages/runtime/src/__tests__/runtime-conformance.test.ts` adapts
`RuntimeModel` to that runner through the narrow `@vivi2d/runtime` package
boundary. WASM and future C ABI bindings must consume the same fixture data and
runner contract rather than duplicating expected snapshots in
implementation-specific tests.

Required fixture categories include minimal models, single mesh snapshots, draw
order, skinning, IK, physics, bindings, expression presets, colliders,
private-profile rejection, and limit failures.

Current shared fixtures:

- `basic-mesh.fixture.json`: host atlas metadata, scalar input clamping,
  expression preset application, mesh snapshot, and mesh collider hit testing.
- `binding-skinning.fixture.json`: public bone parameter binding and static
  linear blend skinning.
- `ik-two-bone.fixture.json`: two-bone IK evaluated through skinned mesh output.
- `physics-pendulum.fixture.json`: deterministic pendulum physics with scalar
  input/output mapping.
- `draw-hit-culling.fixture.json`: multiple meshes, layer translation snapshots,
  draw order, public blend modes, culling, rectangle hits, circle hits, and
  hidden mesh hit rejection.
- `private-profile-raw-key.fixture.json`: structural rejection of private
  deformation markers.
- `limit-max-meshes.fixture.json`: host-overridden resource-limit rejection.
- `texture-missing-atlas-entry.fixture.json`: texture rejection for meshes that
  cannot resolve to an atlas entry.
- `texture-duplicate-atlas-entry.fixture.json`: texture rejection for meshes
  with multiple atlas entries.
