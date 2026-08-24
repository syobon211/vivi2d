# One-Time DCO Exception for the Cumulative Multiplatform Pull Request

## Status

- Decision: owner-approved one-time process exception
- Decision date: 2026-08-24
- Owner: `@syobon211`
- Repository: `syobon211/vivi2d`
- Pull request: assigned after the integration branch is pushed; this record must
  be updated before the pull request head is frozen
- Integration base: `da60e5bac2c52bbcb02d4f1ac8066d95d895fedb`
- Historical range base: `ee41eacf85166f28f2efe96d368ac4ec964a4cd8`
- Historical range head: `8e3dab509f6d2a85adc5bff1a41fc97347bf9a9c`
- Historical commit count: 22
- Source-history archive:
  `archive/runtime-abi-v02-windows-fb47f295`
- Final pre-squash archive: assigned after required checks and independent review

This record is documentation of a narrow process exception. It does not state
that the historical commits contain DCO trailers, and it does not change the
normal contribution policy.

## Scope

The exception applies only to the ordered 22-commit historical range listed
below. Each commit was authored by the repository owner using the repository
owner's verified noreply address. No `Co-authored-by:` or `Signed-off-by:`
trailer appears in this range.

The later source-branch commit
`fb47f295f851be756338175aa50d10d053daa4ad` is not part of this exception or
the cumulative pull request history. Its dependency update was superseded by
the separately reviewed and signed pull request #105 on `main`. The original
23-commit source history remains reachable through the source branch and the
source-history archive tag above.

If the historical range, authorship, integration base, or pull-request content
changes, this decision becomes stale and requires a new owner review. If the
pull request is closed without merge, this exception expires unused.

## Ordered Historical Commit Manifest

| # | Commit | Subject |
| ---: | --- | --- |
| 1 | `c342393495557a7bd653a1a76c2a78ce158f85ff` | Implement opt-in Runtime ABI 0.2 public slice |
| 2 | `fd495e280025d311695ca772d1c1b52161416a6c` | Harden public profile marker scanning for opaque IDs |
| 3 | `c55df829b4878f2ac9b9c157d15f8f14d1d7801f` | Repair legacy PNG fixtures for strict decoding |
| 4 | `fa2ff0b2ecb27564882777f9f8cddd3f51442b96` | Implement internal Project Format v11 JSON codec |
| 5 | `1bcfe82d5f85c231094fcc2ee82d1b33a2873d85` | Promote internal Evaluation Payload v1 builder |
| 6 | `f9e81fc499e2aaa6e3f477864d4ee58eab391489` | Make model authoring seams JSC-portable |
| 7 | `a615d0b1934c09bbcae07e762d307ba6a22ddd11` | Restore Spec Freeze model pack gate compatibility |
| 8 | `deeb4cf87834949b0103063bac893cdd11dd75b1` | Add read-only Project v11 authoring host |
| 9 | `358500e4f60874cba45cfe1b3961d508fc79bdb5` | Add strict PNG reference decoder foundation |
| 10 | `bd55f0c3b2fe4112658f8b50d3ff9c84b292bf7f` | Add private Asset Model resolver foundation |
| 11 | `eb90c67d4924cd3b38e59d5ba0ba1c53d7686307` | Add private SQLite Asset store foundation |
| 12 | `f085a6db7f05a0c1712634749102ec5cbeed08d9` | Add private local Asset host foundation |
| 13 | `433964a23a29025cdcc5289ba889f3627dc6d70a` | Add local referenced PNG closure ingestion |
| 14 | `82275e5b543da873874277bfce6e21eb103c3a2d` | Add private Evaluation Payload foundation |
| 15 | `93f2806a8c4f293c13fab4609a0137e162be5c42` | Add private Evaluation preactivation foundation |
| 16 | `febc7484ca128a397272e91b4d48d6677fa4bc08` | Add private Evaluation lowering foundation |
| 17 | `a45a8ad13978f916a98fc5654a65dfea975a18cd` | Add private Evaluation deterministic-math oracle |
| 18 | `e17f9e39942746394ad5d674fe94c9d8c445c3db` | Add private Evaluation Category 9 reservation |
| 19 | `c5e4d542a3b9774a77d49da5a8a8afda0f6e05d2` | Document private iOS product and multiplatform boundaries |
| 20 | `26f1f8d0b733ffa411d99f7a29f1343fe6c08807` | Publish secret-free multiplatform roadmap |
| 21 | `f5ec8afda91ecbe3552f19474da9c9ae1fac9624` | Document multiplatform contract readiness |
| 22 | `8e3dab509f6d2a85adc5bff1a41fc97347bf9a9c` | Document Project Format v11 review profile |

Author for every row:
`syobon211 <288079945+syobon211@users.noreply.github.com>`.

## Reason

These commits were created before per-commit maintainer sign-off was
operationalized for this cumulative work. Rewriting them solely to add trailers
would destroy the exact commit identities used by the completed documentation
and contract reviews, and would invalidate an existing private consumer
baseline pin.

This exception preserves those identities while making the absence of trailers
explicit. It is not a claim that the commits are individually DCO-compliant,
and it is not a substitute for provenance evidence from an outside contributor.
No outside contributor or co-author is present in the scoped range.

## Owner Decision

- The pull-request template statement that every commit includes a DCO trailer
  must remain unchecked.
- The pull-request body must link to this record and explain the exception.
- Every new integration or governance commit must include a valid
  `Signed-off-by:` trailer.
- The final squash commit on `main` must include the certifying owner's valid
  `Signed-off-by:` trailer.
- `CONTRIBUTING.md` remains unchanged. This exception is not precedent for
  future maintainer commits or any outside contribution.
- Local dirty protected files must not be staged or committed. GitHub Actions
  may read only the committed repository snapshot under the owner's separate
  CI authorization.

## Merge and Archive Procedure

1. Integrate the historical range into a clean branch based on the exact
   integration base without rewriting the 22 commits.
2. Review the integrated tree and complete all required checks.
3. Record the pull-request number and final head disposition in this document
   before freeze.
4. Create and push an annotated, non-release archive tag at the final reviewed
   pre-squash head. Do not move that tag if the head later changes.
5. Squash-merge only after the required checks, independent review, and all
   conversations pass.
6. Verify the resulting `main` tree and record the old-to-new commit mapping in
   the external owner log. The immutable archive tag remains the durable source
   for the reviewed pre-squash chain.

## Authority Boundary

This record authorizes only the one-time DCO process exception described above.
It does not authorize implementation beyond the reviewed pull request,
publication or release of artifacts, infrastructure deployment, purchases,
private-repository disclosure, or Apple, Cloudflare, TestFlight, or App Store
operations.
