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

The [public API status ledger](../quality/public-api-status.md) remains
authoritative for package publication status. The
[package boundary policy](../contributing/package-boundaries.md) remains
authoritative for public/private placement.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `proposed` | The responsibility is identified, but no tracked contract package or specification exists. |
| `internal foundation` | Tracked implementation or machine artifacts exist, but the surface is private/internal and incomplete. |
| `public draft` | A tracked, reviewable contract draft exists but is not a stable compatibility promise. |
| `published` | The owning specification, implementation surface, fixtures, conformance evidence, and status ledger have been promoted together. |

No contract in the matrix below is currently `published` for multiplatform
exchange.

## Summary Matrix

| Contract | Current status | Tracked foundation | Current product connection | Publication and exchange blockers |
| --- | --- | --- | --- | --- |
| Project | `internal foundation` | Project v1-v10 parser/types plus an internal Project Format v11 schema, codec, semantic validator, capability result, and read-only host seam | Ordinary Windows save emits Project v9; the normal parser/runtime accepts through v10; v11 is an internal friend API | Select and publish one authoring profile; connect normal Windows load/save; define migration, downgrade, identity, unsupported-feature, and round-trip rules; publish cross-language fixtures |
| Asset | `internal foundation` | Asset Model v1 schema plus native resolver, principal-bound local store, and local host foundations | Native/local only; no public bridge, network transfer, Sync client, capability advertisement, or product activation path | Assign one normative `AssetRef` owner; fix Project-schema parity; publish bounds/errors/closure rules; add portable resolver and transfer conformance |
| Evaluation | `internal foundation` | Internal payload and texture-plan schemas/builder, native validation and preactivation, and lowering categories 1-9 | Read-only authoring projection only; no complete model-ready evaluator or product runtime connection | Complete categories 10-11, connect deterministic math, seal model-ready output, publish schemas/capabilities/errors/fixtures, and prove execution parity |
| Runtime ABI | `internal foundation` | Tracked ABI 0.1 header and an opt-in native ABI 0.2 implementation slice | Internal packages only; ABI 0.2 public header and Evaluation load entry point are not tracked public surfaces | Publish one versioned header; complete Evaluation loading, ownership/lifetime/error/generation rules, exports, host tests, and supported-target execution evidence |
| Sync | `proposed` | Project identity/capability and Asset content-addressing concepts are reusable inputs | No dedicated tracked Sync specification, schema, package, client, account policy, service, or deployment | Define revision/blob protocol, idempotency, authorization, optimistic concurrency, explicit conflicts, offline recovery, privacy lifecycle, and multi-client fixtures |
| Job | `proposed` | Internal Provider SDK request/result/progress/cancellation and artifact-policy foundations | Provider-specific local adapters exist; no provider-neutral durable Job protocol, runner, cloud adapter, or worker lifecycle | Define durable identity/state, replay, retry/deduplication, lease/attempt/cancellation semantics, atomic result manifests, provenance, and explicit accept/reject behavior |

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

Project Format v11 currently carries an embedded copy of `AssetRef`-shaped
schema rules while Asset Model v1 has its own schema. Publication must either
make Asset Model the sole normative owner or add an explicit semantic-parity
gate for every embedded copy. Two independently evolving definitions are not an
acceptable public contract.

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

There is no Sync implementation to promote. A future provider-neutral contract
must use immutable Project documents and exact Asset closures, publish a
revision only after its closure validates, bind idempotency to the authenticated
client mutation, and use compare-and-swap rather than silent last-write-wins.
Head disagreement must preserve both the local candidate and remote head as an
explicit conflict. Offline retry must be durable and idempotent.

Cloudflare remains an optional implementation candidate for a coordination
plane. It is not part of the Sync wire contract, and the current tracked
Cloudflare application is static delivery only.

### Job

The internal Provider SDK offers useful in-process concepts, including
capabilities, bounded requests/results, progress, cancellation signals, and
artifact policy. It is not a durable provider-neutral Job protocol. Existing
provider adapters are implementations below the future contract, not its wire
authority.

A future Job contract must define submission idempotency, durable status and
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
