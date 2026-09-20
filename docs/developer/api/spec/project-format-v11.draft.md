# Project Format v11 Public Authoring Profile (Review Draft)

## Status And Authority

- Status: tracked public review draft; not normative, not published, and not
  implemented by the ordinary Windows save path.
- Scope: the Project-owned rules needed for the base offline `.vivi`
  `document-round-trip` claim in the
  [Multiplatform Exchange Profile v1 draft](./multiplatform-exchange-profile-v1.draft.md).
- This document does not promote the internal Project Format v11 implementation,
  freeze a compatibility promise, or authorize implementation, migration,
  release, repository, cloud, private-product, purchase, deployment, or
  publication work.
- The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe a candidate
  contract to be reviewed. They do not describe current product behavior.
- Project may move from `internal foundation` to `public draft` in the
  [contract status matrix](../../architecture/multiplatform-contract-status.md)
  only after the profile, machine schema, limits, errors, fixtures, and
  conformance ownership listed here are reviewable as one pinned bundle.

The tracked schema currently carries `x-vivi-status: approved-amendment-1`.
That value records an internal design amendment. It is not a public compatibility
approval and does not supersede this document's status.

## Ownership Boundary

Project owns the following externally observable document behavior:

- the `.vivi` carrier, selected Project version, root profile, and canonical JSON;
- `documentId` syntax and authoring-document identity lifecycle;
- migration, downgrade, ordinary-save, and read-only duplicate behavior;
- the `requires` envelope, deterministic derivation and ordering of requirement
  declarations, compatibility classification, and preservation outcome;
- completeness and validity of the base inline-atlas carrier; and
- Project parse, schema, semantic, compatibility, media, limit, and error
  precedence rules.

Project does not own these neighboring contracts:

| Domain | Normative owner | Project responsibility at the boundary |
| --- | --- | --- |
| Referenced objects, digests, blob or chunk-manifest closure, resolution, and transfer | Asset | Select an approved Asset contract version and apply only Project-specific placement constraints. Project must not independently redefine `AssetRef`. |
| Authoring-to-runtime payload, texture plan, lowerability, and model-ready sealing | Evaluation | Supply a valid Project document and consume an explicit Evaluation result. Project compatibility does not prove Evaluation support. |
| Runtime execution semantics, supported runtime capabilities, ABI layout, lifetime, errors, and execution conformance | Runtime Spec and Runtime ABI | Carry versioned requirements without copying their execution meaning. |
| Revision identity, accounts, authorization, conflict resolution, and remote state | Sync | Preserve `documentId` while treating every Sync revision as a separate identity. |
| Private app UI, host integration, packaging, signing, and distribution | The separately verified private product repository | Consume an approved public Project contract without becoming its authority. |

An extension owner may define its own extension schema and capability meaning.
Project still owns the extension envelope, canonical preservation, and the rule
that unsupported content is never silently changed.

## Current Public Repository Facts

The implementation foundation and the ordinary application path are different:

| Surface | Current fact |
| --- | --- |
| Ordinary Windows writer | Emits Project version 9. |
| Ordinary parser and runtime model | Accept Project versions 1 through 10. |
| Project Format v11 | Available only through an internal model subpath and read-only authoring host seam. |
| Ordinary v11 editing and save | Not connected. |
| Embedded round-trip candidate | Internal validator, explicit v9/v10 migration and fork, consumed by synthetic model/conformance tests; not an ordinary application save path. |
| Portable or independent consumer | No approved consumer has passed a public corpus. |

The following tracked artifacts are review inputs, not public promises:

- [Project Format v11 machine schema](../../../../packages/model/src/project-format-v11/project-format-v11.schema.json),
  schema ID `https://vivi2d.com/spec/project-format-v11.schema.json`, 56,486
  UTF-8 bytes, SHA-256
  `a6aa7d36ca39505e69fa8ae5a1283cd949104703db92e671c435bbfa03e203bc`;
- the internal schema pin and status check in
  [`schema.ts`](../../../../packages/model/src/project-format-v11/schema.ts);
- the bounded JSON contract in
  [`json-contract.ts`](../../../../packages/model/src/project-format-v11/json-contract.ts);
- the current semantic error vocabulary in
  [`errors.ts`](../../../../packages/model/src/project-format-v11/errors.ts);
- the semantic and compatibility reference in
  [`semantic.ts`](../../../../packages/model/src/project-format-v11/semantic.ts);
- the canonical parse, ordinary-save, and local-duplicate reference in
  [`codec.ts`](../../../../packages/model/src/project-format-v11/codec.ts); and
- the current tracked
  [golden JSON vectors](../../../../packages/model/src/__tests__/fixtures/project-format-v11-golden.json),
  8,220 UTF-8 bytes, SHA-256
  `dc3203f3eef2dd6c6e42e60f8b719e88dcf893066d60cc3fb8ced23705a505ac`.

- [`embedded-round-trip-profile.ts`](../../../../packages/model/src/project-format-v11/embedded-round-trip-profile.ts)
  and [`legacy-to-embedded-round-trip.ts`](../../../../packages/model/src/project-format-v11/legacy-to-embedded-round-trip.ts)
  implement the narrow internal candidate described below, through the existing
  internal model friend only;
- the shared [embedded round-trip manifest](../../../../tests/conformance/project-embedded-round-trip-v11/manifest.json)
  binds 32 synthetic PNG cases and three document inputs/canonical outputs,
  29,361 bytes, SHA-256
  `d9803f48ac6911130d8baf36b605fc8ea9dee57bf8acbc01b4886c92788b79d4`.

Source code and tests may demonstrate current behavior, but they do not replace
an adopted language-neutral rule or a versioned portable conformance manifest.

## Candidate Base Profile

The working label `vivi2d.projectFormat.v11.embeddedRoundTrip.draft1` identifies
this review candidate only. It is not a wire field or an adopted profile ID.

The candidate base profile has all of these constraints:

- carrier: one `.vivi` file containing UTF-8 JSON;
- root `version`: exactly `11`;
- root `assetMode`: exactly `embedded`;
- root `documentId`: required and encoded as a lowercase canonical UUIDv4;
- root `profile`: absent, because the current v11 schema forbids it;
- root `requires`: absent, including rejection of an empty array; this first
  candidate introduces no alias;
- root `extensions` and `embeddedAssets`: absent;
- referenced `AssetRef` values and chunk-manifest Assets: absent;
- every atlas needed by the Project: present inline as PNG data with a stable,
  unique atlas identifier; and
- `clips`, `stateMachines`, `scenes`, and `sceneBlends`: empty, with no feature
  that derives a render or edit requirement in the initial editable fixture
  set.

The mandatory editable core is nonempty. Its intended scope is document and
canvas metadata; stable nested group, drawable-mesh, and bone identities; basic
transforms, visibility, and opacity; mesh topology, UVs, skin weights, and
inline-atlas mapping; parameter definitions; public-safe bone and IK bindings;
and the `normal`, `add`, `multiply`, and `screen` blend modes.

The candidate excludes nonempty animation, scenes, state machines, physics,
colliders, offscreen targets and expression presets, along with art-path layers,
extended blend modes, inverted masks, provider/provenance metadata, referenced
Assets and extensions. Fields outside the closed allowlist are rejected even
when their value is empty, false or null; they are not stripped during
serialization. Allowed containers that are required to be empty remain permitted. A fixed
closed field traversal in `checkCandidateProfile` supplies the machine-readable
equivalent overlay without changing the broader pinned schema. The selected
candidate rules below are implemented internal evidence, not public adoption.

The machine-readable allowlist must also exclude local path, provenance, and
provider-oriented fields that are present in the broader authoring model but are
not part of the portable core. Their absence must be enforced rather than
achieved by silently stripping them during export.

The complete internal v11 schema is broader than this candidate: it also covers
legacy versions, referenced Assets, extensions, and advanced authoring data.
Before adoption, a tracked machine-readable profile overlay or equivalent
validator MUST distinguish this narrow profile from the broader internal schema.

## `documentId` Lifecycle

`documentId` identifies an authoring document, not its current state. The
candidate lifecycle is:

1. An explicit legacy-to-v11 migration assigns a UUIDv4 when no durable Project
   document identity exists.
2. No-op serialization and every supported edit preserve that UUID.
3. An operation explicitly defined as creating an independent document or fork
   assigns a new UUID. Merely copying bytes does not establish a new identity.
4. Two payloads with the same UUID may still be divergent. Consumers must not
   infer freshness, ancestry, authorization, or equality from the UUID.
5. A UUID is never a Sync revision ID, account ID, authorization principal,
   content digest, or proof of ownership.

The broader codec still permits an optional UUID. The narrow candidate requires
a lowercase UUIDv4 and implements explicit caller-supplied migration and fork
operations; it does not generate random IDs, maintain a collision registry or
connect product save. Validation preserves the supplied document identity.
Supported edits are complete documents revalidated by the same function; callers
must preserve identity unless explicitly forking. Matching IDs do not prove
equal contents, ancestry, authorization or ownership.

## Bounded JSON And Canonical Output

The current reference foundation supplies these candidate global ceilings:

| Limit | Candidate value | Current gap |
| --- | ---: | --- |
| UTF-8 input bytes | 134,217,728 | The ordinary Windows writer is not connected to this profile. |
| Container depth | 64 | A portable manifest must include exact boundary vectors. |
| JSON tokens | 8,000,000 | The internal TS canonicalizer enforces an equivalent output budget; portable boundary fixtures remain open. |
| Decoded UTF-8 bytes in one string | 67,108,864 | A portable manifest must include exact boundary vectors. |
| Embedded extension blob bytes | 16,777,216 | Extensions are excluded from the base profile. |
| Aggregate canonical `extensions` map bytes | 16,777,216 | Extensions are excluded from the base profile. |
| Chunk-manifest logical bytes | 68,719,476,736 | Referenced Assets are excluded from the base profile. |

The adopted contract MUST also freeze Project collection, atlas count, decoded
PNG bytes, pixel count, per-axis dimension, atlas-entry count, mesh count, and
aggregate media ceilings. The narrow candidate enforces the fixed overlay limits
below; the complete cross-language adoption and boundary corpus remain open.

The internal TS canonicalizer charges cumulative UTF-8 output bytes and lexical
tokens before constructing escaped strings or joining complete child output.
Canonical number spelling can be longer than accepted input spelling, so an
input within the byte ceiling can still be rejected when its canonical output
would exceed that ceiling. Reflection arrays, small number strings, and accepted
prefixes may still allocate; this is not an allocation-free or OOM guarantee.
This reference implementation does not adopt the portable profile or connect the
ordinary Windows writer.

Candidate input and output behavior:

- reject a UTF-8 BOM, malformed UTF-8, lone surrogate, duplicate decoded key,
  invalid JSON number, non-finite programmatic number, unsafe integer, excessive
  depth, excessive token count, excessive string, and over-limit input;
- accept bounded schema-valid JSON whose only noncanonical differences are
  permitted whitespace and property order, then canonicalize it before further
  processing;
- normalize negative zero to zero and emit deterministic object-key ordering,
  escaping, number spelling, and array order;
- emit no BOM, insignificant whitespace, or terminal newline in canonical
  document bytes;
- require producers to emit canonical JSON; and
- reject accessors, sparse arrays, cycles, and non-data object properties in a
  programmatic value before serialization.

The precise cross-language key-order and number-spelling algorithm MUST be
frozen in the owning specification and portable fixtures. The current
TypeScript implementation and golden vectors are reference evidence only.
The current codec records a canonical source snapshot but performs semantic
validation against the parsed object's existing insertion order. That current
split is not authority for deterministic within-stage error selection and must
be resolved or covered by precedence fixtures before promotion.

The broader decoder preserves its existing base64 accepted set, including some
nonzero-pad-bit aliases. The narrow candidate rejects noncanonical alphabet,
padding and unused pad bits before its PNG port is called. It does not change
ordinary legacy loading or rewrite the broader codec's accepted set. This
implemented choice and its focused vectors do not alone promote P1-JSON.

## Validation Stages And Error Selection

Every conforming consumer must reach the same terminal classification and stable
Project error for the same input. The proposed outer stage order is:

1. carrier byte limit, BOM, and fatal UTF-8 decoding;
2. JSON grammar, scalar, duplicate-key, depth, token, string, and number rules;
3. machine-schema validation;
4. Project semantic graph, identity, reference, atlas-coverage, and envelope
   validation;
5. requirement derivation and compatibility classification; and
6. inline-media decoding, declared-metadata comparison, and media budgets.

The adopted contract MUST freeze both inter-stage precedence and deterministic
selection within a stage. It must define stable error code, JSON path, and
diagnostic-redaction behavior. The existing implementation's observable order
and current codes are evidence, not sufficient language-neutral authority.
Those codes are currently distributed across the JSON contract, semantic error
module, schema mapping, and codec serialization path, with more than one naming
style. P1-ERROR requires one reviewed public registry or an explicit mapping;
this draft does not silently declare the distributed implementation vocabulary
stable.

At minimum, the portable corpus must include simultaneous-fault vectors. A
consumer must not rely on object iteration order, validator-library issue order,
filesystem order, or decoder-specific wording to select the reported error.

#### Implemented Internal Embedded Candidate

The label `vivi2d.projectFormat.v11.embeddedRoundTrip.draft1` is result metadata,
not an on-wire field or published compatibility identifier. The three internal
operations are `validateEmbeddedRoundTripV11`,
`migrateLegacyToEmbeddedRoundTripV11` and `forkEmbeddedRoundTripV11`. Success
returns the document identity and owned canonical UTF-8 bytes, not a live codec
object or a reusable validation token. The package root is unchanged.

The exact closed field sets are in `checkCandidateProfile`, layered on the
existing schema and semantic validator. Group, mesh and bone layers, parameters,
skins, bone/IK bindings and the four base blend modes are retained. Unknown keys
are rejected at their static parent; map keys never become diagnostic paths.
Project v11 required fields remain required. Only the existing writer's absent
optional arrays (`parameterBindings`, `sceneBlends`, `ikControllers`,
`offscreenTargets`, `expressionPresets`) become empty arrays. An included
lipsync configuration must be exactly the inert existing six-field object:
`enabled:false`, `targetParameterId:null`, `source:"microphone"`,
`threshold:0.02`, `smoothing:0.7`, `gain:2`. Nondefault excluded data is not erased.
Noninverted `clipMasks` uses the existing canonical `clipMaskIds` representation;
both spellings together or an inverted edge are rejected by the existing rules.

Document IDs use canonical lowercase UUIDv4. Layer/bone/binding/controller IDs
use `[A-Za-z0-9_-]{1,128}`, parameter IDs additionally allow `.`, and atlas IDs
use `[A-Za-z0-9_-]{1,120}`. Names and parameter-group labels are limited to 1,024
UTF-8 bytes. Existing nested IDs and numeric semantics are not renamed, clamped
or quantized. Canvas and atlas dimensions are positive safe integers; atlas
entry origins are nonnegative safe integers with positive extents; mesh
subdivisions are nonnegative safe integers and draw order is signed 32-bit.

| Candidate-owned limit | Ceiling |
| --- | ---: |
| Atlases | 32 |
| PNG width / height | 8,192 each |
| Pixels per PNG | 67,108,864 |
| PNG compressed bytes / base64 characters | 16,777,216 / 22,369,624 |
| Aggregate PNG compressed bytes | 67,108,864 |
| Aggregate declared RGBA bytes | 268,435,456 |
| Layers / meshes / bones / parameters / IK controllers | 4,096 / 1,024 / 1,024 / 2,048 / 256 |
| Vertices / indices per mesh | 65,536 / 196,608 |
| Bindings / aggregate binding points | 8,192 / 8,192 |
| Aggregate atlas entries | 1,024 |
| IK maximum iterations when present | 1,024 |

Skin-map/inverse-map and per-weight-row counts and IK bone-chain lengths are
also bounded by the 1,024-bone ceiling. Existing JSON limits remain unchanged.
All-atlas dimension, encoded-size and aggregate preflight completes before any
PNG callback; decoder success is still required. These bounds are not a total
process-memory or recoverable-OOM guarantee.

Candidate failure is exactly `{ok:false,code,path}`; it never includes raw input,
unknown keys, IDs, decoder messages or exception causes. The internal error
vocabulary is `PROJECT_CARRIER_INVALID`, `PROJECT_JSON_INVALID`,
`PROJECT_SCHEMA_INVALID`, `PROJECT_PROFILE_UNSUPPORTED`,
`PROJECT_LIMIT_EXCEEDED`, `PROJECT_SEMANTIC_INVALID`,
`PROJECT_PNG_MALFORMED`, `PROJECT_PNG_UNSUPPORTED`, `PROJECT_PNG_DIMENSION` and
`PROJECT_INTERNAL`. These are stable within this selected candidate, not a new
published registry for the broad codec.

Its order is bounded carrier/UTF-8, duplicate-aware JSON and canonical budget,
broad machine schema, fixed profile traversal and all-atlas budgets, canonical
semantic graph/full-compatibility validation, then each atlas's canonical base64,
mandatory full PNG verification and additional Project policy. Arrays traverse
in index order; map diagnostics stop at the static parent. Broad schema and
semantic failures use root paths instead of exposing their library diagnostics.
The writer reparses its output; the wrapper additionally compares canonical
output with the validated source under only the declared optional-array and
mask representation rules. It does not decode the same atlas twice for that
one validation call. Unexpected serialization or trusted-port failures return
`PROJECT_INTERNAL`.

## Capability And Preservation

Project owns the `requires` envelope, deterministic aggregation, canonical
ordering, version comparison, and the resulting `full`, `readOnly`, or `invalid`
classification. The contract that owns a capability owns its feature meaning:

- Asset owns `referencedAssets` identity and closure semantics;
- Runtime Spec owns runtime behavior for clips, state machines, blend modes, and
  masking;
- Evaluation owns whether the selected authoring data lowers into a complete
  model-ready payload; and
- an extension owner owns its versioned extension schema and meaning.

The base profile has no requirements, but later profiles must use a reviewed
capability registry. An implicit import of a live implementation constant, such
as a Runtime mask-depth limit, is not a stable public contract. Cross-owner
limits require an explicit version reference and a parity gate, or Project must
own a fixed document bound independently.

The current producer sorts requirement IDs by UTF-8 bytes and orders purposes as
`render`, then `edit`, while current semantic acceptance compares the input as a
set. The public rule must decide whether alternative input ordering is accepted
and canonicalized or rejected, then align the schema comment, implementation,
and fixtures. Implementation-local ordering is not authority.

The internal requirement derivation now includes both root `clips` and clips
nested in `scenes`, deriving `vivi.cap.clipPlayback` once even when both occur.
Focused host tests reject a missing declaration before either host Asset port, classify an
unsupported declared render requirement as invalid, and preserve supported
source through local duplication. Root `stateMachines` retains its own existing
requirement. This closes the known nested-animation omission, not scene-runtime
support or public conformance. The base profile still requires both `scenes` and
`sceneBlends` to be empty; a later scene-bearing profile needs its own adoption
and portable hostile fixtures.

For a structurally and semantically accepted document, compatibility behavior is:

1. unsupported render requirement: `invalid`; do not render, edit, or
   approximate silently;
2. unsupported edit-only requirement or permitted opaque extension:
   `readOnly`; do not emit an edited revision;
3. every requirement supported and no opaque content: `full`; ordinary save may
   proceed within the declared editable feature set.

Malformed structure, semantics, references, or media are rejected before a
compatibility result is returned. They must not be conflated with the
`compatibility: invalid` result produced for an accepted document whose render
requirement is unsupported.

A read-only consumer may emit only a lossless local duplicate permitted by the
Project contract. It must preserve the accepted canonical source and every
opaque envelope exactly under that rule. Ordinary save is allowed only from
`full` compatibility and must not silently drop, approximate, downgrade, or
reinterpret unsupported data.

Compatibility proves document handling only. It does not prove Evaluation
lowerability, Runtime execution, ABI support, Sync capability, or product
readiness.

## Inline Atlas Contract

The base file is self-contained, but its inline atlas set is not a
content-addressed Asset closure. The current atlas wire shape has no declared
content digest. A locally derived digest may identify conformance evidence or a
cache entry, but it is not an on-wire integrity assertion.

Before adoption, Project MUST define and implement one portable inline-PNG
profile covering all of these points:

- canonical base64 spelling and strict decode failure;
- PNG signature, chunk length and order, critical-chunk rules, CRC handling,
  exactly one valid IHDR, and the accepted bit-depth, color, interlace, and
  ancillary-chunk subset;
- positive integer declared dimensions that match decoded IHDR dimensions;
- stable unique atlas IDs, complete mesh atlas coverage, and bounded entry
  rectangles;
- per-atlas encoded and decoded bytes, width, height, pixels, entry count,
  atlas count, and aggregate budgets; and
- stable error code, path, precedence, and redaction for every failure class.

The broad schema still types declared atlas dimensions as JSON numbers and does
not itself perform full PNG decoding. The embedded candidate now supplies the
integer dimensions, count and aggregate limits above, and requires the trusted
pure `verifyPng` port on the exact owned bytes and declared dimensions. Success
must mean full bounded signature/chunk/CRC/order/zlib/filter decode and dimension
verification; an inspect-only check or caller validity flag is insufficient.
The model cannot establish that an arbitrary injected callback is honest.

The selected native decoding profile is 8-bit PNG color types 0, 2, 3, 4 and 6,
noninterlaced, with its existing strict structure and complete compressed-stream
rules. After native success, Project accepts IHDR/PLTE/tRNS/IDAT/IEND plus at
most one `sRGB` intent 0..3. Matching fallback `gAMA`/`cHRM` are allowed only with
`sRGB`: gamma 45455 and chromaticities
31270,32900,64000,33000,30000,60000,15000,6000. Color declarations precede any
PLTE/IDAT. Untagged samples are assumed sRGB with straight alpha for this
candidate; the decoder performs no gamma/ICC conversion. ICC, textual/EXIF,
unknown and other unselected metadata is rejected, not stripped or re-encoded.
This policy does not inspect images for sensitive text, imagery or hidden data.

Base64 noncanonical spelling fails before native decode. Native failure wins
over Project-only findings. After native success, malformed selected declarations
(length/order/duplicates/intent/zero gamma), framing, or PLTE after tRNS win over
unsupported metadata or fallback values, regardless of their relative order.
PNG errors use `/atlases/<index>/image`. The byte-pinned truecolor PLTE-after-tRNS
case intentionally records native success but Project `PROJECT_PNG_MALFORMED`;
these two authorities are not conflated.

The shared manifest has two consumers: TypeScript runs the real Project wrapper
using exact-byte/digest/dimension-bound recorded native outcomes; the Rust
`vivi-png-ref` test calls actual full `decode` for the same 32 PNG vectors and
compares RGBA or the native error. Both pin the complete manifest identity above.
These are distinct wrapper and native-decoder evidence, not an exercised
TypeScript-to-native production bridge, independent consumer or P2/C1 result.
The public exchange gate therefore remains open.

Referenced mode remains a later extension. Asset Model owns `AssetRef`, digest,
size, blob/chunk-manifest, closure, and resolution semantics. The existing
Project schema retains its self-contained `ViviAssetRefV11`,
`EmbeddableBlobAssetRefV11`, and `PngAssetRefV11` copies under an exact structural
drift test against Asset Model v1. Local references are expanded and only schema
`$comment` annotations are omitted; validation rules and array order stay exact.
Project applies its additional placement and semantic checks. This does not
establish general cross-language semantic parity, portable resolution or transfer,
nor admit referenced Assets into the embedded round-trip candidate.

## Migration, Save, And Downgrade

The implemented opt-in converter accepts only v9/v10 sources within the narrow
candidate. It does not migrate every legacy document or replace ordinary v9
save. It requires explicit source name, width and height, validates the original
duplicate-aware raw tree and narrow allowlist before normalization, retains the
existing raw public-profile guard when the original `publicProfileV1` marker is
present, and reuses existing v11 graph/ordinary-serialization rules. No stripping
Zod result becomes migration authority. The original ordinary parser and schema
remain unchanged.

Legacy atlas IDs are assigned once as `atlas-<source index>` by existing
normalization; emitted v11 atlas IDs then persist. Only the obsolete version
profile marker is removed, `documentId` is explicitly supplied, and the existing
writer supplies absent allowed empty/inert containers. Present unsupported data
is rejected. Complete v11/PNG validation follows conversion and returns new
owned bytes without overwriting the source.

Migration/fork first validates the supplied new UUID, before input parsing.
Invalid new UUID returns `PROJECT_PROFILE_UNSUPPORTED` at root. With a valid
argument, normal source validation runs; a fork then rejects equality with the
validated original UUID, also at root. No random/time ID generation, global
collision ownership, silent downgrade or default ordinary-save interception is
implemented. A byte copy retains identity and is not a fork.

Future ordinary-path adoption requires an explicit migration rather than
treating the internal codec as a product connection:

1. Validate the source under its original version and profile.
2. Apply a reviewed v9/v10-to-v11 migration with stable layer, atlas, parameter,
   and document identities.
3. Assign or preserve `documentId` according to this draft.
4. Validate the candidate base profile, including inline media.
5. Canonically serialize and independently reparse before publication.
6. Preserve an already adopted v11 carrier on ordinary save. Do not minimize it
   back to v10 or silently emit v9. This does not replace every ordinary Windows
   project with the narrow candidate.

Downgrade from this profile is not an ordinary save operation. A future explicit
export to an older format must declare its loss model, reject unsupported data,
use separate fixtures, and never replace the source document silently.

Legacy acceptance rules for versions 1 through 10 remain their own contract.
Publishing a v11 profile must not broaden, narrow, or reinterpret those accepted
sets accidentally.

## Conformance Ownership

The existing golden JSON vectors are supplemented by the byte-pinned shared
manifest and focused profile/migration/error-order tests above. The manifest
contains synthetic core-v11, legacy-v9 and legacy-v10 documents with exact input
and canonical bytes/hashes, and separates native PNG outcomes from Project
narrowing outcomes. This is bounded internal implementation evidence, not the
complete public P1 conformance corpus; the full adoption requirements below
remain the gate.

The minimum corpus must cover:

- one nonempty editable core document and every allowed core feature;
- canonical output and schema-valid alternative whitespace and key order;
- duplicate decoded keys, malformed UTF-8, lone surrogates, numeric boundaries,
  depth, token, string, and input-byte boundaries;
- every root/profile exclusion and v9/v10-to-v11 identity migration;
- no-op and supported-edit identity preservation, explicit fork identity, and
  forbidden downgrade;
- unsupported render, unsupported edit-only, opaque preservation, local
  duplicate, and mutation rejection;
- stable atlas IDs, missing and duplicate atlases, mesh coverage, base64 aliases,
  corrupt and truncated PNG, chunk and CRC failures, IHDR mismatch, dimension,
  pixel, per-atlas, count, and aggregate boundaries;
- simultaneous-fault precedence for every validation stage;
- scene-nested animation without a matching capability requirement; and
- Project-to-Asset schema ownership or parity when referenced mode is proposed.

Every result must identify the Project profile revision, schema bytes and
SHA-256, fixture-manifest bytes and SHA-256, implementation and target, editable
feature set, and whether the evidence is parse, canonicalization, round-trip,
portable execution, or product integration. These are separate claims.

## Promotion Gates

Internal implementation and focused fixtures now exist for the selected profile,
identity/migration, limits, coarse error mapping and PNG boundary; none of the
following rows is closed merely by that candidate or its local review.

| Gate | Required evidence | Current state |
| --- | --- | --- |
| P1-PROFILE | Narrow machine-readable v11 embedded profile and exact mandatory core | Open |
| P1-ID | `documentId` assignment, preservation, fork, collision, and migration fixtures | Open |
| P1-JSON | Language-neutral canonical JSON and base64 rules with boundary vectors | Open |
| P1-LIMIT | Complete parse, collection, atlas, decoded-media, and serialization budgets | Open |
| P1-ERROR | Stable stage and within-stage precedence, code, path, and multi-fault vectors | Open |
| A1-PNG | Portable strict PNG subset, IHDR match, budgets, and hostile fixtures | Open |
| P1-ASSET | Single `AssetRef` owner or machine-enforced parity for later referenced mode | Asset Model owns structure; Project copy drift is checked. Referenced-mode semantics and transfer remain separate gates. |
| P1-FIXTURE | Versioned portable manifest and public conformance runner | Open |
| P2-WINDOWS | Ordinary Windows import/export uses the adopted profile | Open |
| C1-CONSUMER | Independent non-Windows implementation passes the public corpus | Open |

Creating and tracking this review draft does not close any gate. The Project row
in the status matrix remains `internal foundation` until the public-draft
promotion bundle is reviewed atomically. Windows-to-iOS document interoperability
must not be claimed until P1, P2, A1, and C1 in the exchange profile pass.

## Public/Private Boundary

This Project contract, its machine schemas, fixtures, conformance runners, and
product-neutral results are public OSS material. Proprietary app source, UI,
host integration, Apple integration, packaging, identifiers, signing,
distribution configuration, and operational records remain outside this public
repository.

Private product code cannot substitute for a public fixture or normative rule.
It may consume an approved public Project version and report only
product-neutral conformance evidence. This draft grants no authority to begin
that implementation.
