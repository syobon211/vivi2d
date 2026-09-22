#ifndef VIVI_RUNTIME_EDITOR_H
#define VIVI_RUNTIME_EDITOR_H
/* Internal, opt-in ABI 0.2 candidate. Not a stable package surface.
   Requires evaluation-v1; never combine with the local asset host profile.
   Native handles are creating-thread confined. The runtime outlives children.
   All input memory is immutable during calls. Native pointer validity is the
   caller's responsibility; output buffers must not alias internal owners.
   Snapshot copy-out is atomic on ordinary returned failure. A NULL buffers
   descriptor requests metadata only. IDs are exact UTF-8 without terminators. */
#include "vivi_runtime.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VIVI_EVALUATION_ABI_VERSION ((uint32_t)2u)
#define VIVI_ERR_ABI_VERSION ((int32_t)11)
#define VIVI_ERR_DRAW_COMMANDS_INVALID ((int32_t)12)
#define VIVI_ERR_RENDER_FEATURE_REQUIRED ((int32_t)13)
#define VIVI_ERR_EVALUATION_NUMERIC ((int32_t)14)
#define VIVI_RENDER_FEATURE_DRAW_COMMANDS ((uint32_t)1u)
#define VIVI_DRAW_COMMAND_MASK_INVERT ((uint32_t)1u)

typedef struct ViviEvaluationRuntime ViviEvaluationRuntime;
typedef struct ViviPreparedEvaluation ViviPreparedEvaluation;
typedef struct ViviEvaluationBytesV2 { const uint8_t *data; uint64_t len; } ViviEvaluationBytesV2;
typedef struct ViviEvaluationMutableBytesV2 { uint8_t *data; uint64_t capacity; } ViviEvaluationMutableBytesV2;
typedef struct ViviEvaluationTextureV2 {
  uint32_t struct_size, storage_kind, width, height;
  ViviEvaluationBytesV2 id;
  uint64_t logical_size;
  uint8_t object_address[32], content_sha256[32];
  uint32_t reserved0, reserved1;
} ViviEvaluationTextureV2;
typedef struct ViviEvaluationObjectV2 {
  uint32_t struct_size, reserved;
  uint8_t object_address[32];
  ViviEvaluationBytesV2 bytes;
} ViviEvaluationObjectV2;
typedef struct ViviEvaluationLoadV2 {
  uint32_t struct_size, reserved;
  uint64_t request_generation;
  ViviEvaluationBytesV2 payload;
  const ViviEvaluationTextureV2 *textures;
  uint64_t texture_count;
  const ViviEvaluationObjectV2 *objects;
  uint64_t object_count;
} ViviEvaluationLoadV2;
typedef struct ViviEvaluationPrepareInfoV2 { uint32_t struct_size, kind, missing_count, reserved; } ViviEvaluationPrepareInfoV2;
typedef struct ViviEvaluationRequestStateV2 { uint32_t struct_size, exhausted; uint64_t latest_issued, reserved; } ViviEvaluationRequestStateV2;
typedef struct ViviEvaluationMeshBuffersV2 {
  uint32_t struct_size, reserved;
  ViviEvaluationMutableBytesV2 id, vertices, uvs, indices;
} ViviEvaluationMeshBuffersV2;
typedef struct ViviEvaluationMeshInfoV2 {
  uint32_t struct_size, mesh_slot, texture_slot, flags;
  uint64_t id_bytes, vertex_components, uv_components, index_count;
  uint32_t x_bits, y_bits, opacity_bits, blend;
  uint32_t multiply_bits[3], screen_bits[3], reserved0, reserved1;
} ViviEvaluationMeshInfoV2;
typedef struct ViviEvaluationTextureBuffersV2 {
  uint32_t struct_size, reserved;
  ViviEvaluationMutableBytesV2 id, pixels;
} ViviEvaluationTextureBuffersV2;
typedef struct ViviEvaluationTextureInfoV2 {
  uint32_t struct_size, slot, width, height, pixel_format, color_space;
  uint64_t id_bytes, pixel_bytes, row_stride;
} ViviEvaluationTextureInfoV2;
typedef struct ViviEvaluationParameterInfoV2 {
  uint32_t struct_size, reserved;
  uint64_t id_bytes, min_bits, max_bits, default_bits, current_bits, evaluated_bits;
} ViviEvaluationParameterInfoV2;
typedef struct ViviGenerations { uint64_t model_generation, topology_generation, dynamic_generation; } ViviGenerations;
typedef struct ViviDrawCommandV2 { uint32_t struct_size, command_type, mesh_index, mask_depth, flags, reserved; } ViviDrawCommandV2;

/* Existing abi-v02 legacy model views, without changing vivi_runtime.h. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_draw_command_count(const ViviModel *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_draw_commands(const ViviModel *, const ViviDrawCommandV2 **);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_generations(const ViviModel *, ViviGenerations *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_render_mesh_count_v2(const ViviModel *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_render_mesh_snapshot_v2(const ViviModel *, uint32_t, ViviMeshSnapshot *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_required_render_features(const ViviModel *, uint64_t *);

VIVI_EXPORT uint32_t VIVI_CALL vivi_evaluation_abi_version(void);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_create(ViviEvaluationRuntime **);
VIVI_EXPORT void VIVI_CALL vivi_evaluation_destroy(ViviEvaluationRuntime *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_observe_request_state(ViviEvaluationRuntime *, const ViviEvaluationRequestStateV2 *);
/* Ready kind=1, Missing kind=2; both retain a sealed owner. Failure nulls out. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepare(ViviEvaluationRuntime *, const ViviEvaluationLoadV2 *, ViviPreparedEvaluation **out, ViviEvaluationPrepareInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_retry_missing(ViviEvaluationRuntime *, ViviPreparedEvaluation **inout, const ViviEvaluationObjectV2 *, uint64_t, ViviEvaluationPrepareInfoV2 *);
VIVI_EXPORT void VIVI_CALL vivi_evaluation_prepared_destroy(ViviPreparedEvaluation *);
/* Argument/kind errors retain inout. After admission commit consumes Ready,
   including Superseded (activated=0) and counter error. Success activated=1
   performs no allocation. Cleanup by higher layers happens after publication. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_commit(ViviEvaluationRuntime *, ViviPreparedEvaluation **inout, uint32_t *activated);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_set_input(ViviEvaluationRuntime *, ViviEvaluationBytesV2, double);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_apply_expression_preset(ViviEvaluationRuntime *, ViviEvaluationBytesV2);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_update(ViviEvaluationRuntime *, double);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_generations(ViviEvaluationRuntime *, ViviGenerations *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_render_mesh_count(ViviEvaluationRuntime *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_texture_count(ViviEvaluationRuntime *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_draw_command_count(ViviEvaluationRuntime *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_parameter_count(ViviEvaluationRuntime *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_expression_preset_count(ViviEvaluationRuntime *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_required_render_features(ViviEvaluationRuntime *, uint32_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_render_mesh_snapshot(ViviEvaluationRuntime *, uint64_t, const ViviEvaluationMeshBuffersV2 *, ViviEvaluationMeshInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_texture_snapshot(ViviEvaluationRuntime *, uint64_t, const ViviEvaluationTextureBuffersV2 *, ViviEvaluationTextureInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_draw_command_snapshot(ViviEvaluationRuntime *, uint64_t, ViviDrawCommandV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_parameter_snapshot(ViviEvaluationRuntime *, uint64_t, const ViviEvaluationMutableBytesV2 *, ViviEvaluationParameterInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_get_expression_preset(ViviEvaluationRuntime *, uint64_t, const ViviEvaluationMutableBytesV2 *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_render_mesh_count(ViviPreparedEvaluation *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_texture_count(ViviPreparedEvaluation *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_draw_command_count(ViviPreparedEvaluation *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_parameter_count(ViviPreparedEvaluation *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_expression_preset_count(ViviPreparedEvaluation *, uint64_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_required_render_features(ViviPreparedEvaluation *, uint32_t *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_render_mesh_snapshot(ViviPreparedEvaluation *, uint64_t, const ViviEvaluationMeshBuffersV2 *, ViviEvaluationMeshInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_texture_snapshot(ViviPreparedEvaluation *, uint64_t, const ViviEvaluationTextureBuffersV2 *, ViviEvaluationTextureInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_draw_command_snapshot(ViviPreparedEvaluation *, uint64_t, ViviDrawCommandV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_parameter_snapshot(ViviPreparedEvaluation *, uint64_t, const ViviEvaluationMutableBytesV2 *, ViviEvaluationParameterInfoV2 *);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_evaluation_prepared_get_expression_preset(ViviPreparedEvaluation *, uint64_t, const ViviEvaluationMutableBytesV2 *, uint64_t *);

#ifdef __cplusplus
}
#define VIVI_EVAL_ASSERT(c,m) static_assert(c,m)
#else
#define VIVI_EVAL_ASSERT(c,m) _Static_assert(c,m)
#endif
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationBytesV2) == 16, "ViviEvaluationBytesV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationBytesV2, data) == 0, "ViviEvaluationBytesV2.data");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationBytesV2, len) == 8, "ViviEvaluationBytesV2.len");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationMutableBytesV2) == 16, "ViviEvaluationMutableBytesV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMutableBytesV2, data) == 0, "ViviEvaluationMutableBytesV2.data");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMutableBytesV2, capacity) == 8, "ViviEvaluationMutableBytesV2.capacity");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationTextureV2) == 112, "ViviEvaluationTextureV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, struct_size) == 0, "ViviEvaluationTextureV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, storage_kind) == 4, "ViviEvaluationTextureV2.storage_kind");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, width) == 8, "ViviEvaluationTextureV2.width");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, height) == 12, "ViviEvaluationTextureV2.height");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, id) == 16, "ViviEvaluationTextureV2.id");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, logical_size) == 32, "ViviEvaluationTextureV2.logical_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, object_address) == 40, "ViviEvaluationTextureV2.object_address");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, content_sha256) == 72, "ViviEvaluationTextureV2.content_sha256");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, reserved0) == 104, "ViviEvaluationTextureV2.reserved0");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureV2, reserved1) == 108, "ViviEvaluationTextureV2.reserved1");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationObjectV2) == 56, "ViviEvaluationObjectV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationObjectV2, struct_size) == 0, "ViviEvaluationObjectV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationObjectV2, reserved) == 4, "ViviEvaluationObjectV2.reserved");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationObjectV2, object_address) == 8, "ViviEvaluationObjectV2.object_address");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationObjectV2, bytes) == 40, "ViviEvaluationObjectV2.bytes");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationLoadV2) == 64, "ViviEvaluationLoadV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, struct_size) == 0, "ViviEvaluationLoadV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, reserved) == 4, "ViviEvaluationLoadV2.reserved");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, request_generation) == 8, "ViviEvaluationLoadV2.request_generation");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, payload) == 16, "ViviEvaluationLoadV2.payload");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, textures) == 32, "ViviEvaluationLoadV2.textures");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, texture_count) == 40, "ViviEvaluationLoadV2.texture_count");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, objects) == 48, "ViviEvaluationLoadV2.objects");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationLoadV2, object_count) == 56, "ViviEvaluationLoadV2.object_count");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationPrepareInfoV2) == 16, "ViviEvaluationPrepareInfoV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationPrepareInfoV2, struct_size) == 0, "ViviEvaluationPrepareInfoV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationPrepareInfoV2, kind) == 4, "ViviEvaluationPrepareInfoV2.kind");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationPrepareInfoV2, missing_count) == 8, "ViviEvaluationPrepareInfoV2.missing_count");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationPrepareInfoV2, reserved) == 12, "ViviEvaluationPrepareInfoV2.reserved");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationRequestStateV2) == 24, "ViviEvaluationRequestStateV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationRequestStateV2, struct_size) == 0, "ViviEvaluationRequestStateV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationRequestStateV2, exhausted) == 4, "ViviEvaluationRequestStateV2.exhausted");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationRequestStateV2, latest_issued) == 8, "ViviEvaluationRequestStateV2.latest_issued");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationRequestStateV2, reserved) == 16, "ViviEvaluationRequestStateV2.reserved");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationMeshBuffersV2) == 72, "ViviEvaluationMeshBuffersV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshBuffersV2, struct_size) == 0, "ViviEvaluationMeshBuffersV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshBuffersV2, reserved) == 4, "ViviEvaluationMeshBuffersV2.reserved");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshBuffersV2, id) == 8, "ViviEvaluationMeshBuffersV2.id");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshBuffersV2, vertices) == 24, "ViviEvaluationMeshBuffersV2.vertices");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshBuffersV2, uvs) == 40, "ViviEvaluationMeshBuffersV2.uvs");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshBuffersV2, indices) == 56, "ViviEvaluationMeshBuffersV2.indices");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationMeshInfoV2) == 96, "ViviEvaluationMeshInfoV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, struct_size) == 0, "ViviEvaluationMeshInfoV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, mesh_slot) == 4, "ViviEvaluationMeshInfoV2.mesh_slot");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, texture_slot) == 8, "ViviEvaluationMeshInfoV2.texture_slot");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, flags) == 12, "ViviEvaluationMeshInfoV2.flags");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, id_bytes) == 16, "ViviEvaluationMeshInfoV2.id_bytes");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, vertex_components) == 24, "ViviEvaluationMeshInfoV2.vertex_components");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, uv_components) == 32, "ViviEvaluationMeshInfoV2.uv_components");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, index_count) == 40, "ViviEvaluationMeshInfoV2.index_count");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, x_bits) == 48, "ViviEvaluationMeshInfoV2.x_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, y_bits) == 52, "ViviEvaluationMeshInfoV2.y_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, opacity_bits) == 56, "ViviEvaluationMeshInfoV2.opacity_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, blend) == 60, "ViviEvaluationMeshInfoV2.blend");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, multiply_bits) == 64, "ViviEvaluationMeshInfoV2.multiply_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, screen_bits) == 76, "ViviEvaluationMeshInfoV2.screen_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, reserved0) == 88, "ViviEvaluationMeshInfoV2.reserved0");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationMeshInfoV2, reserved1) == 92, "ViviEvaluationMeshInfoV2.reserved1");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationTextureBuffersV2) == 40, "ViviEvaluationTextureBuffersV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureBuffersV2, struct_size) == 0, "ViviEvaluationTextureBuffersV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureBuffersV2, reserved) == 4, "ViviEvaluationTextureBuffersV2.reserved");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureBuffersV2, id) == 8, "ViviEvaluationTextureBuffersV2.id");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureBuffersV2, pixels) == 24, "ViviEvaluationTextureBuffersV2.pixels");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationTextureInfoV2) == 48, "ViviEvaluationTextureInfoV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, struct_size) == 0, "ViviEvaluationTextureInfoV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, slot) == 4, "ViviEvaluationTextureInfoV2.slot");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, width) == 8, "ViviEvaluationTextureInfoV2.width");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, height) == 12, "ViviEvaluationTextureInfoV2.height");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, pixel_format) == 16, "ViviEvaluationTextureInfoV2.pixel_format");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, color_space) == 20, "ViviEvaluationTextureInfoV2.color_space");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, id_bytes) == 24, "ViviEvaluationTextureInfoV2.id_bytes");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, pixel_bytes) == 32, "ViviEvaluationTextureInfoV2.pixel_bytes");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationTextureInfoV2, row_stride) == 40, "ViviEvaluationTextureInfoV2.row_stride");
VIVI_EVAL_ASSERT(sizeof(ViviEvaluationParameterInfoV2) == 56, "ViviEvaluationParameterInfoV2 size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, struct_size) == 0, "ViviEvaluationParameterInfoV2.struct_size");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, reserved) == 4, "ViviEvaluationParameterInfoV2.reserved");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, id_bytes) == 8, "ViviEvaluationParameterInfoV2.id_bytes");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, min_bits) == 16, "ViviEvaluationParameterInfoV2.min_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, max_bits) == 24, "ViviEvaluationParameterInfoV2.max_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, default_bits) == 32, "ViviEvaluationParameterInfoV2.default_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, current_bits) == 40, "ViviEvaluationParameterInfoV2.current_bits");
VIVI_EVAL_ASSERT(offsetof(ViviEvaluationParameterInfoV2, evaluated_bits) == 48, "ViviEvaluationParameterInfoV2.evaluated_bits");
VIVI_EVAL_ASSERT(sizeof(ViviGenerations) == 24, "ViviGenerations size");
VIVI_EVAL_ASSERT(sizeof(ViviDrawCommandV2) == 24, "ViviDrawCommandV2 size");
#undef VIVI_EVAL_ASSERT
#endif

