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
- root `requires`: absent in canonical producer output; a future consumer rule
  may accept an empty array only as a noncanonical alias that canonicalizes to
  absence;
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

The profile excludes animation and scenes, state machines, physics, colliders, offscreen
targets, extended blend modes, inverted masks, provider metadata, referenced
Assets, and extensions. The exact field set, defaults, bounds, and fixture
manifest remain an adoption gate. This paragraph alone is not a machine-readable
profile overlay.

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

The current implementation validates and preserves an optional UUID but does not
implement this assignment, migration, clone, collision, or product-save policy.
Those behaviors require fixtures before adoption.

## Bounded JSON And Canonical Output

The current reference foundation supplies these candidate global ceilings:

| Limit | Candidate value | Current gap |
| --- | ---: | --- |
| UTF-8 input bytes | 134,217,728 | The ordinary Windows writer is not connected to this profile. |
| Container depth | 64 | A portable manifest must include exact boundary vectors. |
| JSON tokens | 8,000,000 | Programmatic serialization must enforce an equivalent pre-allocation budget. |
| Decoded UTF-8 bytes in one string | 67,108,864 | A portable manifest must include exact boundary vectors. |
| Embedded extension blob bytes | 16,777,216 | Extensions are excluded from the base profile. |
| Aggregate canonical `extensions` map bytes | 16,777,216 | Extensions are excluded from the base profile. |
| Chunk-manifest logical bytes | 68,719,476,736 | Referenced Assets are excluded from the base profile. |

The adopted contract MUST also freeze Project collection, atlas count, decoded
PNG bytes, pixel count, per-axis dimension, atlas-entry count, mesh count, and
aggregate media ceilings. Those limits are not complete in the current Project
schema and therefore remain open.

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

Base64 canonicality is also open. The current validator accepts some encodings
with non-zero pad bits that decode to the same bytes. Adoption MUST either
require canonical RFC 4648 spelling, including zero pad bits, or explicitly
permit aliases and define their canonical output. The conformance corpus must
cover the selected rule.

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

Current requirement derivation inspects root `clips` and `stateMachines` but
does not account for clips nested in `scenes`. The base profile therefore
requires both `scenes` and `sceneBlends` to be empty. Any later scene-bearing
profile must first fix the derivation rule and add hostile fixtures proving that
animation cannot pass without its required capability.

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

The current Project schema types declared atlas dimensions as unbounded JSON
`number` values. Stage-2 semantic validation additionally requires them to be
finite and positive. The foundation also checks base64 shape, stable atlas IDs,
entry bounds, and mesh coverage. It does not yet
perform the complete PNG, IHDR, integer-dimension, decoded-budget, atlas-count,
or aggregate-budget validation above. The public exchange gate therefore remains
open.

Referenced mode is a later extension. Before it is added, Asset Model must be
the single normative owner of `AssetRef`, digest, size, blob/chunk-manifest,
closure, and resolution semantics. The currently duplicated Project and Asset
schema shapes require a normative schema import or a machine-enforced semantic
parity gate. Independent copies may not evolve as separate public authorities.

## Migration, Save, And Downgrade

Adoption requires an explicit normal-path migration rather than treating the
internal codec as a product connection:

1. Validate the source under its original version and profile.
2. Apply a reviewed v9/v10-to-v11 migration with stable layer, atlas, parameter,
   and document identities.
3. Assign or preserve `documentId` according to this draft.
4. Validate the candidate base profile, including inline media.
5. Canonically serialize and independently reparse before publication.
6. Preserve the v11 carrier on ordinary save. Do not minimize the adopted
   profile back to v10 or silently emit the current v9 writer format.

Downgrade from this profile is not an ordinary save operation. A future explicit
export to an older format must declare its loss model, reject unsupported data,
use separate fixtures, and never replace the source document silently.

Legacy acceptance rules for versions 1 through 10 remain their own contract.
Publishing a v11 profile must not broaden, narrow, or reinterpret those accepted
sets accidentally.

## Conformance Ownership

The current golden JSON vectors and unit tests are valuable implementation
evidence, but they are not yet a portable Project profile corpus. P1 requires a
tracked versioned manifest that owns exact input bytes, expected canonical
bytes, expected classification, stable error code and path, and applicable
limit boundary for every case.

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

| Gate | Required evidence | Current state |
| --- | --- | --- |
| P1-PROFILE | Narrow machine-readable v11 embedded profile and exact mandatory core | Open |
| P1-ID | `documentId` assignment, preservation, fork, collision, and migration fixtures | Open |
| P1-JSON | Language-neutral canonical JSON and base64 rules with boundary vectors | Open |
| P1-LIMIT | Complete parse, collection, atlas, decoded-media, and serialization budgets | Open |
| P1-ERROR | Stable stage and within-stage precedence, code, path, and multi-fault vectors | Open |
| A1-PNG | Portable strict PNG subset, IHDR match, budgets, and hostile fixtures | Open |
| P1-ASSET | Single `AssetRef` owner or machine-enforced parity for later referenced mode | Open; not needed for the base embedded claim |
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
