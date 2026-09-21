# Internal C10/C11, post-seal and native owner boundary

The Phase B section below supersedes earlier consumer-zero-lowering and
absent-active-owner descriptions for the new optional native CPU owner only.
Earlier C10/C11/post-seal sections retain their individual stage boundaries.
The current C2 candidate section below supersedes the historical absent-bridge
and native-only graph descriptions only for its explicit opt-in consumers.

This current integration boundary supersedes the earlier disconnected-C10 and
consumer-zero-math descriptions retained in the foundation audit records. It
does not promote a stable API, runtime capability, release or product surface.

## Current Phase B: optional CPU owner and EDH issuance metadata

Core's `evaluation-v1` feature enables exactly one optional production path to
`vivi-runtime-native-evaluation-lowering`, with dependency default features off.
Core's default feature set remains empty. Default C ABI/runtime-WASM graphs and
legacy RuntimeModel initialization/factory lifetimes remain unchanged. Native B
originally was not a pure WASM graph: its opt-in lowerer reached the local host.
Core's preactivation/tempfile additions are dev-only, using existing lock versions.

`EvaluationRuntimeV1` owns latest observed request, sticky exhaustion, a
success-only model counter and one optional `ActiveEvaluationV1`. Eligible
activation consumes Ready's `into_parts()` once and moves the sealed candidate
and complete texture set. It checks stale/duplicate/exhausted/never-issued-zero
before checked model increment, publishes the complete owner/counter, then drops
the incumbent. No initial evaluation, clone, host call or fallible conversion
occurs in that swap. Low-level correlation/preparation still accepts generation0.

Active borrowed data delegates to the same C11 candidate. Input/preset/update
delegate to C10, with its caller-current versus committed distinction and
success-only dynamic count. Activation starts dynamic0/topology1; only successful
replacement changes the runtime-local model count. The small redacted owner error
preserves delegated statuses instead of passing them through legacy RuntimeError.

The real EDH adds only detached `getRequestState()` issuance metadata. Its sole
internal step issues before asynchronous parsing, failed requests retain their
generation, and a failed issuance beyond the safe ceiling makes exhaustion sticky.
There is no public counter seed, runtime import or capability advertisement.
The native owner and EDH tests are separate evidence, not a same-principal browser
binding: final live-session validation, byte-input preparation and GPU staging
remain C2 work. Authorized texture/identity access is not sanitized logging data.

`npm run check:evaluation-owner --workspace @vivi2d/runtime-native` runs opt-in
core tests and warnings-denied Clippy in the existing native matrix. The existing
lowering static gate checks the exact default/feature graph, current B source pins
and a versioned lock overlay. Old C10/C11/post-seal artifacts remain unchanged;
the current full-C10 run is still required. No publication or stable API follows.

`vivi-runtime-native-evaluation-lowering` has exactly one additional direct
production dependency, `vivi-runtime-native-evaluation-math`, with default
features disabled. The math crate remains unpublished, Rust-only, `no_std` and
`forbid(unsafe_code)`. Its only production consumer is lowering. Its opaque
`raw::D64` / `raw::Class` surface exposes the same 21 reviewed primitives;
storage, APFloat helpers and test-only dispatch stay private. No arithmetic,
dependency version, numerical golden or deterministic-math contract changed.

Lowering retains its existing C1–C9 entry. The separate internal
`lower_derived_evaluation_v1` entry runs that prerequisite once, then initial
derived evaluation and a complete transactional commit. Caller-current input
and last committed output remain distinct. Input mutation does not evaluate;
an explicit successful update increments dynamic generation once. Failure
preserves committed output, and generation exhaustion is sticky. Initial
dynamic generation is zero. Production observation is silent and zero-sized;
trace retention and injected generation setters are test-only.

The existing `check:runtime-native-evaluation-lowering` command now includes
`--execute-c10`. The fixed corpus is losslessly decoded, not recomputed from the
candidate. Native debug/release and optimized test-WASM compile the same C10
source and the actual math dependency. The finite corpus has 137 compound
cases, one helper case, 574 raw edge rows, eight actual reused cases, and ten
fresh-instance traps. Six prerequisite cases remain native-only. Original
expected values are unchanged, and six topology selectors remain deferred to
C11. Failed-initial companion state is not a returned candidate. The WASM C9
materializer is a prerequisite fixture, not proof of WASM parsing/correlation
or retained JSON/texture-plan fidelity.

Guards cover the reviewed allocation-free derived call paths; the native
initial call allows only the exact C9 allocation prefix. The entire harness,
compiler, host process and dependency packages are not globally allocation-free.
The ordinary production rlib must reject observer/test-setter imports. Each
trapped WASM instance is retired with no subsequent export. Execution evidence
stays in an ignored, checkout-local temporary directory and is not uploaded.

The C10 slice itself constructs no category 11 topology/identity/mask commands
or sealed model. Lowering has no production consumer and no direct Asset-host
dependency, host/store argument or host call. Runtime core, C ABI/editor,
runtime-WASM, TypeScript/IPC, GPU staging, texture attachment, activation,
publication and EDH-01 completion remain separate integration work. Test-only
WASM execution is not a product WASM edge, broad parity proof or hosted-CI result.

The isolated implementation received a limited independent READY after three
harness corrections. Its separate repository-adoption implementation review
subsequently reached READY. Neither verdict supplies hosted-CI evidence or
approves later C11, post-seal, active-owner or application integration changes.

## Current internal C11 sealing

`lower_sealed_evaluation_v1` now consumes the same candidate and exact texture
plan through one correlation operation. It completes C1–C9 preflight and the
combined checked storage ceiling before any reservation, reserves the original
39 sites plus five topology sites before retained fill, and performs the same
initial C10 evaluation exactly once. It then fills identity, topology and bounded
mask commands without evaluation or allocation and returns a move-only
`SealedEvaluationCandidateV1`. The original foundation and C10-only entries
retain their narrower scopes; no dependency edge was added for C11.

Borrowed, range-checked mesh/parameter views distinguish caller-current input
from the last successful evaluation. Dynamic generation starts at zero and
topology generation is exactly one; the six originally deferred C10 topology
selectors are now asserted separately by C11 tests. Failed updates retain the
committed output and topology. No logical PNG/RGBA buffer is cloned or read.

Native tests observe all 44 allowed reservation sites and no subsequent
fill/query/update allocation. The added wasm32 test compiles the exact topology
layouts, reservation and fill code with dependency stubs; it is not execution
evidence for public C11 parsing/sealing. Existing C10 native/test-WASM execution
remains independently required. The frozen DAG, numerical corpus, source map v2
and allocation closure v4 are unchanged; a narrowly pinned C11 identity addendum
binds the changed constructor seam without transferring an old approval to new
code. C11 implementation review and hosted integration are separate gates.

Public mask input still requires unique sources. Repeated-edge, malformed-leaf,
cycle and depth-nine witnesses exercise trusted post-validation topology only;
they are not evidence that those payloads pass the unchanged public parser.
Post-seal texture attachment, Ready/Missing handling, active runtime ownership,
C ABI/runtime-WASM/editor/renderer activation and EDH-01 remain unimplemented
by this C11 change. Sealing is not product readiness or stable API promotion.

## Current internal post-seal preparation

`prepare_lowered_evaluation_v1` separately consumes an already sealed candidate
and the existing principal-bound `LocalAssetHost`, borrowed through preactivation's
existing dependency boundary. It reads the exact retained generation/texture plan;
it does not parse, correlate, reserve C9/C11 storage, evaluate, update, reseal or
clone logical PNG/RGBA data. Pure C11 construction and borrowed views remain
host-free. There is no new production dependency edge or lowerer-to-host edge.

Preactivation's borrowed-plan entry calls the real host once and reuses the same
private Ready/Missing output validator as its existing candidate coordinator.
Host preflight, bounded reads/decoding and ordered hard-error precedence remain
unchanged; an earlier Missing does not hide a later error. Host work may allocate.
Ready owns exactly the sealed candidate and complete actual host texture set.
Missing owns exactly the same candidate plus ordered missing identities, not a
partial Ready set. Consuming `into_parts()` permits an explicit retry after an
object becomes available, without initial evaluation or topology construction.

Both private-field, non-Clone wrappers expose authorized immutable model/host
data. Those accessors are not log-safe: existing host Debug includes identities
and references. New wrapper Debug prints only kind, generation and counts.
The existing sanitized preactivation error retains Asset/Store subcodes and
exposes the exhaustive outer-load statuses: resource6, trusted Internal10,
correlation/invalid-plan/Asset/Store14. No legacy runtime status is changed.

Real SQLite/synthetic-PNG tests cover borrowed-plan Ready/Missing, exact owned
buffer handoff, Missing/retry state preservation and later hard-error precedence.
The original C10/C11 numerical data and identity artifacts remain unchanged;
the separate post-seal overlay binds only changed source identities and the
exact existing-version dev dependency additions. Parallel E's optional C ABI
host declaration is checked independently from default resolved reachability:
the default C ABI still reaches no local host/store/SQLite, and the internal
local Asset header remains excluded from the default npm pack.

These internal post-seal implementation surfaces have their own scoped accepted
implementation review; applicable hosted integration remains separate. Prepared
CPU data is not freshness or activation authority.
Active ownership, C ABI/runtime-WASM/editor/renderer activation and EDH-01 remain
separate. Neither this composition nor historical READY reviews approve those
later consumers, a stable API, release or publication.

## Current C2 implementation candidate

The explicit `evaluation-v1` C ABI and separate Evaluation-WASM artifact now use
the same core owner and C10/C11 candidate. Native host/store defaults are kept for
native callers, while pure production WASM disables `native-host`/`local-store`.
Its actual normal/build graph has no SQLite, local store or C ABI dependency.
One fixed nonexporting transport source is included by both thin ABI adapters;
the WASM gate pins that source separately from the Cargo graph. The default ABI1,
legacy runtime-WASM and PNG-WASM artifacts remain separate and unchanged.

Owned byte input is one complete replacement physical batch, capped at 288 unique
addresses and 64 MiB aggregate encoded bytes; it is not an object cache or generic
filesystem service. The same host preflight, resolver, strict full PNG decode and
Ready/Missing validator remain authoritative. Unused objects are rejected after
resolution, without hiding an earlier hard error. Preparation parses, correlates,
reserves and initially evaluates/seals once. A Missing retry consumes its retained
seal without resealing or update-zero. Ready activation moves the existing owner
without allocating; CPU snapshot and texture access use the existing borrowed
views. These authorized values are not sanitized logging data.

Typed C descriptors and all-or-nothing output spans have fixed sizes/offsets,
explicit capacities, reserved-zero fields, checked ranges and no partial writes
on rejection. Native handles require the documented live-owner/thread/pointer
contract. WASM additionally checks actual linear-memory ranges; the wrapper must
retire an instance after any trapped export without cleanup/getter calls. An
ordinary returned error instead preserves the incumbent, subject to the documented
child-consumption rules. Native C11 layout/link tests exercise the actual DLL;
WASM tests exercise both compiled and embedded bytes, real decoded pixels,
Missing/retry, nested/inverted mask commands, stale/wrong-owner rejection and
short/overlapping outputs. No new renderer or numerical algorithm is added.

The Evaluation-WASM deployment ceiling is 768 MiB (12,288 pages), with a 2 MiB
stack; it is neither a process-peak guarantee nor a promise that every format-legal
input succeeds. Existing RGBA decode limits remain separate. Constrained-memory
tests distinguish fallible bridge-owned byte reservation (`Resource`, status6)
from the unchanged PNG decoder limit mapped through `Asset`, status14. They keep
an incumbent unpublished by the failing attempt and verify continued use after
ordinary errors; they do not claim all allocator failures are recoverable.

The owning checks are `check:evaluation-bridge`, the existing native-WASM checker
with `--evaluation-v1`, and the linked-C checker with `--evaluation-v1`. The full
C10 gate remains mandatory. Original fixed numerical authorities are unchanged;
a C2 identity addendum binds only current connection identities without reusing a
historical approval for new code. The dedicated application preview separately
requires live-session freshness, attempt-owned EDH session disposal and the
event-free CPU/GPU publication interval. C2 implementation review, applicable
hosted CI and application evidence are separate requirements. No stable API,
default capability, release, upload or publication is authorized by these checks.

## Current bounded C2 application connection

The native boundary, dedicated EDH/WASM/Pixi preview and production-main binding
have separate scoped implementation acceptance. Main creates fresh maps containing
exactly `vivi.cap.referencedAssets@1` and `vivi.cap.maskInvert@1` for the accepted
bundled consumer, under the existing Windows/native-addon guards. Neither a
renderer readiness flag nor retained metadata supplies that authority. Legacy
and PNG-only consumers remain unchanged; this is not a default or public
capability advertisement.

The real source-built Windows application exercises a finite Missing → explicit
Copy → receiver Reload Ready path, nested/inverted-mask pixels and observed
nonmutation of the selected Sync cell. Reload is a new application attempt, not
proof of same-seal Missing retry. This evidence is not arbitrary-model or
packaged/installed-application coverage. The separately specified session
disposal, freshness and event-free CPU/GPU publication rules remain in force.
Whole-suite verification, applicable hosted CI, public contract or stable-ABI
promotion and product release remain separate; this connection supplies no
claim about unreviewed legacy material, remote services or private products.
