# IP and License Policy

This policy is an engineering control, not legal advice. Legal review is still
required before public release.

## Repository License

The root project currently uses Apache-2.0. Apache-2.0 includes a patent grant
from contributors for their contributions, but it does not grant rights to
unrelated third-party patents. It also includes patent-license termination
conditions for certain patent litigation.

## ComfyUI and See-through

- ComfyUI is GPL-3.0.
- ComfyUI provider plugins must not be treated as automatically covered by the
  root Apache-2.0 distribution.
- Before public release, maintainers must decide whether ComfyUI-side code is:
  - moved to a separate repository
  - kept in a separately licensed subtree
  - replaced by a pure HTTP/provider contract with no bundled ComfyUI-side code
- The pure provider contract is the cleanest default for the Apache-2.0
  editor/runtime distribution unless legal review approves another path.
- The current default is repo separation: this repository owns the provider
  protocol/client; provider plugins live outside this repository.
- Do not bundle See-through source, model weights, or derivative assets without
  explicit license and patent review.

## Assets

Do not commit assets unless provenance is recorded:

- character art
- PSD files
- model weights
- generated images or videos
- audio files
- screenshots containing third-party art
- sample projects

Generated local visual fixtures should stay out of git unless rights are clear.

`npm run check:license-policy` blocks prohibited production dependency license
patterns and verifies that release notices describe provider plugins as
external, non-bundled artifacts.
`npm run check:ip-markers` blocks tracked local-character markers from entering
the public tree; local experiments belong in ignored `docs/backlog/` material.
`npm run check:ip-product-profile`, `npm run check:release-surface`, and
`npm run check:pack-contents` guard the public package/documentation surface.

## Algorithms

For each non-trivial algorithm based on a paper, project, or external product,
record:

- source
- license or publication details
- implementation approach
- whether code was copied, translated, or clean-room implemented
- patent review status

Current release-review notes:

- Auto Setup mesh generation is limited to deterministic alpha-boundary
  topology creation. It creates mesh topology only and must not create
  parameter-indexed vertex-delta states.
- Auto Setup skinning may use rigid assignment, distance weights, or bounded
  biharmonic weights for explicit bones only. BBW use references Jacobson et al.
  2011 and remains pending counsel/FTO review.
- Owner release decision for `v0.1.0-alpha.1`: the legacy BBW implementation may
  remain in the public source tree only under the explicit
  `sourcePublicationQuarantine` record in
  `scripts/internal-contracts/clean-room-coverage.contract.json`. This is not a
  patent clearance and does not promote BBW to a public API, runtime contract,
  package export, documentation promise, or commercial feature. Before BBW is
  exposed beyond quarantined editor-side alpha source, maintainers must either
  complete counsel/FTO review and promote the record to `publicOssAllowed`, or
  remove the implementation from the public branch.
- `delaunator@5.1.0` is pinned through `package-lock.json` for triangulation
  and is ISC-licensed. `robust-predicates@3.0.3` is pulled transitively and is
  Unlicense. Dependency upgrades that affect topology or weights require
  fixture review.
- Auto Setup output is routed through `SafeAutoSetupPlan` validation and may
  generate layers, bones, static skins, physics groups, and controller
  parameters. It must not generate private-profile deformation structures.
- Auto Setup-managed controller bindings may drive bones or IK controller values
  only. They are the public-profile replacement for removed shape-key,
  corrective, lattice, and mesh-link authoring surfaces; they must not target
  mesh vertices, cage vertices, or stored pose deltas.
- Safe Auto Setup plans use `planVersion: 1`, include source fingerprints with
  role-dictionary and auto-mesh preset versions, and can include texture RGBA
  content hashes when layer canvases are available. Managed generated objects
  are excluded from the source fingerprint so re-running setup does not treat
  its own bones as source artwork changes.
- Auto Setup-managed bones, parameters, meshes, skins, physics groups, and
  bindings store `managedSignature` and `managedSourceFingerprint`. Reapply
  skips managed objects whose live signature differs from the generated
  signature or whose source fingerprint does not match.
- Public runtime skinning evaluates static skin weights as model data. The
  runtime contract should not require a specific skin-weight generation
  algorithm. BBW, heat, distance, or manual weighting belong to authoring/setup
  review, while runtime playback is limited to explicit bone transforms and
  linear blend skinning over stored weights.
- Public runtime IK currently uses a clean-room implementation of standard
  two-bone analytic IK and cyclic coordinate descent for longer chains. Runtime
  Spec work must record the solver choice, equations, and references before the
  IK behavior becomes a stable public contract.
- Public runtime physics currently uses deterministic pendulum chains with a
  fixed timestep and semi-implicit Euler-style angular integration. Runtime Spec
  work must record the equations, timestep, limit behavior, and clean-room
  implementation notes before the physics behavior becomes a stable public
  contract.
- Runtime Spec publication needs an explicit spec/documentation license and
  legal review before encouraging independent third-party implementations.
- Viewer Action System, Viewer API, Prop System, and Tracking Calibration must
  remain scalar/controller/viewer-scene features. They may drive parameters,
  bones, IK targets, props, effects, recording, and bridge presets, but must not
  expose public APIs for parameter-indexed mesh vertex deltas, lattice/cage
  controls, path deltas, or shape-state interpolation.
- Viewer bridge actions must be named as Vivi2D-owned `bridgeCommand`
  capabilities with narrow scopes such as `bridge:scene`; they must not copy a
  third-party plugin protocol envelope or expose raw method passthrough.
- Imported viewer configs and actions may bind only to code-defined action and
  bridge schemas. They must not introduce new executable bridge methods,
  forbidden action capabilities, raw script payloads without user review, or
  private-profile deformation targets.
- Viewer props are overlay scene objects, not model layers. They must not be
  inserted into model texture atlases, saved as model data, or used to generate
  private-profile deformation structures.
- Tracking calibration is public-profile safe only while it remains finite
  scalar signal conditioning: neutral offset, deadzone, range mapping, curves,
  clamping, inversion, and smoothing. It must not learn, store, or interpolate
  mesh/lattice/path shape states.

## Public Product Profile

The public release profile is `publicProfileV1`. Public load, save, export,
viewer, and web-component paths must reject or fail closed on private-profile
deformation structures before runtime hydration:

- parameter-driven vertex-delta authoring data
- expression preset non-parameter weights
- non-controller animation tracks
- inter-mesh deformation links
- lattice/cage deformer layers
- parameter bindings to lattice/cage targets
- parameter-to-path delta bindings

Internal experiments may exist only behind private build/profile boundaries and
must not appear in public package exports, public npm tarballs, public bundles,
or public documentation.

## Public Copy

- Avoid implying affiliation with third-party tools or brands.
- Use factual interoperability language.
- Avoid trademarked product names in package names, app titles, and marketing
  headings unless reviewed.
- Prefer Vivi2D-owned terminology in public APIs and docs: `ViviMesh`,
  `controller rig`, `binding point`, and `common 2D rig parameter alias`.
- Prefer Vivi2D-owned parameter IDs such as `vivi.head.yaw`,
  `vivi.mouth.open`, and `vivi.eye.leftOpen` in examples and defaults.
- Parameter-driven public features should drive controller values such as bones
  and IK targets, rather than storing parameter-indexed mesh vertex deltas.
- Avoid describing third-party naming conventions as product standards in public
  copy unless compatibility review explicitly approves it.
