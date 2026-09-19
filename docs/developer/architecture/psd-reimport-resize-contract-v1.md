# PSD Reimport Resize Contract v1

Status: **implemented in the Editor**. This is an Editor
authoring contract, not a runtime/API compatibility promise or release approval.
Implementation validation and independent review are separate evidence; this
status does not authorize distribution or publication.

## Decision

**Reimport replaces artwork; it does not resize or reposition the authored
model.** Existing meshes, UVs, topology, placement, and rigging remain intact.
A change in texture resolution is not a command to regenerate a mesh.

For an existing matched layer, v1 supports ordinary same-size artwork updates
and explicitly confirmed, same-framing, uniform resolution changes. It does not
guess crop/padding offsets, move artwork within its frame, or resize rigging.
Structurally unsupported replacements and unconfirmed resolution changes leave
the existing layer and texture unchanged. Framing itself is not machine-verified:
same-size updates deliberately rely on a notice and user selection, while
resolution changes require explicit confirmation. Neither path corrects framing.

## Coordinate And Dimension Ownership

| Data | Meaning | Existing matched layer after reimport |
| --- | --- | --- |
| Texture canvas width/height | Actual raster pixel dimensions | Replace with validated incoming raster dimensions |
| Incoming PSD document size and leaf rectangle | Source-file coordinates; inspection inputs | Show in the preview; never copy into authored geometry |
| Project width/height | Authored model canvas | Preserve |
| Layer x/y/width/height | Authored placement and reference bounds | Preserve |
| Mesh vertices | Layer-local model coordinates | Preserve every value and vertex order |
| Mesh UVs | Normalized coordinates within the layer texture | Preserve every value |
| Mesh indices and divisions | Existing topology and editor metadata | Preserve; do not compare against a generated grid |
| Skin, bindings, animation, bones and physics | Authored rig state | Preserve |

Old texture size means the current texture canvas size, **not** the layer's
width/height. The two can legitimately differ after a resolution replacement.
PSD document dimensions are likewise not interchangeable with project canvas
dimensions. A PSD layer's position is not evidence of its old source position
because the model may have been edited since import.

This contract requires no new persistent source-baseline metadata or project
format migration. Old pixels and their dimensions are snapshotted for the
operation/history; incoming source bounds are transient preview inputs. Do not
invent a PSD source baseline from authored geometry or overwrite existing
manual-image/provider import metadata with new image dimensions.

## Eligibility And User Choices

Reuse the existing PSD token extraction and display-name normalization, with
this v1 unambiguity preflight over the full input before applying selections:

1. Prefer a token that occurs exactly once among incoming raster leaves and
   exactly once among existing token-bearing nodes.
2. If that unique token match is unavailable (including a missing or duplicated
   token), name fallback is allowed only when the normalized name occurs exactly
   once among all incoming raster leaves and exactly once among all existing
   nodes, including groups. A same-named group is an ambiguity, not permission
   to choose a different drawable node. Do not consume duplicate names in
   traversal/FIFO order.
3. Resolve candidates without mutation. If multiple incoming leaves resolve to
   the same existing node, hold all of those associations; selection order does
   not choose a winner. Unresolved ambiguous candidates are held, not new layers.
4. A resolved update needs an existing drawable mesh and incoming pixels. A kind
   change, missing old texture, missing incoming raster, or unsupported case is
   held with a reason. After resolution, do not evade a failed eligibility check
   by rematching elsewhere or by generating a replacement mesh.

Thus ordinary token-to-name fallback remains available, but ambiguity cannot
silently overwrite an arbitrary existing layer. Fix the conflicting source and
reanalyze, or exclude the held entries; v1 does not add a manual remapping UI.
Exclusion changes selection only: it does not rerun matching or turn an ambiguous
association into a unique one.

All size comparisons use validated, positive integer raster dimensions. Source
byte, pixel, memory, and other current PSD limits remain in force before pixel
decoding. This contract does not enlarge those limits or resample an oversized
input to bypass them.

| Case | Default | Permitted v1 action |
| --- | --- | --- |
| Same raster width/height; ordinary artwork edit | Eligible for the normal explicit Apply action | Replace pixels; preserve authored state |
| Different raster size; exactly the same aspect ratio | Needs confirmation/unselected | User may confirm that the incoming image is a same-framing uniform resample and select texture replacement |
| Different aspect ratio | Held | No replacement in v1, even if described as resampling |
| Crop, padding, changed content origin, rotation, or moved/scaled content inside the leaf frame | Unsupported intent; not automatically detected | User must keep/exclude the layer, even at equal dimensions; re-export in the original frame |
| Unknown intent on a size change | Needs confirmation/unselected | Keep old texture or cancel; do not infer intent |
| Unavailable or invalid comparison data | Held | Keep old texture or cancel |
| PSD leaf position or document canvas differs from authored values | Display source values separately | Never move/resize the authored model; raster replacement still follows the rows above |

Use three eligibility states: **eligible**, **needs confirmation**, and **held**.
Selection is separate. Confirmation can make a same-aspect resolution change
eligible; it cannot make a structural hold eligible. Held entries are not
selectable. No per-layer framing-declaration state or image-analysis mechanism
is added. Same-size updates use the normal Apply action with a framing notice;
users exclude images whose framing changed. For resolution changes, keep-current
or absence of confirmation means no replacement. Confirm means the incoming
image already has the same normalized content framing, not that the editor may
stretch a cropped or padded image. The editor does not perform resampling.

For changed dimensions, exact aspect equality is `W1 * H0 === W0 * H1`.
Validate both old and new comparison dimensions as positive integers within the
existing per-layer pixel limit. With the current `MAX_PSD_LAYER_PIXELS = 2^26`,
each dimension is at most `2^26`, so either cross-product is at most `2^52` and
ordinary JavaScript number arithmetic is exact; no BigInt/helper is needed.
Retain this bound when changing the load limits. There is no hidden tolerance
or rounding-based acceptance. Aspect equality is **not proof of unchanged
framing**. Undeclared crop/padding may pass even at equal dimensions; an incorrect
user confirmation is not detectable by v1 and is recoverable through Undo,
not automatic alignment. Notices must state this limitation rather than promise
automatic rejection of framing changes.

An operation-wide confirmation must identify the selected resolution-change
layers and their old/new sizes. Changing that set or reanalyzing invalidates the
confirmation; it is not a preference reused for later files or projects.
Held layers may be excluded while other eligible layers are applied.
The user may cancel the entire operation. A selection containing a held layer
is rejected before mutation until that layer is excluded or made eligible.

The preview must show:

- old and new **texture pixel** dimensions;
- that displayed model size, mesh, UVs, and rigging will remain unchanged;
- that PSD placement changes are not imported;
- a clear keep-current/confirmed-replace choice for resolution changes;
- a framing warning and the reason for each held layer.

Plain-language intent: "Keep the existing model size and rig. Replace only the
image. Confirm that the image has the same content frame, with no cropping,
padding, or content offset. Otherwise keep the current image and adjust the
source first." Translate this meaning through the existing UI localization
system when implementing it; this document does not add user-facing strings.

## Correction Rule

Let the old raster size be `(W0, H0)`, the new raster size `(W1, H1)`, an existing
mesh vertex `p`, and its normalized UV `(u, v)`. For an eligible replacement:

```text
p_after       = p_before
uv_after      = uv_before
layer_after   = layer_before       (authored geometry)
project_size  = previous project size
new sample    = (u * W1, v * H1)    (continuous source coordinates)
```

The renderer continues to own pixel-center sampling and filtering; this formula
does not change those conventions. Do not round or multiply mesh coordinates,
parameter deltas, bind matrices, or UVs by the raster-size ratio. Do not rebuild
topology, recalculate skin weights, or reset hand-edited vertices. Custom UVs
and topology are subject to their existing validity rules, not a new grid or
`[0,1]` clamping pass.

Examples:

- A `100 x 100` texture becomes `200 x 200` with the same framing. After explicit
  confirmation, a vertex at `(50, 50)` stays there; its UV `(0.5, 0.5)` samples
  the new raster at continuous coordinate `(100, 100)`. The model does not
  double in size.
- A `100 x 100` texture becomes `50 x 50` by uniform downsampling. The same rule
  applies after confirmation; the model remains the same size at lower image
  resolution.
- A `100 x 100` image gets padding to `200 x 200`. This is **not** the first
  example: the user must keep/exclude it, not confirm a same-framing resample.
  V1 cannot detect padding from dimensions alone. Replacing it anyway would
  shrink the artwork inside the mesh.
- A `100 x 100` texture becomes `200 x 150`. V1 holds it. There is no automatic
  nonuniform stretch mode.
- After a confirmed `100 -> 200` resolution update, a second `200 -> 200`
  artwork update compares against the current `200`-pixel texture, not the
  unchanged `100`-unit model bounds. It must not accumulate scaling.

Changing model size is a separate editor operation. Crop/padding UV correction
and automatic source alignment are explicitly unsupported by v1, not deferred
branches whose behavior an implementer may guess.

## Preserved State And Batch Boundaries

For each existing matched layer, preserve IDs, names, hierarchy, placement,
reference bounds, mesh arrays/divisions, visibility, opacity, blend settings,
draw order, masks, and all authored rig/animation references and values.
PSD-token association follows the existing SeeThrough metadata boundary: only a
selected eligible SeeThrough mesh may acquire or replace `psdLeafToken` after a
unique name match. The incoming token must occur once in the input and must not
belong to another existing node; planned assignments must not create duplicates.
An equal token is unchanged. This may replace a different old token, not only
fill an absent one. It belongs in the same history entry and must not rewrite
other import metadata. No other existing-layer metadata change is permitted.

Held/unselected layers retain **everything**, including pixels, metadata, and
token associations. A layer absent from the incoming PSD is not deleted.
Selected replacements with identical pixel dimensions and RGBA content and no
metadata change are no-ops and must not create an otherwise empty history entry.
If the entire selection is a no-op, finish without changing project, textures,
or history and report no changes through the existing dialog feedback.

V1 makes the PSD reimport action **update-only**, including same-size batches.
This intentionally removes new-layer addition from that action: the current
planner/dialog can add layers, but must no longer offer or count those additions
as successful updates. List unmatched layers as not added. Do not retain a
legacy reimport mode that silently copies source coordinates into model state.
Ordinary initial PSD import is unchanged. V1 adds no replacement add-layer
workflow; adding/positioning new artwork within an already edited model is
outside this contract, not an implied existing capability or an implementation
requirement to invent. Source pixel coordinates must not be guessed to be
current model coordinates.

## Apply, Failure, Undo, And Redo

Analyze the selected PSD once into prepared images and build the preview from
that result. Existing metadata-only security preflight still precedes pixel
decoding; "once" means one full pixel decode, not removal of validation passes.
Apply uses those same images and the selected associations: it
does not reread the file or decode a second version. The pending operation owns
its prepared canvases; display read-only derivatives where needed, and do not
expose writable references to other editor operations. Cancel/disposal releases
the prepared resources not retained by committed history.

Capture the project object, both history stack identities, texture-store
revision, and owned pixel snapshots of matched live textures before analysis.
Record each matched texture's canvas identity, dimensions, and content identity
from those snapshot bytes. Immediately before a synchronous commit, compare
the cheap project/history identities and store revision, then validate matched
live texture identities once. Any mismatch or read failure invalidates the
preview and requires reanalysis without writes. Stack lengths or positions
alone are insufficient because merging and bounded history can keep them
unchanged. Reuse existing store identities/revisions; do not build a classifier
for "relevant edits" or a general change-tracking framework. View-only state
outside these captured inputs does not invalidate the preview.

This detects ordinary project/history/store API updates and changes to the
matched live pixels. It is not an event log for unrelated direct canvas writes
or transient changes restored to the same pixels. Existing project/history
writers must retain their replacement-based update discipline. No asynchronous
yield is allowed between the final freshness check and commit; asynchronous
preparation must finish before that check.

Matched live texture identity includes dimensions and pixel content (or an
existing revision proven to cover all writes to both). An RGBA-only hash is
insufficient: different dimensions can share the same byte sequence. The current
canvas API permits in-place mutation, so a store revision alone is not proof of
pixel freshness. Prepared-output rehashing may be omitted when the exclusive
ownership above is enforced; this does not remove live-input freshness checks.

Before touching live state, validate the entire selected set and prepare its
project result, history snapshots/effects, and canvas resources needed by the
existing commit/rollback path under current limits. Do not decode the PSD again.
Any preparation error or cancellation leaves project, textures, and undo/redo
stacks unchanged. Keep this preparation local to the PSD/history integration,
not a new generic transaction or resource-management subsystem.

One successful Apply creates **one history entry covering both project and
texture changes**, with renderer invalidation. Use the existing project/history
and texture-effect facilities; do not introduce a general transaction framework.
Wiring those facilities together safely is nevertheless required: wrapping the
current `replaceProject` call alone does not include textures in rollback.
Existing texture history captures pixel snapshots and performs content-conflict
checks. Keep those protections: retaining a reference to a shared mutable live
canvas is not a snapshot. This contract does not require converting the editor
to immutable canvases or copy-on-write textures to simplify Undo/Redo.

An ordinary commit error must roll back the whole selected batch; no first-N
partial success is allowed. The same rule applies to Undo/Redo preparation and
conflict checks: finish them before modifying live project, texture maps, or
history stacks. This is not a promise of recovery from process termination or
unrecoverable out-of-memory failure.

- Undo restores previous project values, texture pixels, and pixel dimensions.
- Redo restores the exact committed project and prepared pixels, without
  reopening the PSD or allocating new layer identities.
- Failure leaves the current state and history position unchanged.
- Resource ownership must retain the required old/new pixels for the lifetime
  of the history entry and release them through existing history cleanup.

## Security And Compatibility

Keep PSD validation-before-decode, bounded inputs, suppressed decoder diagnostics,
and fixed/localized failure messages. Error, telemetry, and diagnostic records
must not contain raw decoder exceptions, filesystem paths, raster contents, or
source PSD metadata. Artwork and approved authoring fields remain subject to
their normal save/export policy; do not add preview diagnostics to those formats.
Preview names are untrusted text rendered through normal escaping. No persistent
path/provenance field or external service is required by this rule.
Layer names belong only in the preview, not logged reason strings. If a reason
is recorded, use a fixed reason code with no source-derived fields; this does
not require adding new logging or telemetry.

Manual PNG reimport keeps its existing strict bounds/placement contract. Do not
relax `assertManualPngReimportMatchesLayer` or reinterpret its `trimmedBounds`,
`finalOrigin`, or source dimensions to implement PSD texture replacement.
PSD texture replacement does not rebase manual-PNG metadata. Manual PNG still
validates prepared bounds and placement against the preserved authored geometry
and its original import metadata, independently of current texture dimensions.
For example, after PSD replaces a `100 x 100` texture with `200 x 200` while
keeping `100 x 100` authored bounds, a subsequent PNG with prepared `100 x 100`
bounds and the original trim/origin conditions may intentionally restore a
`100 x 100` texture. Prepared `200 x 200` PNG bounds still fail that contract.
These sizes refer to prepared textures, not necessarily the untrimmed PNG file.
A successful later PNG import retains its existing metadata-rebuild behavior;
it is not required to preserve every metadata field bit-for-bit. Do not exclude
all metadata-bearing PSD targets or relax PNG matching merely to avoid this
distinction. Provider-specific invariants remain subject to focused consumer
verification, not an assertion that all import metadata is interchangeable.

Manual PNG reimport also commits one image-inclusive history entry. It captures
the old project and owned old pixels before asynchronous file/decode work, then
uses the existing snapshot/effect facilities and the same freshness and ordinary
failure guarantees described above. Missing old texture data deliberately fails
before IO; this operation does not create a separate missing-image recovery mode.
Undo/Redo can cross PSD and PNG replacements in either order and restores exact
pixels, dimensions and metadata without reading either source again. An exact
pixel/dimension/metadata no-op preserves project, texture, versions and both
history stacks, including redo. A metadata-only change records no texture effect.
Bounds validation stays unchanged. Error feedback uses fixed localized messages,
never raw IO/decoder errors; post-commit UI notification failure does not undo a
successful import or report it as an uncommitted operation.

During implementation, identify existing consumers that convert model geometry
to texture pixels and verify they use actual texture dimensions for pixel work
and authored coordinates for geometry. Save/reload and atlas export are required
examples, not an exhaustive consumer list. Do not introduce a universal
coordinate-conversion layer or migration; fix only demonstrated assumptions in
the affected consumers, preserving the geometry/pixel distinction above.
No runtime, C ABI, package-publication, or private product surface is added.

## Acceptance Criteria

Test user-visible data retention and realistic failure modes, not a copied
version of the eligibility function. These cases may share fixtures and be
combined where they exercise the same boundary.

1. Confirmed `100 x 100 -> 200 x 200`, then `200 x 200 -> 200 x 200`: new pixels
   and actual raster sizes are used; custom topology/UVs, authored bounds, skin,
   bindings, and representative animation/physics values remain unchanged.
2. Same-size paint update on a hand-edited, non-grid mesh: no regeneration even
   when its vertex count differs from the default grid. Same size does not mean
   identical pixels or an empty change.
3. Unconfirmed size changes and user-excluded crop/padding stay unchanged, even
   at equal aspect/size. Do not assert automatic crop detection. Aspect changes,
   absent old textures, duplicate name fallback, and multiple leaves resolving
   to one target remain held. A duplicated token may use a unique name fallback,
   but never FIFO assignment. Invalid/oversized PSD data is rejected before live
   mutation. Changing the confirmed resolution-change selection requires a new
   confirmation; excluding a name conflict does not rerun matching.
4. Partial selection and unmatched/removed layers: only selected eligible
   existing layers change; nothing else is moved, recreated, added, or deleted.
5. Changed PSD placement/document dimensions: authored project/layer coordinates
   remain unchanged, and the preview does not claim inferred source alignment.
6. One Undo and one Redo restore exact old/new pixels, dimensions, metadata,
   project values, and renderer output. Redo does not read the input file again.
7. A project switch, committed project/history/store update, or changed matched
   texture after preview invalidates Apply without overwriting newer state.
   Cover an update with unchanged history length and dimensions as part of live
   texture identity; use a same-RGBA/different-dimensions case if hashing is used.
   Prepared pixels are operation-owned rather than exposed mutable live inputs;
   do not require redundant hashing tests for exclusively owned outputs.
8. Failure on a later selected texture during preparation/promotion, or failed
   Undo/Redo resource preparation: no partial image/project/history update.
9. Save/reload and atlas export after a resolution replacement retain the new
   raster resolution with the old authored geometry; no consumer substitutes
   layer bounds for actual texture dimensions.
10. Existing fixed-message PSD error tests and manual PNG mismatch rejection
    remain valid; no raw exception detail is exposed by the new preview/errors.
    Combine the resolution replacement case with a subsequent original-condition
    prepared PNG update and a mismatched prepared PNG rejection to verify the
    preserved manual-PNG contract, texture size, geometry, mesh, and metadata.
    Undo PNG, Undo PSD, Redo PSD, Redo PNG must restore each intermediate image
    and history position, including actual Editor display. Concurrent PNG
    preparation must not overwrite a newer project, texture or history state.

## Implementation Status And Ownership

The PSD domain command now builds an update-only eligibility plan and preserves
authored geometry. The adapter owns prepared images and commits project, texture,
and image-inclusive history changes together; the dialog collects selection and
same-framing confirmation without replacing the project itself. Focused domain,
adapter, UI, texture/history and real Editor E2E tests cover the acceptance
criteria, including displayed pixels, save/reload, atlas export and the subsequent
manual-PNG sequence. Passing tests and review are not release approval.

Implementation belongs to the current domain command, PSD adapter/dialog, and
their existing history/texture infrastructure. The parser must retain incoming
document dimensions for an honest preview, not silently treat them as model
dimensions. No broad model-coordinate migration or new source-baseline schema
is required for the user-confirmed framing approach defined here.

Relevant existing surfaces:

- [PSD domain command](../../../packages/editor-core/src/psd-reimport-command.ts)
- [PSD adapter](../../../src/lib/psd-reimport.ts)
- [Reimport dialog](../../../src/components/ReimportDialog.tsx)
- [Texture storage/history effects](../../../src/lib/texture-store.ts)
- [Project history](../../../src/stores/historyStore.ts)
- [Project mutation boundary](../../../src/stores/projectMutator.ts)
- [Manual PNG reimport contract](../../../packages/editor-core/src/manual-png-reimport-command.ts)
- [Developer index](../index.md)
