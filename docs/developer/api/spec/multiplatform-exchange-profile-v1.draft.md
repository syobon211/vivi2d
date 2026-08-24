# Multiplatform Exchange Profile v1 (Draft)

## Status And Authority

- Status: public design draft; not normative and not implemented.
- Scope: the minimum provider-neutral data exchange between the Vivi2D Windows
  application and a compatible client, including the intended proprietary iOS
  companion.
- This draft creates no compatibility, release, implementation, repository,
  cloud, purchase, deployment, or publication authority.
- Approved owning Project, Asset, Evaluation, Runtime Spec, Runtime ABI, Sync,
  and Job specifications, when present, are authoritative for their domains.
  This profile may constrain how approved versions compose, but must not
  duplicate their wire schemas.
- Current readiness is recorded in the
  [Multiplatform Contract Status](../../architecture/multiplatform-contract-status.md).

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe the
candidate contract to be reviewed. They do not describe current product
behavior.

## Goal

The first exchange milestone is deliberately smaller than feature parity. A
compatible client can receive a bounded Vivi2D document, determine whether it
is editable, read-only, or rejected, validate every required inline atlas, make
only supported edits, and return a document that Windows accepts without
silently losing unsupported content.

Advanced authoring, provider execution, synchronization, and product UI are not
part of the base claim. Runtime parity, Sync, and Job integration are additional
claims with separate gates.

## Claim Classes

Implementations MUST name the exact claim they satisfy:

| Claim | Meaning |
| --- | --- |
| `document-round-trip` | Offline `.vivi` import, capability classification, inline-atlas validation, supported edit, and return to Windows |
| `runtime-parity` | The selected Runtime Spec and approved Evaluation/runtime-boundary fixtures execute on the target with the documented result and error tolerances |
| `sync` | Immutable revisions and Asset closures exchange through the future Sync contract with offline recovery and explicit conflicts |
| `job` | Provider-neutral jobs use the future Job contract and return verified proposals that require explicit acceptance |

No implementation may use the unqualified word "seamless" unless every claim
needed by that advertised workflow has passed. For example, a successful file
round trip does not prove Sync, runtime parity, or Job support.

Every conformance result MUST identify the exact profile revision, fixture
manifest, and editable feature set it ran. An empty or implementation-selected
feature subset cannot satisfy `document-round-trip`.

## Base Document Profile

The proposed `document-round-trip` baseline uses one `.vivi` canonical UTF-8
JSON document. `.vivb`, `.vivid`, referenced Assets, and network transfer are
outside the first profile.

The owning
[Project Format v11 public authoring profile](./project-format-v11.draft.md)
MUST freeze the exact wire rules before this composition profile can be adopted.
That document is itself a review draft and does not yet satisfy P1. The current
candidate is:

- Project version 11;
- `assetMode` equal to `embedded`;
- a stable UUIDv4 `documentId` that survives no-op and supported-edit round
  trips;
- no public-profile marker that the Project v11 schema forbids;
- root `requires` absent in canonical producer output and no derived capability
  requirements in the initial editable fixture set;
- no referenced `AssetRef` values;
- no extension data in the initial editable fixture set; and
- stable, unique atlas identities with inline PNG data.

The initial editable fixture set therefore requires `clips`, `stateMachines`,
`scenes`, and `sceneBlends` to be empty and excludes extended blend modes,
inverted masks, and any other content that derives a render requirement. The
scene restriction also prevents nested scene clips from bypassing the current
requirement derivation. Later profiles may add a capability only after its
owning contract and cross-implementation fixtures are approved.

The proposed mandatory core is intentionally small but nonempty. It covers
document and canvas metadata; stable nested group, drawable-mesh, and bone
identities; basic transforms, visibility, and opacity; mesh topology, UVs, skin
weights, and inline atlas mapping; parameter definitions; public-safe bone and
IK bindings; and the `normal`, `add`, `multiply`, and `screen` blend modes. It
excludes animation, state machines, physics, colliders, offscreen targets,
extended blend modes, inverted masks, and provider metadata. The owning Project
specification MUST freeze the exact fields, defaults, limits, and fixture
manifest before adoption.

This is a proposed profile, not a statement about the current Windows writer.
The ordinary Windows writer currently emits version 9, the normal parser and
runtime accept through version 10, and Project v11 is an internal foundation.
Adoption therefore requires an explicit migration and normal load/save change.

`documentId` identifies the authoring document. It MUST NOT be treated as a
Sync revision identifier, an account identifier, an authorization principal,
or proof that two divergent copies have the same current state.

## Capability And Preservation Rules

A consumer MUST evaluate the Project contract's versioned requirements before
rendering or editing.

1. If a required render capability is unsupported, the document is rejected.
   The consumer MUST NOT silently approximate the missing render behavior.
2. If an edit-only capability is unsupported, or a permitted extension is
   opaque, the document is read-only. It MUST NOT produce an edited revision.
3. A read-only implementation MAY create only the lossless local duplicate
   allowed by the owning Project contract. It MUST preserve the original
   canonical source and every opaque envelope covered by that rule.
4. Ordinary save is allowed only from full compatibility and may change only
   fields covered by the consumer's declared editable capabilities.
5. Unsupported fields, requirements, extensions, Asset references, and media
   MUST NOT be deleted, rewritten, or normalized into a different meaning.
6. Invalid, ambiguous, duplicate-key, or over-limit input fails closed according
   to the Project contract's error precedence. Producers MUST emit canonical
   JSON. Consumers MUST accept bounded schema-valid alternative whitespace and
   property ordering permitted by the owning Project contract and canonicalize
   them before subsequent processing.

The initial editable fixture set has no extensions. Opaque edit-only extension
fixtures are still required to prove read-only preservation and mutation
rejection before extension-bearing documents may be advertised as supported.

## Inline Atlas Set

The base carrier is self-contained, but its current candidate atlas shape is not
a content-addressed Asset closure. Every atlas required to display or edit the
document MUST be present inline. The consumer:

- MUST validate each stable atlas identity, base64 payload, PNG structure,
  declared dimensions, and applicable byte, count, and dimension limits;
- MUST reject missing, duplicate, ambiguous, corrupt, or over-limit atlases;
- MUST apply the bounds and error precedence frozen by the owning Project
  contract;
- MUST NOT resolve absolute local paths, ambient files, or an implicit network
  location; and
- MUST NOT treat content addressing as encryption, secrecy, authorization, or
  consent.

The first profile uses inline PNG atlas data and excludes extension blobs,
referenced Assets, and chunk-manifest Assets. Referenced mode may be added only
after Asset Model has a tracked public authority, Project-to-Asset schema
ownership is fixed, portable resolvers pass the same fixtures, and a transfer
carrier or Sync contract is approved.

The current inline-atlas shape has no declared content digest. Before the
profile is adopted, the owning Project specification MUST decide whether the
base carrier adds a normative digest or limits integrity claims to strict
decode, declared-dimension checks, and a digest recorded only in conformance
evidence. If a later carrier uses digest-bearing `AssetRef` values, the Asset
specification owns their identity and closure semantics. A locally derived
digest MAY qualify test or cache evidence, but it is not an on-wire assertion.
This draft does not silently invent a wire field.

## Offline Exchange Flow

### 1. Windows export

Windows validates the document under the selected Project profile, assigns or
preserves its `documentId`, includes every required inline atlas, and writes one
canonical `.vivi` document. Export MUST fail rather than emit a partial or
silently downgraded document.

### 2. Consumer import

The consumer performs bounded parse and schema validation before expensive
decode work, classifies capability compatibility, validates the complete inline
atlas set, and returns exactly one state: editable, read-only, or rejected.

### 3. Supported edit

Only an editable document may be changed. The consumer records only changes
within its declared editable capability set, preserves stable identities, and
serializes through the owning Project contract's canonical writer.

### 4. Return to Windows

Windows repeats schema, semantic, capability, and inline-atlas validation
before opening the returned document. A supported edit is accepted only if all
unmodified semantics and inline atlases remain preserved. A no-op round trip
MUST be canonically equivalent; whole-file byte identity is required only where
the owning Project contract explicitly promises it.

The imported file never silently replaces another open or newer document.
Conflict and revision semantics belong to Sync, not to `documentId` or filename
matching.

## Runtime Parity Extension

`document-round-trip` does not imply that a client evaluates or renders the
document identically. A `runtime-parity` claim additionally requires:

- a selected publicly tracked Runtime Spec version and its canonical fixture
  registry;
- publicly promoted, review-approved, versioned Evaluation payload and
  texture-plan schemas with the matching public status-ledger entry;
- a publicly promoted, versioned Runtime ABI header or another approved
  language-neutral consumer boundary;
- an explicit consumer surface for Evaluation load, lifecycle, snapshots,
  errors, ownership, and generation behavior;
- completion of the model-ready Evaluation path, including the currently open
  category 10 and category 11 obligations;
- connection of deterministic math to the evaluator;
- the same golden, hostile, and unsupported-feature fixtures on the
  TypeScript, native, and claimed target implementations; and
- separate evidence for target compilation, execution, result parity,
  performance, and product integration.

Current internal foundations and compile-only evidence do not satisfy this
extension. Nonempty clips and state machines are outside the current native
foundation and therefore outside the initial runtime-parity claim unless a
later contract revision adds and tests them.

## Sync Extension

Sync is not part of the base file carrier. A future `sync` claim MUST use a
separately versioned provider-neutral contract with at least:

- immutable canonical Project document objects and exact Asset closures;
- opaque project identity plus distinct immutable revision identity;
- explicit parent or base revision;
- an authenticated, scoped client mutation and idempotency key;
- immutable and resumable object transfer with mandatory size, digest, and
  media metadata;
- publication only after the complete closure validates;
- compare-and-swap head publication;
- an explicit conflict that preserves both the local candidate and current
  remote head; and
- a durable offline outbox with idempotent retry and head revalidation.

Version 1 MUST NOT silently use last-write-wins or automatic merge. Account and
service designs must separately define authorization, revocation, quotas, rate
limits, retention, export, deletion, and incident behavior. A specific cloud
provider is an implementation choice, not part of the wire contract.

## Job Extension

A future `job` claim MUST use a separately versioned provider-neutral contract.
The minimum lifecycle includes submit, durable status or resumable events,
cancel, result retrieval, and explicit accept or reject. It also requires:

- canonical request-bound idempotency;
- immutable content-addressed inputs;
- bounded parameters and declared resource policy;
- monotonic state or event versions;
- defined worker attempt, retry, lease, heartbeat, cancellation, and terminal
  race semantics;
- an atomic result manifest with mandatory size, digest, media type, and
  provenance for every artifact; and
- full closure validation before a result becomes available for acceptance.

A Job result is an untrusted proposal. It MUST NOT mutate a Project directly.
Explicit acceptance creates a candidate Project revision, which always follows
Project validation. If that Project participates in Sync, acceptance also uses
the Sync compare-and-swap and conflict rules. Existing provider adapters may
implement this contract later but do not define its wire authority.

## Conformance Corpus

The public conformance suite for this profile MUST include, at minimum:

1. current Windows version 9 input migrated into the selected exchange profile;
2. Windows to consumer to Windows no-op canonical equivalence;
3. a supported edit in each direction with stable document, layer, and atlas
   identities;
4. unsupported render capability rejection;
5. unsupported edit-only capability producing read-only state;
6. opaque extension local-duplicate preservation and mutation rejection;
7. missing, duplicate, corrupt, dimension-mismatched, and over-limit inline PNG
   atlases;
8. valid noncanonical JSON spelling that canonicalizes to the expected output;
9. duplicate keys, malformed UTF-8, excessive nesting, and boundary limits;
10. attempted silent downgrade or unsupported-version output; and
11. deterministic error precedence across independent implementations.

A digest-mismatch fixture becomes mandatory only for a later digest-bearing
Project or Asset carrier. The base inline-atlas wire currently has no declared
digest to compare.

The Sync extension adds unchanged-head and changed-head offline replay,
duplicate mutation retry, two-client concurrent update, incomplete closure, and
conflict recovery. The Job extension adds retry/deduplication, worker loss,
cancel/completion races, and corrupt result closure. The combined `job` +
`sync` claim also adds accept-after-head-change conflict handling.

Private product code does not need to be published to prove conformance. Public
evidence may contain only the contract version, fixture identity, product-neutral
result, and toolchain/target qualification needed to substantiate the claim.

## Adoption Gates

| Gate | Required outcome | Current state |
| --- | --- | --- |
| P1 - Project authority | Tracked Project v11 profile, schema, canonicalization, limits, errors, migration, and fixtures | Not met |
| P2 - Windows path | Ordinary Windows import/export uses the approved profile and preserves identity and unsupported data | Not met |
| A1 - Inline atlas rules | Tracked Project rules for base64/PNG validation, dimensions, limits, optional digest policy, and portable fixtures | Not met |
| A2 - Referenced Asset extension | Tracked Asset contract, single `AssetRef` owner, exact closure rules, and portable resolver fixtures | Not met; not required for the base claim |
| C1 - Independent consumer | A non-Windows implementation passes the public file, hostile-input, and round-trip corpus | Not met |
| E1 - Runtime parity | A selected Runtime Spec, publicly promoted Evaluation contract, complete model-ready path, and versioned portable Evaluation boundary pass shared execution fixtures | Not met |
| S1 - Sync | Versioned protocol, clients, conflict/offline tests, privacy policy, and operational review pass | Not met |
| J1 - Job | Versioned protocol, worker/client lifecycle tests, bounded result acceptance, provider adapter, and applicable authorization/privacy/operational review pass | Not met |

Until P1, P2, A1, and C1 pass, the repository must not claim Windows-to-iOS
document interoperability. Until E1 passes, it must not claim runtime parity.
Until S1 passes, it must not call synchronization seamless. Until J1 passes, it
must not claim provider-neutral remote jobs.

## Public/Private Boundary

The schemas, capability and preservation rules, fixtures, and conformance
results described here are public OSS contract material. Proprietary app UI,
host code, platform integration, packaging, product identifiers, signing,
distribution configuration, and operational records remain in a separately
verified private repository.

This document must not name or link that repository, and no private code or
artifact may be used as an undocumented normative dependency.
