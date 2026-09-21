# C10 callable and allocation closure — current production-edge evidence v4

This is a bounded, read-only source audit and a binding to the corrected isolated review and the completed real-math-edge
execution report. It is not a whole-program proof or final repository-adoption approval,
category-11 sealing, or product activation. No expected number is derived here.

## Identities and the three different kinds of evidence

- The reviewed source base is `eacbe9a4d9be1439479f754a1547be098e216580`.
- `native-c10-source-callsite-map-2.json`: 336521 bytes, SHA-256
  `6bc5b813a7b4a46579ce4c50d82b3238bb1b064b30bc002dbd3cdfed00e14f86`.
  This maps all 160 accepted DAG templates / 198 occurrences and 22 owner
  domains/shapes onto 156 actual observed arithmetic callsites. The difference
  in counts comes from explicitly shared affine, normalize, distance, and CCD
  end-effector helpers, not omitted operations. Each row retains normative
  operands/owners and actual operand expressions, function, source line, full
  call text and context. Zero unmapped sites and zero opcode mismatches are
  lexical completeness checks, not a proof that every runtime operand is right.
- `execution-evidence.json`: SHA-256
  `bd42d734be0f3da1f88e1b1ee98f179e1bd9ded83f2ddda71ea98eee47bf49fe`.
  This reports actual real-math-dependency native debug/release and WASM execution.
  Root reports actual isolated implementation review round 2 READY with I01/I02/I03
  closed. The corrected isolated report is separately pinned in the JSON; this
  author note does not independently issue that verdict or extend it to repository adoption. It
  supplies numerical/state/trace observations which a source inventory cannot.
- `native-c10-callable-allocation-closure-4.json` records freshly checked source
  pins, all 24 existing selected dependency-member pins, the two excluded-member
  identities, archive checksums, and the precise callable edges below. The
  member refresh does not claim that every function in these crates was audited.

## Entry and transaction boundary

The construction entry is
`lower_derived_evaluation_v1 -> lower_derived_evaluation_observed ->
lower_evaluation_foundation_v1 -> evaluate_initial -> commit_evaluation`.
The existing C9 parser/correlation, validation, reservation and owned allocation
are allowed **before** the C10 allocation-observation boundary. Initial C10
evaluation and its commit run after the already-owned foundation exists. A
failed constructor consumes/drops that invocation's foundation and returns only
the redacted cause, never a partially usable candidate. Deallocation during
drop is not an allocation claim.

`update -> update_observed` checks generation overflow first, then finite,
nonnegative delta, then calls `begin_update -> evaluate_update ->
commit_evaluation`. Only after successful commit is the next generation stored.
The error adapters construct fixed enum/scalar errors, not formatted messages.
The public `Debug`/`Display` implementations exist but are not called by these
evaluator routes; caller formatting is outside the allocation-free claim.

`set_input` validates a raw finite value, fixed table lengths, exact UTF-8 symbol
ranges, and the destination range before one caller-current scalar write.
`apply_preset` performs a complete read-only range/value/destination validation
pass before a second pass of fixed-buffer writes. Both use quiet comparisons and
branch selection, preserve valid negative zero, and invoke no derived evaluation.
No strings, maps, vectors, or cloned owned inputs are created along these routes.

`state::begin_update` validates existing storage, copies caller-current,
committed bone overrides and committed pendulums into the corresponding
already-reserved update buffers, copies the accumulator, and clears staged
validity. `commit_evaluation` validates every mesh/physics validity first. Its
infallible tail swaps exactly four owned vectors (parameters, bone overrides,
pendulums, coordinates), swaps flags/accumulator, and stores validity bits. It
does not reserve, resize, collect or clone buffers, and does not replace the
caller-current inputs. The old committed buffers remain reusable scratch.

## Actual derived call graph

`evaluate_initial` clears scratch flags, calls `preflight`, copies parameter
inputs, resets initial bone/staged overrides, and calls `bindings`. Initial
physics state is +0 without force/substep arithmetic. It then calls `finish`.
`evaluate_update` clears flags, calls `preflight -> bindings -> step_physics ->
finish`. The typed C9 tables, not the original JSON payload, supply runtime data.

`finish` has this order: when IK is present, `worlds(pass 0) -> ik`; then always
`worlds(pass 1) -> skinning -> project -> culling`; only the final successful tail
sets mesh-valid flags. A later failure therefore does not publish an earlier
mesh's partial work.

- `bindings` selects/interpolates a fixed authored keyframe sequence and writes
  only its designated parameter, bone or controller destination. Quiet branch
  selection is separate from the observed arithmetic wrapper calls.
- `worlds` resolves effective typed properties, builds the local affine matrix
  with explicit sine/cosine/multiply nodes, and calls the existing `affine`
  helper for parent composition. The map binds all six affine output cells and
  all 20 operations explicitly; it does not count a helper's name as six proofs.
- `ik` calls either `two_bone` or bounded `ccd`. `normalize` has five separately
  bound checkpoint arrays; `distance` has two four-operation arrays.
  `two_bone` preserves far/near/interior branch erasure. `ccd` preserves reverse
  sweeps, ascending world recomputation, fixed iteration limits, and the
  distinct sweep versus convergence owners of `end_effector`. No historical
  unconsumed `reached` arithmetic node is reintroduced.
- `skinning` reads typed rest/influence/inverse-bind tables and already-produced
  worlds. The x transform/weight/accumulate path precedes y exactly. An absent
  inverse is skipped, not replaced by an invented identity matrix.
- `project` uses the existing
  `lower::project_binary64_to_binary32(f64::from_bits(raw))` once per attempted
  coordinate. This existing, explicitly allowed final D64-to-D32 conversion is
  the only host floating-point arithmetic boundary in the derived evaluator.
  The test observer captures the actual source bits and actual result/error
  before propagation; it does not infer a rejected rounded value from an error.
- `culling` accumulates the fixed edge expression from projected coordinates.
  Helpers for checked ranges, slot conversion, finite classification and fixed
  array copying do not allocate. Matrix/force temporaries are fixed-size values.
- `step_physics` validates the typed snapshot, clamps delta by quiet selection,
  reads every current/previous input before output writes, uses a fixed two-lane
  force array, steps the bounded pendulum loop, stages outputs, and commits
  staged destinations only after its required arithmetic succeeds. There is no
  heap-backed work list, callback, JSON access, or new reservation site.

All 156 observed arithmetic callsites use the common fallible raw-result
wrapper. The wrapper records the actual raw result in the fixed test observer,
then rejects nonfinite results. The mapping keeps each of the 198 contextual
occurrences, including reused callsites, visible for reviewer inspection. It
does not validate source control flow by token presence alone.

## Raw numeric dependency boundary

The only numeric primitive surface is the existing 21-callable `DetF64` surface:
`from_bits`, `to_bits`, `classify`, `is_finite`, `add`, `sub`, `mul`, `div`,
`c_fmod`, `neg`, `abs`, `eq`, `lt`, `le`, `gt`, `ge`, `sin`, `cos`, `atan2`,
`acos`, `sqrt`. The adoption templates import the real math crate's `raw::D64`
and `raw::Class`; they do not create a second numerical implementation or
self-alias a copied source module. The current run links Cargo-selected real
math artifacts on native and WASM. The one lowering-to-math path dependency has
default features disabled. Existing primitive bodies are unchanged; only exact
visibility, lint attributes and comments changed. The original projection
wrapper is now production-reachable without changing its conversion body.

The direct finite operations route through `rustc_apfloat::ieee::Double` with
round-to-nearest, ties-to-even. Sign/absolute/classification/NaN normalization
are raw integer operations. Quiet comparisons use APFloat's typed comparison.
`Double` uses `IeeeFloat<DoubleS>` with a fixed one-limb significand; selected
multiply/divide/normalize support uses fixed limb arrays and integer operations.

The five transcendental wrappers use `fpmath::SoftF64::from_bits` and `to_bits`,
never `to_host` or `from_host`. The actual `SoftF64` implementation wraps
APFloat `Double`; its arithmetic operators call the same fixed raw arithmetic.
The selected generic paths are:

- sine/cosine -> `generic::sin/cos` -> range reduction -> small/medium or
  `reduce_pi_2_large` -> polynomial combination. Large reduction uses fixed
  `[u64; 20]`, `[u32; 20]`, and binary64 preparation `[u32; 3]` arrays.
- atan2 -> `atan2_inner` -> `atan_inner_common`, with exact special-case
  branches and typed double-double support.
- acos -> `acos_inner` -> `two_hi_lo_sqrt_inner` where applicable.
- sqrt -> `sqrt_inner` / `sqrt_split` with fixed integer/raw-word work.

The existing math gate pins the selected 24 source members and explicitly pins
two **excluded** members. The refreshed JSON checks these same member bytes,
not an expanded informal dependency set. The status bitflags path is scalar
bit manipulation. `fpmath::host_f64`, SoftF64's host conversions, decimal parsing,
APFloat formatting, and dynamically arbitrary-precision parsing/formatting are
not reachable from the selected raw wrappers. In particular, APFloat contains
real `SmallVec` allocation sites in its `Display` and decimal-string paths; this
report does **not** call the entire APFloat or SmallVec crate allocation-free.
Selected callbacks, FMA, IEEE remainder, generic string parsers, formatters and
other FloatMath operations are not newly admitted by this audit.

## Observation and execution evidence

Production `Observer` is silent and retains no trace/projection buffers. Under
`cfg(test)`, the same arithmetic path receives borrowed bounded storage:
28691 arithmetic records and 6 projection records. Capacity exhaustion is a
deliberate test trap, not a production fallback or a growing vector. The
controller observation is a fixed copy. No user callback is introduced.

The pinned real-edge report records native debug and release (8 test functions
each), 137 actual WASM compound cases, helper39, 568 primitive rows plus 6
explicit F41/F42 rows, and eight actual F43 reused cases. On native construction, the allocation guard arms **before the actual
constructor**, including actual C9 reservation/materialization. It permits only
the exact ordered nonempty allocation prefix of the frozen 39 C9 sites, matching
each size and alignment, and forbids any additional C10 allocation. Input setup,
the independent frozen-C9 baseline and detached snapshots are outside the guard.
On WASM construction, the frozen input-authoritative foundation is materialized
before arming; the allowed allocation prefix is empty. Setter, preset, update,
helper and failed-initial companion calls likewise permit no allocation.
Expected-state comparison and diagnostics run after disarming. Native guards count actual
alloc/alloc_zeroed/realloc calls with fixed TLS storage, and WASM additionally
checks linear-memory page count. A real Box-allocation positive control proves
the instrumentation is armed. A deliberately changed expected bit proves the
shared assertion route detects a mismatch. The ten fresh-instance traps are exactly two observer-capacity traps, six
native-only dispatch traps (35 and 91–95), unknown compound index147 and invalid
diagnostic index8. Copied expected-word and UV-snapshot negative controls are
separate checks: their export verifies the actual comparison returns Check::Err
and then succeeds. They are not counted as fresh-instance traps. The exhaustion controls
have no unconditional tail panic; success there must come from the real bounded
observer. Initial immutable baselines are captured from C9/input setup before
construction, with an actual copied UV-corruption negative control.

All armed allocation/no-growth assertions pass for this finite corpus. Setup,
snapshot copying and assertion diagnostics remain outside the measured region.
The current summary does not record a whole-harness final page count; no old
171-page value is carried forward as a fresh observation. The finite run is
corroboration for the source closure, not an exhaustive input-space proof.

Ordinary-production negative compilation observes E0432, E0599 and E0603 for
forbidden recorder/helper/dynamic-mutation access. Those are evidence for the
specified test-only surface boundary, not arbitrary whole-crate inaccessibility.

## Remaining adoption and interpretation limits

1. The isolated implementation review is READY as reported by root, and its
   three required harness corrections are included in the freshly linked run.
   Final review of the repository persistence, ordinary math dependency edge,
   exact architecture/gate closure, CI wiring and current public diff remains
   pending. Neither a finite run nor this source map grants that approval.
2. C11 sealing, post-seal preparation, core/C ABI/runtime-WASM product activation,
   and stable API promotion remain excluded. The math consumer edge is now real;
   lowering itself still has no product consumer.
3. Native-only prerequisites 35 and 91–95 have actual native C9 evidence, not
   WASM C9 execution. Their WASM dispatches trap as required; they are not
   counted among 137 compound cases. F43 is eight explicit reused actual cases,
   not its zero-step descriptor counted as a compound PASS.
4. Failed initial cases 137/142/145 have no returned token. Scratch evidence is
   a separate single call to the actual initial evaluator on the same prebuilt
   foundation; it is not fabricated state returned by the failed constructor.
5. 186 unspecified projection fields are not interpreted as empty observations;
   104 declared fields, including 38 explicit empties, are checked. Six exact
   topology-generation selectors remain deferred to C11.
6. The source mapper is a restricted, fail-closed lexical linkage tool, not a
   general Rust parser, formal callgraph analyzer, allocation proof or numerical
   interpreter. Operand aliases, branch scheduling, caller/committed/scratch
   meanings and original-author provenance remain in the unchanged binding4
   and DAG documents, plus the full literal assertions and reviewed source.
7. All source/dependency hashes are point-in-time pins. Root may still update the
   integrating checker/runner before final review; any such change requires a
   new evidence identity, not silent reuse of this report. Old version1 remains
   immutable and retains its historical limitations.

This version supersedes only the v2 execution identity with the newer full run.
The current bounded gate completed the same 137 compound / helper / 574 raw /
eight reuse / ten trap observations and three production negative-link codes.
At this refresh, all its measured source pins match except the integrating
`scripts/check-runtime-native-evaluation-lowering.mjs`: executed SHA-256
`3b9fc98605042ac35b7f491bd57f27a6f62ca7cb62c9801547663e85e02fead7`,
its point-in-time current SHA is recorded in the JSON `executionSourceDrift`.
The checker remains under root's parallel edits; that one exact path is recorded
separately, not treated as executed or reviewed by this report. Every other
execution source pin is required to match. Root reports adding a used projector function-pointer probe to
the independent C9-only WASM compile seam after an all-target dead-code warning.
Final static gate/test-pin changes and final runner adoption review remain
separate; no numerical fixture or source body changed. Map2 retains its original
earlier execution-reference metadata while mapping identical current numeric
source bytes. Neither prior artifact is overwritten.


Version4 corrects two author-reporting errors in version3: native constructor
allocation measurement includes its permitted C9 prefix; the two comparison
negative controls are not among the ten traps. No source or expectation changed.
