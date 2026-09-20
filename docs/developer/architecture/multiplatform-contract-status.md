# Multiplatform Contract Status

This document inventories the public contract seams needed for interoperable
Vivi2D clients. It separates tracked implementation foundations from published
compatibility promises so that partial internal work is not mistaken for a
usable Windows-to-client contract.

## Status And Authority

- This is a public, secret-free status document approved for tracking by the
  project owner on 2026-08-23.
- It is descriptive, not normative. Normative rules belong in each contract's
  tracked specification, schema, fixtures, and conformance runner.
- It does not publish an internal package, freeze an API, authorize an
  implementation, or prove a proprietary product consumer.
- Reviewed local design artifacts that are not tracked in the public repository
  are evidence only. They are not durable public specifications and create no
  compatibility promise.
- [Runtime Spec v1](../api/spec/runtime-spec-v1.md) is an existing tracked
  runtime specification. It is distinct from the proposed Evaluation payload
  handoff and the unpublished native Runtime ABI discussed below.
- The tracked
  [Project Format v11 public authoring profile](../api/spec/project-format-v11.draft.md)
  is a review draft that inventories candidate Project-owned rules and open
  gates. It does not by itself promote the Project row to `public draft`.

The [public API status ledger](../quality/public-api-status.md) remains
authoritative for package publication status. The
[package boundary policy](../contributing/package-boundaries.md) remains
authoritative for public/private placement.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `proposed` | The responsibility is identified, but no tracked contract package or specification exists. |
| `internal foundation` | Tracked implementation, machine artifacts, or a pre-promotion review document exists, but the complete public-draft bundle is absent and the surface remains private/internal and incomplete. |
| `public draft` | The owning tracked specification, machine schema or header, fixtures, error and limit rules, and conformance ownership are reviewable together, but the bundle is not a stable compatibility promise. |
| `published` | The owning specification, implementation surface, fixtures, conformance evidence, and status ledger have been promoted together. |

No contract in the matrix below is currently `published` for multiplatform
exchange.

## Summary Matrix

| Contract | Current status | Tracked foundation | Current product connection | Publication and exchange blockers |
| --- | --- | --- | --- | --- |
| Project | `internal foundation` | v1-v10 parser/types; internal v11 schema/codec/graph rules; narrow embedded round-trip validator, explicit v9/v10 migration/fork and shared synthetic PNG/document evidence | Ordinary Windows save emits v9; normal parser/runtime accepts through v10; v11 candidate is internal and not connected to ordinary save | Review/promote the complete language-neutral profile and conformance bundle; supply real production PNG wiring; connect adopted Windows load/save and prove an independent consumer |
| Asset | `internal foundation` | Asset Model v1 schema plus native resolver, principal-bound local store, local host foundations and Project structural drift gate | Native/local only; no public bridge, network transfer, Sync client, capability advertisement, or product activation path | Maintain Asset-owned structure and Project copy parity; publish remaining bounds/errors/closure rules; add portable resolver and transfer conformance |
| Evaluation | `internal foundation` | Internal payload and texture-plan schemas/builder, native validation and preactivation, and lowering categories 1-9 | Read-only authoring projection only; no complete model-ready evaluator or product runtime connection | Complete categories 10-11, connect deterministic math, seal model-ready output, publish schemas/capabilities/errors/fixtures, and prove execution parity |
| Runtime ABI | `internal foundation` | Tracked ABI 0.1 header and an opt-in native ABI 0.2 implementation slice | Internal packages only; ABI 0.2 public header and Evaluation load entry point are not tracked public surfaces | Publish one versioned header; complete Evaluation loading, ownership/lifetime/error/generation rules, exports, host tests, and supported-target execution evidence |
| Sync | `internal foundation` | One internal model-local embedded-revision preparation and deterministic CAS/idempotency/conflict candidate with focused fixtures | No Sync client, durable outbox, account/authorization policy, service, transfer or deployment | Define/publish the full protocol; implement durable object/receipt retention, authenticated scope, transactional persistence, transfer/offline recovery/privacy lifecycle and multi-client evidence |
| Job | `internal foundation` | Existing in-process Provider SDK plus the internal local six-state attempt/renewal/result/acceptance candidate and focused fixtures | No durable Job protocol, provider adapter for this candidate, runner, scheduler, service or remote worker | Complete durable identity/state/replay, authenticated routing, transactional storage, actual lease controller, verified provider integration and explicit Project/Sync acceptance across consumers |

## Contract Detail

### Project

The current public application path and the Project Format v11 foundation are
not the same contract:

- ordinary Windows serialization emits Project version 9 with the current
  public-safe profile;
- the ordinary parser and runtime model accept versions 1 through 10; and
- Project Format v11 is exposed only through an internal model subpath and a
  read-only authoring host.

The v11 foundation already demonstrates bounded duplicate-aware parsing,
canonical serialization, embedded and referenced Asset modes, document
identity, capability classification, and constrained opaque preservation.
Unsupported render requirements are invalid; unsupported edit-only or opaque
content is read-only; ordinary edited save requires full compatibility. Those
are useful candidate semantics, but they are not yet a published exchange
contract.

The
[Project Format v11 public authoring profile](../api/spec/project-format-v11.draft.md)
now records both the broader proposed boundary and the implemented narrow internal
candidate. A fixed allowlist, collection/media ceilings, canonical base64,
redacted error boundary, explicit identity migration/fork and byte-pinned shared
PNG/document fixtures exist. Native full PNG fixture execution is distinct from
the TypeScript wrapper's recorded-outcome port. The broad schema remains wider,
the full public adoption corpus and language-neutral guarantees are not frozen,
Asset Model owns the reusable structure and the Project copy is checked for
structural drift, without a broader semantic-parity proof. No production bridge
or independent consumer has completed the exchange gates. The Project row
remains internal.

Before publication, the Project owner must also resolve the current writer v9,
reader ceiling v10, and authoring candidate v11 split. The normal Windows path
needs an approved migration into the selected exchange profile and deterministic
round-trip behavior back from every supported consumer.

### Asset

The tracked Asset Model v1 schema and native crates establish strong local
foundations: content-addressed references, bounded blob and chunk-manifest
forms, exact closure validation, strict PNG validation, immutable local storage,
and descriptor-last publication. The local store and host are native-only. The
resolver has compile-only portable-target evidence, but no portable execution,
product integration, public support promise, transfer, Sync integration,
language bridge, public C ABI, remote lifecycle, capability advertisement, or
product activation.

Asset Model v1 owns the reusable `ViviAssetRef`, `EmbeddableBlobAssetRef`, and
`PngAssetRef` structural definitions. Project retains self-contained copies for
its compiled validator; the Project schema suite compares all three with the
tracked Asset schema after local-reference expansion and annotation removal.
Project's existing semantic validator additionally enforces its placement,
media-type, digest, and closure rules. This is a structural drift gate, not
general cross-language semantic equivalence or PNG resolution evidence: the
native resolver has a narrower input ceiling and separate store/decode checks.
Referenced transfer, independent consumers, and public promotion remain open.

### Evaluation

The tracked `vivi2d.evaluationPayload.v1` and
`vivi2d.evaluationTexturePlan.v1` machine artifacts are internal host seams.
The native path validates, correlates Assets, and lowers categories 1 through
9, including the reviewed allocation/reservation foundation. It does not yet
perform category 10 parameter binding, physics, IK, skinning, and mandatory
derived evaluation, or category 11 topology, identity, masking, sealing,
model-ready output, texture attachment, and activation.

The deterministic-math foundation is still disconnected from the category 10
evaluator. Current native preflight also rejects nonempty clips and state
machines. Category 9 completion therefore must not be described as completed
Evaluation support.

### Runtime ABI

The repository tracks a default ABI 0.1 header and feature-gated native ABI 0.2
implementation work. The ABI 0.2 public header and editor Evaluation-loading
entry point are not tracked public surfaces. The C ABI packages remain internal
and have no support promise.

Portable-consumer readiness requires a selected, reviewed, publicly promoted
versioned header that matches its implementation surface, plus exact rules for
layout, ownership, pointer lifetime, threading, errors, generation, and
capability behavior. The same fixture corpus must then be executed by the
TypeScript reference, native implementation, and each claimed portable target.
Compile evidence, runtime execution, and parity are separate claims.

### Sync

The internal [local exchange candidate](../../../packages/model/src/internal/local-exchange-state.ts)
now implements pure local revision preparation and one-document-cell CAS. It
invokes the real embedded Project candidate and requires matching document
identity and exact canonical bytes before minting a process-local revision
handle. Scope/document/parent binding, retained mutation receipts, same-key
mismatch, replay after head changes and explicit conflicts are checked. A new
mutation at the 64-receipt ceiling fails rather than evicting idempotency history.
A conflict preserves its original observed head and candidate identity; it does
not perform a merge or silent last-write-wins.

These are transient local rules, not a Sync client or durable offline protocol.
Opaque `scopeId` is a trusted host label, not authentication. A future host must
retain immutable bytes and receipts, route each cell through an atomic serialized
transaction, authorize access, and implement transfer, crash recovery and privacy
lifecycle. Metadata reload is shape-checked but does not recreate prepared
handles: preparation from actual retained bytes must run again. IDs alone do
not retain payloads. Durable offline retry remains an open requirement.

Cloudflare remains an optional implementation candidate for a coordination
plane. It is not part of the Sync wire contract, and the current tracked
Cloudflare application is static delivery only.

### Job

The internal Provider SDK offers useful in-process concepts, including
capabilities, bounded requests/results, progress, cancellation signals, and
artifact policy. It is not a durable provider-neutral Job protocol. Existing
provider adapters are implementations below the future contract, not its wire
authority.

The same internal candidate adds bounded submission/result preparation and
explicit `queued`, `running`, `retryable`, `succeeded`, `failed`, `cancelled`
states. Inputs/results are exact flat blob closures with mandatory size/digest
checks, not a new AssetRef authority. Requests are bound to canonical parameters,
capability, result policy and submission key; completion is bound to the active
attempt/provider. Candidate ceilings are eight attempts, 128 artifacts, 50 MiB
input, 200 MiB result, and 64 KiB / depth 8 / 1,024-node parameters. Lowered test
limits cannot raise these ceilings.

Attempt/renewal counters fence stale heartbeat/expiry; there is no clock, timer
or actual lease service. Serialized command order decides completion/cancel and
expiry races. Exact submission/completion/decision replay preserves current
state, while opposite terminal decisions are rejected. Counters fail before
safe-integer overflow. These pure transitions do not themselves make concurrent
storage atomic or stop a physical worker when cancelled.

Preparation snapshots bounded descriptors and bytes before awaiting trusted
hash/PNG ports. Four process-local WeakMaps retain proof handles; copied JSON or
Prepared-shaped state metadata cannot mint them. Fixed failures are SHAPE,
LIMIT, BINDING, INTEGRITY, PROJECT, INTERNAL, IDEMPOTENCY_MISMATCH, STATE, STALE
and TERMINAL, with no raw cause text. The module has no network, filesystem,
account, storage, provider execution or public package export.

Explicit acceptance selects one exact retained artifact from the winning
prepared result and revalidates those bytes through Project. It does not accept
arbitrary derived documents, execute conversion or edit the current Project.
The accepted candidate revision and its process-local handle still require a
separate Sync CAS call, which may conflict. TypeScript fixtures execute actual
Project validation using the byte-bound recorded PNG port; separate Rust
fixture execution does not create a production language bridge.

The future durable Job contract still must define and prove submission
idempotency, durable status and
event replay, worker claims and attempts, terminal/cancellation races, mandatory
artifact size and integrity metadata, provenance, and atomic result publication.
A result must never mutate a Project directly. Explicit acceptance creates a
candidate Project revision, which always passes Project validation. If that
Project participates in Sync, acceptance also passes the Sync compare-and-swap
and conflict rules.

## Dependency Order

The contracts may be reviewed independently, but usable exchange depends on
them in this order:

1. Project defines the canonical document, inline media, and capability
   behavior for the base file carrier.
2. Asset defines portable object identity and complete closure validation before
   referenced exchange or Sync is added.
3. Evaluation defines the deterministic authoring-to-runtime projection.
4. Runtime ABI exposes the approved Evaluation surface to portable consumers.
5. Sync transports immutable Project revisions and Asset closures.
6. Job consumes immutable inputs and returns a proposal that requires explicit
   acceptance into a new Project revision.

The first proposed interoperability target is defined in the
[Multiplatform Exchange Profile v1 draft](../api/spec/multiplatform-exchange-profile-v1.draft.md).
That profile does not change any status in this matrix.

## Promotion Rule

A row may move to `public draft` only when its owning tracked specification,
machine schema or header, fixtures, error and limit rules, and conformance
ownership are reviewable together. It may move to `published` only when the
implementation surface and public status ledger are promoted atomically and
the claimed producer/consumer evidence passes.

Private product code is never evidence that substitutes for a public contract.
It may consume an approved public version and publish product-neutral
conformance results without exposing private implementation details.
