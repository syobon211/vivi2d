# ADR 0007: Windows Installer Alpha Signing Policy

## Status

Accepted for the Windows installer alpha channel.

## Context

Vivi2D now publishes Windows x64 NSIS installer alphas through GitHub Releases.
The installer channel is meant for early feedback, not production deployment.
Unsigned installers trigger browser, `Unknown publisher`, or Microsoft Defender
SmartScreen warnings, but signing also introduces identity validation, recurring
cost, credential custody, and CI release-boundary work.

Azure Artifact Signing is the preferred managed-signing candidate to evaluate
later because it avoids exporting private keys and is designed for automated
Windows signing. It is not adopted for the alpha channel because public-trust
availability, identity validation, and regional eligibility still need owner
review. Traditional OV or EV code-signing certificates are also deferred because
they require certificate custody and renewal procedures that are larger than the
current alpha distribution goal.

## Decision

Keep all Windows installer alpha releases unsigned. Do not make code signing a
release goal for the alpha line.

Unsigned alpha releases remain acceptable only when all of the following stay
true:

- Release notes, README, install docs, and `vivi2d.com` clearly label the
  installer as unsigned alpha software.
- User-facing copy says browser, `Unknown publisher`, or SmartScreen warnings
  may appear.
- User-facing copy tells users to download only from GitHub Releases and verify
  `checksums.txt` before running installers.
- Installer release records set `codeSigning.status` to `unsigned` and do not
  claim publisher identity, malware reputation, or trusted-app status.
- The protected release workflow keeps checksum, SBOM, notices, source-review
  archive, release-record, review-packet, and manual Windows review gates.

Code signing may be reconsidered for a later beta or stable release. Enabling it
requires a new ADR or an explicit amendment to this ADR that records the signing
provider, certificate owner, identity-validation status, key custody model,
timestamp authority, renewal process, revocation process, CI permission model,
and signature-verification evidence.

## Consequences

- SmartScreen and browser warnings are expected during the alpha phase and are
  documented rather than hidden.
- Alpha installer safety relies on provenance, checksums, exact asset allowlists,
  release records, public GitHub Releases, and manual Windows smoke review.
- The release workflow must reject signed-build claims unless a later ADR
  enables signing.
- Follow-up work can focus on first-launch clarity, installer guidance, and QA
  automation instead of prematurely adding certificate infrastructure.
