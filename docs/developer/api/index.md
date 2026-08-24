# API And Specification Index

This page is navigation only. Publication status lives in
[`../quality/public-api-status.md`](../quality/public-api-status.md).

## Runtime Specifications

- [Runtime Spec v1](spec/runtime-spec-v1.md)

## Draft Interoperability Profiles

- [Project Format v11 public authoring profile (review draft)](spec/project-format-v11.draft.md)
- [Multiplatform Exchange Profile v1 (draft)](spec/multiplatform-exchange-profile-v1.draft.md)

Draft profiles are reviewable design candidates, not stable compatibility
promises. Their owning contracts, schemas, fixtures, and status-ledger entries
must be promoted separately and atomically before an implementation claims
conformance.

Migration and conformance notes for future spec revisions belong under
[`migrations/`](migrations/).

## SDK And Protocol References

- [Web SDK preview](web-sdk.md)
- [Viewer API preview](viewer-api.md)
- [Provider SDK preview](provider-sdk.md)

Unversioned SDK/protocol docs are preview-mutable. A stable promotion must be
atomic: the same PR sets `stability: stable`, updates the public API status
ledger, renames the document to an explicit `*-v1.md`, and updates this index.
