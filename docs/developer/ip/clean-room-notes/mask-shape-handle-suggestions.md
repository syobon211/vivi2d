---
id: mask-shape-handle-suggestions
title: Mask Shape Handle Suggestions Clean-Room Note
status: publicOssAllowed
author: Codex
reviewer: Claude Opus / GPT-style review
created: 2026-05-18
sourcesRead:
  - docs/developer/ip/policy.md
  - docs/developer/quality/docs-migration-manifest.json
sourcesAvoided:
  - third-party source code for rigging, mesh deformation, skeletonization, medial-axis, geodesic, MLS, ARAP, Live2D/Cubism, and Inochi2D implementations
  - model files, datasets, weights, screenshots, or generated assets from third-party products
implementationPaths:
  - packages/editor-core/src/motion-handle-suggestions.ts
  - packages/editor-core/src/local-motion.ts
  - packages/editor-core/src/__tests__/motion-handle-suggestions.test.ts
  - packages/editor-core/src/__tests__/local-motion.test.ts
releaseSurfaces:
  - public OSS source tree
  - public docs
  - examples
  - fixtures
  - dist bundles
  - workflow recordings
  - npm package tarballs
---

# Mask Shape Handle Suggestions Clean-Room Note

This note defines the only implementation shape currently allowed for Vivi2D
mask-shape handle suggestions. It is an engineering control, not legal advice.

The goal is to suggest a root point and a tip point for manually accepted split
layers, so Auto Setup can create safer local bones, rigid ownership, or
secondary-motion guides. The feature must remain a controller-rig authoring
helper. It must not save solver names, preview geometry, mesh vertex deltas,
parameter-indexed shape data, cage/lattice data, or pose tables.

## Current Status

`status: publicOssAllowed`.

This means the bounded implementation described in this note may be committed
to tracked public OSS source. The approval is narrow: it covers only the
plain-mask handle suggestion helper and fixtures listed in `implementationPaths`.
Any broader shape analysis, preview geometry, generated weight algorithm, or
advanced path metric needs a separate clean-room record before implementation.
The narrow scaling bridge in `local-motion.ts` is editor-only integration glue:
the core suggestion algorithm remains the bounded helper in
`motion-handle-suggestions.ts`, while broader local-motion preview machinery
stays governed by the internal-only local motion record.

## Public Name

Use Vivi2D-owned user-facing terms:

- `handle suggestion`
- `root suggestion`
- `tip suggestion`
- `review needed`
- `low confidence`

Do not use public UI/API names such as:

- `skeleton`
- `medial axis`
- `geodesic`
- `distance transform`
- `signed distance field`
- `SDF`
- `BBW`
- `bounded biharmonic`
- `harmonic coordinates`
- `Laplacian`
- `PCA`
- `principal axis`
- `shape direction`
- `covariance`
- `eigenvector`
- `image moment`
- `mask moment`
- `MLS`
- `ARAP`
- `solver`
- `deformer`
- `shape key`
- `keyform`
- `blend shape`
- `vertex delta`

Internal implementation comments should also avoid algorithm-brand vocabulary
unless the term is part of this note or an internal-only test explaining a
rejection gate.

## Adopted Algorithm Scope

The allowed first implementation is deliberately small and clean-room:

1. **Mask validation**
   - Accept an alpha mask view: width, height, and a binary-only
     `Uint8Array | Uint8ClampedArray`.
   - Reject empty, non-finite, dimension-mismatched, or oversized inputs.
   - Consume `MotionSemanticPolicy`; never decide motion kind independently.
   - Hard ceilings:
     - `maxWidth = 4096`
     - `maxHeight = 4096`
     - `maxPixels = 4_194_304`
     - `maxComponents = 256`
     - `maxBoundarySamples = 256`
     - `maxContextRects = 32`
   - If the raw mask exceeds any hard ceiling, return a rejected/low-confidence
     result before allocating component queues.

2. **Connected-component summary**
   - Count foreground pixels using a fixed alpha threshold.
   - Flood-fill connected components with 4-neighbor adjacency.
   - Select the largest component as the suggestion region.
   - Emit a `multiLobeMask` warning if other components exceed the policy
     threshold.
   - Component queues and visited buffers are implementation details. They must
     not appear in returned suggestions, snapshots, workflow recordings, public
     fixtures, or persisted project metadata.

3. **Boundary sampling**
   - A foreground pixel is boundary-like if at least one 4-neighbor is outside
     the component or outside the image.
   - Sample at most a fixed number of boundary points deterministically by
     stepping through boundary pixels in row-major order.
   - No imported polygon, contour, medial-axis, or skeleton implementation.

4. **Principal-axis summary**
   - Compute centroid and covariance from foreground pixels.
   - Compute the 2D principal axis with closed-form symmetric 2x2 eigenvector
     math implemented directly.
   - Use it only as one scoring feature; do not expose it publicly.
   - Public docs, UI, API, errors, test names, snapshots, telemetry, and
     workflow artifacts must not mention `PCA`, `principal axis`, `covariance`,
     `eigenvector`, or `moment`. Public copy uses "shape direction hint" only.

5. **Adjacency scoring**
   - Input may include safe semantic context rectangles for head, face, body,
     parent layer, or attachment candidates.
   - Score root candidates by policy priority:
     `headAdjacent`, `faceAdjacent`, `parentLayerAdjacent`, `attachmentPoint`,
     `top`, `inner`, `center`.
   - Adjacency is measured by Euclidean distance from boundary candidates to
     context rectangles. This is a simple geometric distance, not a learned
     model or third-party implementation.

6. **Tip scoring**
   - Score tip candidates from the same boundary samples.
   - Prefer policy-defined priorities:
     `farthestFromRoot`, `downward`, `outward`, `longAxisEnd`, `manualReview`.
   - `farthestFromRoot` is Euclidean distance over sampled boundary points for
     the first public implementation. Do not implement geodesic, skeleton, or
     medial-axis variants in this slice.

7. **Confidence and warnings**
   - Return confidence as a closed bucket: `low`, `medium`, or `high`.
   - Low confidence does not block model export; it requires user review before
     Auto Setup may apply suggested local motion.
   - Round masks, small masks, multi-lobe masks, protected/face-adjacent
     accessories, and weak adjacency produce warnings.

This first implementation intentionally does **not** include:

- distance transform
- medial-axis or skeleton extraction
- geodesic distance
- graph shortest paths
- MLS/ARAP/constrained affine preview
- BBW generation
- any learned model

These can be proposed later as separate clean-room records, but they are not
part of this promotion.

## Data Boundary

The suggestion helper returns a three-state discriminated union. Rejected
inputs do not return root/tip points, and review-required candidates cannot be
passed to automatic apply paths by type:

```ts
type MotionHandleSuggestionResult =
  | {
      status: "apply";
      regionId: string;
      role: LayerSemanticRole;
      root: SuggestedHandlePoint;
      tip: SuggestedHandlePoint;
      confidence: "high";
      autoApplicable: true;
      warnings: readonly [];
      reasons: readonly MotionHandleSuggestionReason[];
    }
  | {
      status: "review";
      regionId: string;
      role: LayerSemanticRole;
      root: SuggestedHandlePoint;
      tip: SuggestedHandlePoint | null;
      confidence: "low" | "medium";
      autoApplicable: false;
      warnings: readonly MotionHandleSuggestionWarning[];
      reasons: readonly MotionHandleSuggestionReason[];
    }
  | {
      status: "rejected";
      regionId?: string;
      role?: LayerSemanticRole;
      confidence: "low";
      autoApplicable: false;
      warnings: readonly MotionHandleSuggestionWarning[];
      reasons: readonly MotionHandleSuggestionReason[];
    };

interface SuggestedHandlePoint {
  x: number;
  y: number;
  source: "boundarySample" | "centroidFallback" | "manualReview";
}
```

`status: "rejected"` is required for oversized input, strict-shape validation failure,
invalid alpha buffers, invalid context rectangles, incompatible dimensions, or
any path where a safe root cannot be computed. Implementations must not return
`(0, 0)`, center fallback, or any synthetic root/tip for invalid input. Auto
Setup automatic apply may consume only `status: "apply"` results. Results with
`status: "review"` may be displayed and edited, but must be converted into a
user-reviewed accepted handle before Auto Setup can compile them into a managed
rig plan.

Review results are not compile inputs. A reviewed suggestion must cross an
explicit user-acceptance boundary first:

```ts
interface UserAcceptedMotionHandle {
  kind: "userAcceptedMotionHandle";
  id: string;
  regionId: string;
  role: LayerSemanticRole;
  root: SuggestedHandlePoint;
  tip: SuggestedHandlePoint | null;
  acceptedAt: string;
  sourceMaskFingerprint: `sha256:v1:${string}`;
  acceptedMaskFingerprint?: `maskAlpha:v1:${string}`;
  semanticPolicyId: string;
  semanticPolicyVersion: number;
  motionBudgetBucket: "none" | "low" | "medium" | "high";
  acceptedFromSuggestionStatus: "review" | "apply";
}
```

When this boundary is implemented in UI, it must compare the current source
fingerprint, accepted mask alpha fingerprint, and semantic policy version
against the suggestion source before creating managed rig operations.

`status: "apply"` is allowed only when all are true:

- the suggestion was computed from `inputSource: "acceptedManualMask"`
- confidence is `high`
- no `manualReviewRequired`, `lowConfidence`, `weakAdjacency`,
  `protectedFaceAdjacent`, `roundMask`, or `multiLobeMask` warning is present
- semantic policy allows secondary motion or skinned motion without explicit
  user opt-in
- root and tip are both inside mask bounds
- root/tip distance exceeds the small-mask threshold

All other valid suggestions use `status: "review"` and
`autoApplicable: false`.

`MotionHandleSuggestionWarning` is a closed enum only:

```ts
type MotionHandleSuggestionWarning =
  | "roundMask"
  | "smallMask"
  | "multiLobeMask"
  | "protectedFaceAdjacent"
  | "weakAdjacency"
  | "lowConfidence"
  | "manualReviewRequired";
```

No free-form warnings, numeric details, component counts, boundary samples, or
internal scoring values may be returned. If implementation code needs raw
numeric scores for local debugging, it must keep them in non-exported local
variables and must not include them in snapshots, telemetry, logs, workflow
recordings, or persisted data.

`MotionHandleSuggestionReason` is also a closed enum only:

```ts
type MotionHandleSuggestionReason =
  | "strongSafeAdjacency"
  | "clearBoundaryDirection"
  | "rolePolicyMatched"
  | "manualReviewRecommended"
  | "protectedAreaNearby"
  | "ambiguousShape"
  | "inputRejected";
```

UI text is generated only through localized enum-to-copy maps. Raw algorithmic
or debug reasons must not be returned, logged, snapshotted, recorded, or
persisted.

Allowed persisted output after user acceptance:

- bones
- static skin weights
- physics groups
- scalar motion budget settings
- managed signatures and source fingerprints

Forbidden persisted/public output:

- solver names
- algorithm names
- preview geometry
- deformed vertices
- per-parameter vertex positions
- per-parameter vertex offsets
- cage/lattice states
- pose tables
- full boundary samples
- component pixel lists
- PCA/covariance internals
- internal scores
- component counts
- raw confidence values

If a user accepts a suggestion, the persistent model stores only the safe rig
objects created from it. The suggestion itself is editor authoring state and is
not part of the public runtime contract.

Managed signatures and source fingerprints may include only:

- source texture/content hash
- source layer id
- source layer semantic role
- semantic policy id/version
- accepted root/tip handle coordinates after user review
- scalar motion budget bucket

Managed signatures and source fingerprints must not include:

- boundary sample lists
- component pixel lists
- component counts
- internal scoring values
- shape direction internals
- covariance/eigenvector/moment values
- private warning/debug strings

## Security And Robustness Rules

- All numeric inputs must be finite.
- Width/height and pixel counts must be bounded by code-defined limits.
- Output points must be clamped inside mask bounds.
- Iteration must be deterministic and row-major; no randomness.
- The function must allocate O(mask pixels) memory or less.
- No recursion for flood fill; use an explicit queue.
- Public SDK/runtime packages must not import the helper.
- Provider artifacts must not carry handle suggestions directly. Providers may
  propose masks only; handle suggestions are recomputed inside editor-core from
  accepted user-owned masks.
- The public helper input must be narrowed to plain accepted-mask data:

```ts
interface MotionHandleSuggestionInput {
  regionId: string;
  role: LayerSemanticRole;
  inputSource: "acceptedManualMask" | "regionBoundsPseudoMask";
  mask: {
    width: number;
    height: number;
    alpha: Uint8Array | Uint8ClampedArray;
  };
  semanticPolicy: MotionSemanticPolicy;
  contextRects?: readonly MotionHandleSuggestionContextRect[];
}
```

The helper must not accept provider proposal objects, provider metadata,
workflow artifacts, layer graph nodes, or untrusted project objects directly.
Callers must project those sources into the narrow input shape first.

`createMotionHandleDraftFromProject()` may receive accepted manual masks through
editor-only options. Those masks are keyed by split layer id or manual mask id
and must represent the actual accepted split-layer alpha, not a generated
provider proposal or a bounds-only rectangle. The app may derive this alpha from
the user-owned split layer texture, but only as a narrow `{ width, height,
alpha, fingerprint }` projection. The fingerprint is a local editor stale-data
guard for the accepted alpha bytes; it is not a runtime contract and must not
carry algorithm internals. If no accepted mask is available, editor-core may use
a region-bounds pseudo mask for review visualization only.

Accepted mask texture dimensions may differ from the current displayed layer
bounds after a user resizes a layer. In that case, suggestion computation uses
mask-local coordinates and editor-core scales root/tip output and semantic
context rectangles between mask-local space and displayed layer bounds. Invalid
accepted masks, such as mismatched alpha byte length or unsupported buffers, are
rejected. They must not silently fall back to the bounds-only pseudo mask.

Only `inputSource: "acceptedManualMask"` may produce `status: "apply"`.
`inputSource: "regionBoundsPseudoMask"` is a temporary editor fallback for
systems that know only layer bounds; it may produce at most `status: "review"`
and must never compile directly into Auto Setup root/tip bones.

The Auto Setup review UI may show safe aggregate motion stress checks derived
from the suggestion contract, such as protected-region proximity, duplicate
contour risk, and hidden reveal risk. These checks are scalar warnings only.
They must not persist preview geometry, solver output, or algorithm names.

The implementation must validate this shape at runtime, not only through
TypeScript:

- reject unknown top-level fields
- reject unknown `mask` fields
- reject unknown context-rect fields
- reject non-plain objects and accessors/getters
- reject symbol keys
- reject provider provenance fields such as `providerId`, `proposalId`,
  `capabilityId`, `requestToken`, `metadata`, or `artifact`

`alpha` is the only non-plain object allowed in the narrow input shape:

- `alpha` must be `Uint8Array` or `Uint8ClampedArray`.
- `Array`, sparse array, plain object, non-Uint8 typed arrays, and accessor
  objects are rejected.
- `width` and `height` must be positive safe integers.
- `width * height <= maxPixels`.
- `alpha.byteLength === width * height`.
- `SharedArrayBuffer`, detached buffers, and caller-owned mutable views that
  cannot be copied are rejected.
- After validation, implementation must copy alpha into an internal
  `Uint8Array` before analysis so caller mutation cannot change the result.

Runtime validation failure must return the same closed warning/error shape as
other rejected suggestions. It must not throw or log raw object keys, component
counts, dimensions, scoring internals, or provider metadata into public
workflow artifacts.

All rejection and low-confidence paths map to closed warnings:

| Condition | Warning mapping |
| --- | --- |
| oversized width/height/pixel count | `manualReviewRequired`, `lowConfidence` |
| too many components | `multiLobeMask`, `manualReviewRequired` |
| too many boundary samples before downsampling | `manualReviewRequired` |
| too many context rectangles | `weakAdjacency`, `manualReviewRequired` |
| empty or tiny mask | `smallMask`, `lowConfidence` |
| round/ambiguous mask | `roundMask`, `lowConfidence` |
| protected face-adjacent accessory | `protectedFaceAdjacent`, `manualReviewRequired` |
| strict-shape validation failure | `manualReviewRequired`, `lowConfidence` |

No rejection path may surface free-form exception text to the UI, telemetry,
workflow recording, fixture snapshot, or persisted project data.

## Test Fixture Rules

Tests may assert only public/editor-core output contract fields:

- accepted root/tip coordinates
- confidence bucket
- closed warning enum values
- role and region id

Tests must not snapshot or assert:

- boundary samples
- component pixel lists
- component counts
- covariance/eigenvector/moment values
- raw numeric scoring features
- debug traces
- provider metadata

Negative tests may include forbidden terms only when the path is reviewed by
the private marker scanner allowlist.

## Release Promotion Criteria

Promote from `researchOnly` to `publicOssAllowed` only if all are true:

1. Claude and GPT-style review have no P1/P2 findings for IP, public API,
   security, and OSS maintainability.
2. The implementation scope stays within the adopted algorithm scope above.
3. `scripts/internal-contracts/clean-room-coverage.contract.json` lists the
   implementation paths and does not permit any additional algorithm markers.
4. `npm run check:clean-room-coverage` passes.
5. `npm run check:local-motion-private-markers` passes.
6. `npm run check:architecture-boundaries` proves public packages cannot import
   the helper.
7. Tests cover:
   - front hair root near head context
   - side hair tip outward
   - tail root near body/parent context
   - ribbon/accessory low confidence when attachment is ambiguous
   - round blob low confidence
   - multi-lobe mask warning
   - protected face/eye/mouth rigid default
   - no persistent solver/preview/deformation fields
   - no returned raw scoring, component, or shape-direction internals
8. `npm run check:quality` passes.

## Review Decision Log

- 2026-05-18: Initial note created as `researchOnly`. Implementation is blocked
  until external review returns no P1/P2 findings and the status is promoted.
- 2026-05-18: Promoted to `publicOssAllowed` after Claude and GPT-style
  reviews returned no remaining P1/P2 findings for the bounded helper contract,
  closed warning/reason enums, typed-array alpha boundary, and three-state
  apply/review/rejected result shape.
