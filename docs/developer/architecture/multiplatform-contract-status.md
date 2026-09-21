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

| Contract | Current status | Implemented foundation | Current local connection | Publication and exchange blockers |
| --- | --- | --- | --- | --- |
| Project | `internal foundation` | Legacy v1-v10 owners; v11 codec/schema; bounded embedded profile, explicit migration/fork, real native PNG verification and ordinary Editor v11 route | Legacy documents retain v9/`.vivb` behavior; adopted supported embedded-v11 documents open, edit, save and reopen through their retained carrier | Review/promote the complete language-neutral profile and public corpus; prove an independent consumer. The internal Windows route does not itself close P1/P2/A1/C1. |
| Asset | `internal foundation` | Asset-owned structure and Project drift gate; strict resolver/decode, principal-bound local store, native descriptor-last transfer and internal C/Node bridge | Local transfer/authoring ports and bounded physical-closure capture feed the accepted opt-in C2 preview. Main binds the bundled consumer under the existing Windows/native-addon guards; explicit local Copy and receiver Reload are exercised through the real application. | Public contract/portable transfer conformance and capability promotion remain separate; no network service or authenticated remote client is claimed. |
| Evaluation | `internal foundation` | C1-C11, connected deterministic math, move-only sealing, borrowed views, post-seal Ready/Missing and optional core owner | Native owner and opt-in C ABI/Evaluation-WASM use the same lowerer. The dedicated preview and its production-main binding have separate accepted implementation reviews and finite real-application evidence. | Complete applicable hosted CI; separately review any public schemas/capabilities/errors/fixtures and broad execution-parity claim. |
| Runtime ABI | `internal foundation` | Unchanged default ABI 0.1; optional ABI 0.2 slice; internal `vivi_runtime_editor.h` and separate Evaluation-WASM artifact | Native linked-C and real WASM exercise Evaluation preparation, copy-out, lifecycle and owner operations; the default legacy interfaces are not replaced | Internal headers are tracked source, not a promoted stable ABI. Complete the selected application/hosted acceptance separately from public versioned-header and supported-target promotion. |
| Sync | `internal foundation` | Pure model transitions plus main-owned bounded local object/cell storage, outbox, CAS, receipts, conflict retention and restart revalidation | Explicit same-machine embedded-revision publication/delivery through the existing local panel; the OS user and owned root are the local trust boundary | No authenticated remote protocol/service, referenced-Asset Sync protocol, power-loss guarantee or public multi-client compatibility promise. Those are separate future adoption gates. |
| Job | `internal foundation` | Pure Job transitions plus main-owned retained submissions/results/decisions, fenced attempts/deadlines and real Provider SDK/ComfyUI invocation | Explicit local Start/Retry/Cancel, selected-result approval and retained-candidate resume; ordinary imported proposals remain distinct from exact v11 Project acceptance/CAS | No remote worker/scheduler/service or public provider-neutral durable wire promise. Arbitrary generated imports are not automatically v11 Sync revisions. |

The current implementation boundaries are detailed in
[C10/C11, post-seal, B and C2 integration](./evaluation-c10-integration.md) and
[the ordinary Editor v11 route](../api/spec/project-format-v11.draft.md#ordinary-editor-embedded-v11-route).
The corrected native C2 boundary, application cancellation/result-reporting
repairs and production-main binding have passed their separate scoped
implementation reviews. The source-built Windows application exercises finite
Missing, explicit Copy, receiver Reload Ready and nested/inverted-mask pixels;
the proof also observes that those actions do not mutate the selected Sync cell.
This is not same-seal retry, arbitrary-model, packaged-installer or release
evidence. Whole-suite results and applicable hosted CI remain separate, and no
row is promoted by this implementation-status update.

## Contract Detail

### Project

The legacy and adopted v11 application paths coexist:

- ordinary legacy serialization still emits version 9 and retains its existing
  v1-v10 parser/runtime and `.vivb` behavior;
- the bounded embedded-v11 route uses the real codec, retained carrier and native
  PNG WASM verifier to open/edit/save/reopen supported documents; and
- explicit migration/copy/fork controls identity. Unsupported operations fail
  before adoption or mutation rather than stripping content or forcing every
  legacy project into the narrow profile.

The v11 foundation also supplies bounded duplicate-aware parsing, canonical
serialization, embedded/referenced representations, capability classification
and opaque preservation. These broader codec rules do not imply that every
representation is editable in the narrow ordinary Editor route. The full route,
supported operations, atlas identity/UV ownership, rollback and save semantics
are described in the [Project draft](../api/spec/project-format-v11.draft.md).

Native full PNG verification is now used by the production validation ports;
the original shared fixture's recorded-outcome TypeScript port remains historical
fixture evidence, not the production decoder. Asset Model owns reusable structure
and the Project copy has an exact structural drift gate, not a blanket semantic-
parity proof. Public profile promotion and an independently implemented consumer
still need their own corpus and review. The Project row remains internal.

### Asset

Asset Model and the existing native owners supply content-addressed references,
bounded blob/chunk-manifest forms, exact physical/logical closure validation,
strict full PNG decode, immutable storage and descriptor-last publication.
The local store stays native-only and principal-bound. A native transfer path,
internal optional C ABI/Node addon and closed main-process copy/preview commands
now reuse those owners; they do not expose generic filesystem or object-query APIs.

C2 separately reuses a pure byte-backed host/resolver/decode path whose normal
WASM build graph excludes SQLite and the local store. This is actual bounded
WASM execution, not merely the earlier compile-only resolver evidence. It does
not establish a network transfer protocol or an independent implementation.
Main binds the accepted bundled C2 consumer under the existing Windows and
native-addon guards, creating a fresh capability map containing exactly
`vivi.cap.referencedAssets@1` and `vivi.cap.maskInvert@1`. Renderer readiness or
retained metadata cannot authorize copy. The real local Copy and receiver Reload
path has finite application evidence; it is not a remote transfer protocol or
general capability promotion.

Asset Model owns `ViviAssetRef`, `EmbeddableBlobAssetRef` and `PngAssetRef`
structure. Project retains self-contained compiled-schema copies, checked after
local-reference expansion with only annotation removal. Project placement/media/
digest rules and native resolver/store/decode semantics remain separately owned.
Structural equality is not general cross-language semantic equivalence. Referenced
Sync, remote authorization/lifecycle, public promotion and broader compatibility
claims remain outside the current bounded local transfer scope.

### Evaluation

The internal `vivi2d.evaluationPayload.v1` and
`vivi2d.evaluationTexturePlan.v1` seams now feed the same C1-C11 lowerer.
The deterministic-math dependency is connected. Category 10 initial/transactional
derived evaluation and category 11 identity/topology/mask/seal construction exist,
with their fixed numerical evidence, ordered reservation and borrowed-state rules.
Post-seal preparation consumes that seal into Ready or same-seal Missing; the
optional core owner moves Ready without a second initial evaluation.

The [current integration boundary](./evaluation-c10-integration.md) distinguishes
each accepted slice, native/test-WASM evidence, pure C2 preparation and application
freshness/GPU obligations. Existing nonempty clip/state-machine rejection remains.
The application repairs and production-main binding have their own scoped
implementation acceptance and actual source-built Windows evidence, distinct
from the accepted lowerer/native boundary. Only the selected bundled consumer's
two capabilities are bound; no general input-acceptance or capability expansion
is claimed. Public Evaluation promotion and broad cross-target parity remain
separate.

### Runtime ABI

The default ABI 0.1 header and legacy behavior remain unchanged. Optional native
ABI 0.2 work and the separate internal `vivi_runtime_editor.h` Evaluation
interface are tracked source. The latter defines typed descriptors/copy-out,
owner/lifecycle/generation/error rules and a separate opt-in Evaluation-WASM
artifact; native linked-C and actual WASM checks exercise those surfaces.

All packages remain internal. A tracked header is not a publicly promoted stable
ABI or a supported-client promise. Native/pure preparation review does not prove
application session freshness, event-free CPU/GPU publication or production
capability binding. Portable-consumer promotion still requires a selected
reviewed versioned boundary and the claimed producer/consumer fixture corpus.
Compilation, actual execution, independent parity and application integration
remain distinct claims.

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

Those model functions remain transient and filesystem-free. The separately owned
[main-process local host](../../../electron/local-exchange-host.ts) now supplies
bounded retained object bytes, complete-file cell commits, outbox/receipt/conflict
retention and restart revalidation. Objects are written before the cell becomes
visible; recovery checks retained bytes and re-prepares proof handles instead of
trusting persisted metadata to recreate WeakMap authority. Explicit local delivery
uses the same CAS/idempotency rules between selected cells/roots, with both conflict
payloads retained. Corruption freezes the affected cell rather than resetting it.

The process-lock owner and OS user are the local trust boundary; opaque IDs are
not authentication. The existing flushed-file/rename writer supports the bounded
process-restart design, not multi-file transactional rollback or directory/power-
loss durability. No automatic remote retry, account/backend, remote authorization,
referenced-Asset Sync or destructive retention policy is introduced. The current
local embedded outbox is implemented; a public remote Sync protocol remains open.

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

The main-process local host now retains bounded submissions, complete result
manifests/bytes, decisions and candidate bytes. It persists a version-fenced claim
before renderer dispatch through the real
[Provider SDK/ComfyUI adapter](../../../src/lib/local-exchange-provider.ts).
Explicit Start/Retry never refreshes and replays a stale command automatically.
A fixed monotonic deadline is checked at new completion adoption; exact committed
completion replay is handled first. Recovered running attempts are expired before
commands resume, with no automatic provider restart. Cancellation fences completion
but does not claim that an uncooperative physical provider stopped; its slot is
retained until actual settlement or renderer loss.

Selected-result approval reuses the real manifest/PSD import owners and requires
explicit consent. The [staging boundary](../../../src/lib/local-exchange-staging.ts)
keeps ordinary validated legacy imports separate from exact embedded-v11 candidate
acceptance. A retained v11 candidate may enter the existing Sync CAS/outbox path;
an ordinary generated import is not silently relabelled as such a revision.
Approval can remain durable when a stale Editor prevents volatile adoption, and
reopening uses the retained exact bytes rather than regenerating the proposal.

These are bounded local implementation and recovery rules, not a remote worker,
scheduler, service or promoted durable Job wire contract. Network authorization,
operational privacy/retention and independent-consumer claims remain separate
adoption gates. Neither a provider result nor a Sync conflict may silently replace
the currently open Project. Stored user prompts/image/project data are not public
test evidence, and content digests are not encryption or secrecy guarantees.

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
