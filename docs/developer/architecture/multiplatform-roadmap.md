# Multiplatform Roadmap

This document is the public, secret-free roadmap for interoperability between
the Vivi2D Windows application and a separately developed proprietary iOS
companion. It describes product responsibilities, shared OSS contracts, and
public acceptance gates without documenting the private product implementation.

## Status and Authority

- The project owner approved publication of this roadmap on 2026-08-23.
- This is a planning document. It is not a frozen protocol specification,
  release commitment, or implementation approval.
- It does not authorize product implementation, purchases, Apple enrollment or
  submission, repository or cloud-resource creation, deployment, or production
  operation. Each of those actions requires its own scoped decision and review.
- Normative details belong in the relevant specification, schema, fixture, or
  ADR. The [package boundary policy](../contributing/package-boundaries.md) is
  canonical for deciding where a contribution belongs.
- The [contract status matrix](./multiplatform-contract-status.md) distinguishes
  tracked foundations from public compatibility promises.
- If this roadmap and the package boundary policy appear inconsistent, stop and
  apply the stricter boundary until the project owner resolves the conflict.

The **Current State** section records repository facts observed during the
2026-08-23 planning review. The **Product Responsibilities**, **Proposed Shared
OSS Contracts**, and **Coarse Phases** sections describe future candidates;
they do not claim that those capabilities exist.

## Product Responsibilities

### Windows OSS application

The Windows application remains the public, full authoring environment. It owns
high-fidelity editing, advanced rigging, project conversion and export, and
workloads that benefit from desktop compute or a local GPU. Existing local
provider integrations remain useful independently of any cloud service or iOS
product.

### Proprietary iOS companion

The iOS product is intended to be a focused, touch-oriented companion for
playback and lightweight rigging or editing. It may consume the public formats,
runtime interfaces, and protocols defined here, while its app UI, product host,
Apple integration, packaging, and distribution remain private. Feature parity
with the Windows editor is not a goal; advanced and compute-heavy work remains
on Windows or an explicitly selected worker.

### Optional coordination service

Where it is practical and cost-effective, the proposed coordination plane may
use Cloudflare for opt-in identity and session handling, project and revision
metadata, content-addressed blob transfer, sync coordination, and job routing or
status. This is a control-plane direction, not a commitment to run GPU workloads
or arbitrary provider graphs on Cloudflare. A Windows worker can remain the
default execution environment for compute-heavy jobs.

## Public and Private Boundary

All branches, tags, pull requests, commits, and pushed objects in this repository
are public. A non-default branch and an ignore rule are not privacy controls.

| Public OSS surface | Proprietary product surface |
| --- | --- |
| Platform-neutral Project, Asset, Evaluation, Sync, and Job contracts | iOS app and product UI |
| Schemas, language-neutral headers, and public compatibility rules | Product host and proprietary platform integration |
| Shared Rust runtime and C ABI code | Swift, Objective-C, or Metal product integration |
| Golden fixtures, hostile fixtures, and conformance runners | Xcode projects, workspaces, and app configuration |
| Portable-target compile checks and evidence that contain no product integration | Product identifiers, assets, signing, provisioning, and distribution configuration |
| Secret-free portability, security, and compliance documentation | Product-specific release, submission, and operational records |

The proprietary product must live in a separately administered repository whose
private visibility has been confirmed with the hosting provider before product
work begins. This public repository must not name, link, submodule, or otherwise
identify that repository. The dependency direction is one way: the private side
may pin an approved public commit or release, while no private source or artifact
flows back into the public repository.

Credentials and signing secrets must never be committed, including to a private
repository.

## Current State

| Area | Current public state | Open gap |
| --- | --- | --- |
| Windows application | Public alpha with an established desktop editor and local provider integration | No production multiplatform or sync workflow exists |
| Project and Asset foundations | Internal Project Format v11 codec/schema seams and reviewed Asset foundations exist in partial slices | Normal Windows persistence, migration, shared contract publication, and sync integration are incomplete |
| Evaluation and runtime | A shared native runtime, Evaluation foundations, conformance assets, and a feature-gated Windows C ABI slice exist | Publication, complete runtime coverage, portable-target evidence, and product-consumer integration remain open |
| Authoring host | A read-only host foundation can parse authoring data and project an Evaluation payload | Mutable commands, history, and end-to-end portable host integration are not implemented |
| Provider jobs | Provider transport, manifest, and import-related foundations exist | A provider-neutral job contract, runner, cloud adapter, and worker lifecycle are not implemented |
| Sync and cloud | Existing Cloudflare use is limited to static delivery | Sync protocol, clients, account policy, coordination service, and deployment do not exist |
| iOS consumption | This repository contains no proprietary iOS product material | The shared surfaces have not been proven by an approved iOS product consumer |

Partial foundations must not be described as product-ready. A compile-only
portable check, a Windows-only implementation, and a private product integration
are separate claims with separate evidence.

## Proposed Shared OSS Contracts

The following contracts are the intended seam between Windows, private clients,
workers, and optional services. Each contract stays independently reviewable and
provider-neutral.

| Contract | Public responsibility | Public acceptance evidence |
| --- | --- | --- |
| Project | Canonical serialization, version compatibility, migration rules, public/private data profiles, and round-trip behavior | Schemas, hostile fixtures, and deterministic round-trip tests |
| Asset | Content-addressed references, manifest closure, integrity metadata, media constraints, and bounded resolution | Digest and closure fixtures, strict decode tests, and size/count limit tests |
| Evaluation | A deterministic editor-to-runtime projection with explicit capabilities and fail-closed validation | Golden payloads and cross-implementation result fixtures |
| Runtime ABI | A language-neutral native boundary for lifecycle, inputs, evaluation, snapshots, errors, ownership, and generation semantics | Header review, C/C++ host tests, export checks, and native/portable conformance evidence |
| Sync | Revision and blob exchange, idempotency, optimistic concurrency, explicit conflict states, and offline-safe behavior | Protocol schemas, state-machine fixtures, and multi-client round trips |
| Job | Provider-neutral submission, progress, cancellation, result manifests, integrity checks, and explicit user acceptance | Contract fixtures, hostile artifact tests, and worker/client integration tests |

Implementation-specific endpoints, storage layouts, resource names, operational
runbooks, and private client APIs are not part of this roadmap. They require
separate designs in the repository that owns the implementation.

The first proposed composition of these contracts is the
[Multiplatform Exchange Profile v1 draft](../api/spec/multiplatform-exchange-profile-v1.draft.md).
It is a design candidate only and does not promote any contract in this table.

## Public Security, Privacy, and Conformance Gates

A future implementation must pass the applicable gates before its capability is
advertised or released:

1. **Local-first and opt-in:** local authoring continues to work without an
   account. Network sync and job submission are explicit user choices.
2. **Fail-closed input handling:** files, manifests, revisions, and provider
   results are treated as untrusted, with schema validation, integrity checks,
   traversal resistance where paths are involved, and explicit byte, count, and
   dimension limits.
3. **Explicit conflict and acceptance UX:** sync conflicts preserve recoverable
   revisions rather than silently overwriting them. Generated or remotely
   produced artifacts are previewed and accepted before they modify a project.
4. **Least privilege:** credentials are not exposed to renderers, project files,
   logs, fixtures, or provider artifacts. Authentication, authorization,
   revocation, quotas, rate limits, and abuse controls are reviewed before a
   public account-enabled service is offered.
5. **Privacy lifecycle:** any account-enabled service defines collection,
   retention, export, deletion, and incident-handling behavior before public
   availability.
6. **Deterministic interoperability:** Windows and every supported consumer run
   the same versioned fixtures with documented tolerances, error precedence,
   capability behavior, and unsupported-feature handling.
7. **Evidence-qualified claims:** compile success, runtime execution,
   cross-platform parity, deployment readiness, and product readiness are
   reported separately. Evidence for one does not imply the others.
8. **Public/private containment:** public checks and review confirm that no
   private source, product asset, identifier, credential, signing data,
   distribution configuration, or private artifact crossed the boundary.
9. **License and ownership review:** new public surfaces receive dependency,
   notice, license, package-boundary, and CODEOWNERS review before publication.

See the [architecture overview](./overview.md), [system map](./system-map.md),
and [threat model](../security/threat-model.md) for the current public system
boundaries. Those documents remain authoritative for their existing scoped
claims.

## Coarse Phases

These phases express dependency order only. They contain no schedule, staffing,
purchase, deployment, or release commitment.

### Phase A — Stabilize public contracts

- Separate current behavior from proposed behavior in each shared contract.
- Complete or revise Project, Asset, Evaluation, and Runtime ABI specifications.
- Add versioned schemas, fixtures, hostile cases, and conformance ownership.
- Keep every public surface independent of the private product implementation.

### Phase B — Complete the Windows shared foundation

- Connect the Windows editor to the approved Project and Evaluation contracts.
- Close runtime feature gaps needed by the shared format.
- Preserve the Windows editor's local-first behavior and existing OSS workflows.
- Publish only interfaces whose compatibility and security gates have passed.

### Phase C — Prove portable consumption

- Establish portable-target build evidence for the approved shared runtime and C
  ABI without adding product integration to this repository.
- Use public fixtures to test a consumer's format, evaluation, and rendering
  behavior.
- Record compile, execution, parity, performance, and product evidence as
  distinct results.

Any proprietary consumer work in this phase occurs only after private visibility
has been verified and under separate authorization.

### Phase D — Add opt-in synchronization

- Specify revision, blob, conflict, authentication, and privacy behavior in
  public, provider-neutral contracts.
- Implement and test the Windows client against those contracts.
- Require multi-client round trips, offline recovery, and explicit conflict
  behavior before calling synchronization seamless.
- Treat any Cloudflare deployment as a separately approved operational change.

### Phase E — Add provider-neutral jobs

- Stabilize the Job contract before binding it to a specific worker or cloud
  implementation.
- Keep compute execution replaceable and allow a Windows machine to remain the
  default worker.
- Enforce bounded artifacts, cancellation, provenance, integrity, and explicit
  user acceptance end to end.
- Evaluate hosted compute only after cost, license, security, and operational
  gates are defined.

### Phase F — Harden interoperability

- Expand runtime capabilities only through versioned contracts and fixtures.
- Run regression, compatibility, security, and privacy gates across supported
  producers and consumers.
- Document unsupported features and degraded behavior instead of silently
  approximating them.
- Make release decisions separately for the Windows OSS application, shared
  contract surfaces, optional services, and proprietary products.

## Deliberate Non-Goals

This public roadmap does not:

- disclose or specify the proprietary iOS UI, host architecture, bridge,
  renderer, module layout, gesture workflows, or packaging;
- define private infrastructure schemas, keys, resource names, deployment
  topology, or runbooks;
- commit to running ComfyUI or another GPU workload on Cloudflare;
- define schedules, estimates, hardware purchases, pricing, monetization,
  submission strategy, or product rollout; or
- authorize implementation merely because a phase or contract appears here.

## Updating This Roadmap

- Update **Current State** only with evidence from reviewed repository changes.
- Change a normative contract in its owning specification and fixtures, then
  summarize the result here; do not make this roadmap the only source of a wire
  or ABI rule.
- Keep private implementation decisions in the private product repository. A
  public document may record that the private product consumes a public contract
  but must not identify its repository or reproduce its implementation details.
- Treat any change to the public/private boundary as an owner decision requiring
  focused review before publication.
