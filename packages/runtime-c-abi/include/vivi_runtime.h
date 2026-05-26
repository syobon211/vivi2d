#ifndef VIVI_RUNTIME_H
#define VIVI_RUNTIME_H

#include <stddef.h>
#include <stdint.h>

#ifndef VIVI_EXPORT
#if defined(_WIN32) && defined(VIVI_RUNTIME_SHARED)
#if defined(VIVI_RUNTIME_BUILD)
#define VIVI_EXPORT __declspec(dllexport)
#else
#define VIVI_EXPORT __declspec(dllimport)
#endif
#elif (defined(__GNUC__) || defined(__clang__)) && \
  defined(VIVI_RUNTIME_SHARED) && defined(VIVI_RUNTIME_BUILD)
/* POSIX consumers do not need an import attribute; only shared-library builds
   mark exported symbols as default-visible. */
#define VIVI_EXPORT __attribute__((visibility("default")))
#else
#define VIVI_EXPORT
#endif
#endif

#ifndef VIVI_CALL
#if defined(_MSC_VER) || defined(__MINGW32__) || defined(__MINGW64__)
#define VIVI_CALL __cdecl
#else
#define VIVI_CALL
#endif
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* All public const char* inputs and returned strings are UTF-8 and
   NUL-terminated unless a function explicitly accepts bytes plus length.
   Returned strings and borrowed metadata pointers are runtime/model-owned and
   must not be freed by callers. vivi_model_load() accepts UTF-8 RFC 8259 JSON
   bytes and does not require NUL termination. */

/* Callers must check ViviStatus before reading output fields. On non-OK return,
   output fields other than struct_size are unspecified unless the function
   explicitly documents a failure value. */

/* Handles are single-thread confined in ABI v0.1. A ViviRuntime* and all models
   created from it must be called from the creating thread unless a future
   capability query explicitly advertises cross-thread support. Detected
   cross-thread calls return VIVI_ERR_EVALUATION. */

/* Borrowed pointer invalidation summary:
   - render mesh buffers: next update, model reload, or model destroy
   - texture/static metadata: model reload or model destroy
   - playback clip_id: play/stop/seek, update, model reload, or model destroy
   - state-machine state ID: set_state_machine_state, update, model reload, or
     model destroy
   - last-error message: next API call on the same handle except repeated
     last-error retrieval, or handle destroy
   set_input and apply_expression_preset do not invalidate borrowed dynamic
   strings until a later update unless a future spec version says otherwise. */

/* uint8_t boolean inputs must be 0 or 1. Other values return
   VIVI_ERR_INVALID_ARGUMENT. uint8_t boolean outputs are always 0 or 1. */

#define VIVI_RUNTIME_ABI_VERSION ((uint32_t)((0u << 16) | 1u))

typedef struct ViviRuntime ViviRuntime;
typedef struct ViviModel ViviModel;

typedef int32_t ViviStatus;
enum {
  VIVI_OK = 0,
  VIVI_ERR_INVALID_ARGUMENT = 1,
  VIVI_ERR_UNSUPPORTED_OPERATION = 2,
  VIVI_ERR_PARSE = 3,
  VIVI_ERR_UNSUPPORTED_SPEC_VERSION = 4,
  VIVI_ERR_PRIVATE_PROFILE = 5,
  VIVI_ERR_LIMIT_EXCEEDED = 6,
  VIVI_ERR_VALIDATION = 7,
  VIVI_ERR_TEXTURE = 8,
  VIVI_ERR_EVALUATION = 9,
  VIVI_ERR_INTERNAL = 10
};

typedef int32_t ViviBlendMode;
enum {
  VIVI_BLEND_MODE_NORMAL = 0,
  VIVI_BLEND_MODE_MULTIPLY = 1,
  VIVI_BLEND_MODE_SCREEN = 2,
  VIVI_BLEND_MODE_ADD = 3
};

typedef int32_t ViviPixelFormat;
enum {
  VIVI_PIXEL_FORMAT_RGBA8_STRAIGHT = 0
};

typedef int32_t ViviColorSpace;
enum {
  VIVI_COLOR_SPACE_SRGB = 0
};

typedef struct ViviVersion {
  uint32_t struct_size;
  uint32_t major;
  uint32_t minor;
  uint32_t patch;
} ViviVersion;

typedef struct ViviRuntimeLimits {
  uint32_t struct_size;
  /* Reserved input field. Must be zero. */
  uint32_t _reserved0;
  /* ABI v0.1 exposes model/resource ceilings. JSON nesting depth and decoded
     string-token limits remain fixed to the native Runtime Spec ceilings. */
  uint64_t max_payload_bytes;
  uint64_t max_texture_bytes;
  uint32_t max_textures;
  uint32_t max_layers;
  uint32_t max_meshes;
  uint32_t max_vertices_per_mesh;
  uint32_t max_indices_per_mesh;
  uint32_t max_bones;
  uint32_t max_ik_controllers;
  uint32_t max_physics_groups;
  uint32_t max_pendulums_per_physics_group;
  uint32_t max_parameters;
  uint32_t max_binding_points;
  uint32_t max_colliders;
  uint32_t max_animation_clips;
  uint32_t max_state_machines;
  uint32_t max_states_per_state_machine;
  uint32_t max_transitions_per_state_machine;
} ViviRuntimeLimits;

typedef struct ViviCreateError {
  /* Must be at least sizeof(ViviCreateError); smaller values are invalid. */
  uint32_t struct_size;
  ViviStatus status;
  /* UTF-8, NUL-terminated, truncated at a UTF-8 codepoint boundary if needed.
     Usable message bytes are at most 255 plus the trailing NUL. */
  char message[256];
} ViviCreateError;

typedef struct ViviTextureSnapshot {
  uint32_t struct_size;
  uint32_t _reserved0;
  /* Borrowed model-owned UTF-8 string, valid until model reload or destroy. */
  const char* id;
  uint32_t width;
  uint32_t height;
  ViviPixelFormat pixel_format;
  ViviColorSpace color_space;
  /* Borrowed model-owned pixels, valid until model reload or destroy. Set only
     for embedded RGBA8 textures. */
  const uint8_t* pixels;
  uint64_t pixel_byte_len;
  uint64_t row_stride;
  /* Borrowed model-owned UTF-8 string, valid until model reload or destroy. Set
     only for host-owned image textures. Exactly one of pixels or host_image_id
     is non-NULL. */
  const char* host_image_id;
} ViviTextureSnapshot;

typedef struct ViviParameterInfo {
  uint32_t struct_size;
  uint32_t _reserved0;
  /* Borrowed model-owned UTF-8 string, valid until model reload or destroy. */
  const char* id;
  double min;
  double max;
  double default_value;
  double current_value;
} ViviParameterInfo;

typedef struct ViviHitResult {
  uint32_t struct_size;
  uint32_t _reserved0;
  /* Borrowed model-owned UTF-8 strings, valid until model reload or destroy.
     layer_id and mesh_id may be NULL for rectangle or circle collider hits. */
  const char* collider_id;
  const char* layer_id;
  const char* mesh_id;
  double x;
  double y;
} ViviHitResult;

typedef struct ViviPlaybackState {
  uint32_t struct_size;
  uint8_t playing;
  uint8_t loop;
  uint8_t _reserved0[2];
  /* Borrowed model-owned UTF-8 string, valid until next update, playback
     mutation, model reload, or destroy. */
  const char* clip_id;
  double time_seconds;
} ViviPlaybackState;

typedef struct ViviExpressionPresetInfo {
  uint32_t struct_size;
  uint32_t _reserved0;
  /* Borrowed model-owned UTF-8 strings, valid until model reload or destroy.
     color is either NULL or #RRGGBB. hotkey is either NULL or a decimal
     non-negative integer encoded as ASCII. */
  const char* id;
  const char* name;
  const char* color;
  const char* hotkey;
  uint64_t parameter_value_count;
} ViviExpressionPresetInfo;

typedef struct ViviMeshSnapshot {
  uint32_t struct_size;
  uint32_t _reserved0;
  /* Borrowed model-owned UTF-8 strings, valid until model reload or destroy. */
  const char* id;
  const char* texture_id;
  /* vertices/uvs are aligned to _Alignof(float); indices are aligned to
     _Alignof(uint32_t). They are borrowed model-owned buffers valid until the
     next update, model reload, or destroy. No wider SIMD alignment is
     guaranteed. */
  const float* vertices;
  uint64_t vertex_float_count;
  const float* uvs;
  uint64_t uv_float_count;
  const uint32_t* indices;
  uint64_t index_count;
  float x;
  float y;
  float opacity;
  int32_t draw_order;
  ViviBlendMode blend_mode;
  uint8_t visible;
  uint8_t culled;
  uint8_t has_multiply_color;
  uint8_t has_screen_color;
  float multiply_color[4];
  float screen_color[4];
} ViviMeshSnapshot;

#if !defined(VIVI_RUNTIME_SKIP_LAYOUT_ASSERTS)
#if defined(_WIN32)
#if !defined(_M_X64) && !defined(_M_IX86) && !defined(_M_ARM64)
#error "Vivi2D C ABI v0.1 supports only known little-endian Windows targets"
#endif
#elif defined(__BYTE_ORDER__) && defined(__ORDER_LITTLE_ENDIAN__) && \
  (__BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__)
/* Compiler reports little-endian. */
#else
#error "Vivi2D C ABI v0.1 supports little-endian targets only"
#endif
#if defined(__cplusplus)
#if !defined(_MSC_VER) && __cplusplus < 201103L
#error "Vivi2D C ABI layout asserts require C++11 or newer"
#endif
#define VIVI_RUNTIME_STATIC_ASSERT static_assert
#define VIVI_RUNTIME_ALIGNOF(type) alignof(type)
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
#define VIVI_RUNTIME_STATIC_ASSERT _Static_assert
#define VIVI_RUNTIME_ALIGNOF(type) _Alignof(type)
#else
#error "Vivi2D C ABI layout asserts require C11 or C++11"
#endif
#if defined(VIVI_RUNTIME_STATIC_ASSERT)
#define VIVI_RUNTIME_ASSERT_LAYOUT(type, size, align) \
  VIVI_RUNTIME_STATIC_ASSERT(sizeof(type) == (size), #type " size drift"); \
  VIVI_RUNTIME_STATIC_ASSERT(VIVI_RUNTIME_ALIGNOF(type) == (align), #type " alignment drift")
#define VIVI_RUNTIME_ASSERT_OFFSET(type, field, offset) \
  VIVI_RUNTIME_STATIC_ASSERT(offsetof(type, field) == (offset), #type "." #field " offset drift")

VIVI_RUNTIME_STATIC_ASSERT(sizeof(void*) == 8, "Vivi2D C ABI v0.1 is 64-bit only");
VIVI_RUNTIME_ASSERT_LAYOUT(ViviVersion, 16, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviVersion, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviVersion, major, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviVersion, minor, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviVersion, patch, 12);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviRuntimeLimits, 88, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, _reserved0, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_payload_bytes, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_texture_bytes, 16);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_textures, 24);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_layers, 28);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_meshes, 32);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_vertices_per_mesh, 36);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_indices_per_mesh, 40);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_bones, 44);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_ik_controllers, 48);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_physics_groups, 52);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_pendulums_per_physics_group, 56);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_parameters, 60);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_binding_points, 64);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_colliders, 68);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_animation_clips, 72);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_state_machines, 76);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_states_per_state_machine, 80);
VIVI_RUNTIME_ASSERT_OFFSET(ViviRuntimeLimits, max_transitions_per_state_machine, 84);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviCreateError, 264, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviCreateError, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviCreateError, status, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviCreateError, message, 8);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviTextureSnapshot, 64, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, _reserved0, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, id, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, width, 16);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, height, 20);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, pixel_format, 24);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, color_space, 28);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, pixels, 32);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, pixel_byte_len, 40);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, row_stride, 48);
VIVI_RUNTIME_ASSERT_OFFSET(ViviTextureSnapshot, host_image_id, 56);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviParameterInfo, 48, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, _reserved0, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, id, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, min, 16);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, max, 24);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, default_value, 32);
VIVI_RUNTIME_ASSERT_OFFSET(ViviParameterInfo, current_value, 40);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviHitResult, 48, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, _reserved0, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, collider_id, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, layer_id, 16);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, mesh_id, 24);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, x, 32);
VIVI_RUNTIME_ASSERT_OFFSET(ViviHitResult, y, 40);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviPlaybackState, 24, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviPlaybackState, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviPlaybackState, playing, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviPlaybackState, loop, 5);
VIVI_RUNTIME_ASSERT_OFFSET(ViviPlaybackState, _reserved0, 6);
VIVI_RUNTIME_ASSERT_OFFSET(ViviPlaybackState, clip_id, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviPlaybackState, time_seconds, 16);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviExpressionPresetInfo, 48, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, _reserved0, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, id, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, name, 16);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, color, 24);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, hotkey, 32);
VIVI_RUNTIME_ASSERT_OFFSET(ViviExpressionPresetInfo, parameter_value_count, 40);
VIVI_RUNTIME_ASSERT_LAYOUT(ViviMeshSnapshot, 128, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, struct_size, 0);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, _reserved0, 4);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, id, 8);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, texture_id, 16);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, vertices, 24);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, vertex_float_count, 32);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, uvs, 40);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, uv_float_count, 48);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, indices, 56);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, index_count, 64);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, x, 72);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, y, 76);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, opacity, 80);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, draw_order, 84);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, blend_mode, 88);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, visible, 92);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, culled, 93);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, has_multiply_color, 94);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, has_screen_color, 95);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, multiply_color, 96);
VIVI_RUNTIME_ASSERT_OFFSET(ViviMeshSnapshot, screen_color, 112);

#undef VIVI_RUNTIME_ASSERT_OFFSET
#undef VIVI_RUNTIME_ASSERT_LAYOUT
#undef VIVI_RUNTIME_ALIGNOF
#undef VIVI_RUNTIME_STATIC_ASSERT
#endif
#endif

VIVI_EXPORT uint32_t VIVI_CALL vivi_get_abi_version(void);
/* Returns the native runtime build/package version. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_get_runtime_version(ViviVersion* out_version);
/* Returns the Runtime Spec version range accepted by this runtime. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_get_supported_spec_version_range(
  ViviVersion* out_min_version,
  ViviVersion* out_max_version
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_runtime_create(
  const ViviRuntimeLimits* limits,
  ViviCreateError* out_error,
  /* Set to NULL on failure. */
  ViviRuntime** out_runtime
);
/* NULL is a no-op. Destroying a runtime does not destroy or invalidate models
   that were already loaded from it. Those models must still be destroyed with
   vivi_model_destroy. */
VIVI_EXPORT void VIVI_CALL vivi_runtime_destroy(ViviRuntime* runtime);
/* Returned pointer is owned by runtime, remains valid until the next API call
   on the same handle except repeated last-error retrieval, or until
   vivi_runtime_destroy(), and must not be freed. */
VIVI_EXPORT const char* VIVI_CALL vivi_runtime_last_error_message(
  const ViviRuntime* runtime
);
/* Returned pointer is owned by model, remains valid until the next API call on
   the same handle except repeated last-error retrieval, or until
   vivi_model_destroy(), and must not be freed. */
VIVI_EXPORT const char* VIVI_CALL vivi_model_last_error_message(const ViviModel* model);
/* Copies data into runtime-owned memory before parse/hydration and never stores
   caller-owned payload pointers. data must be non-NULL. data_len == 0 with a
   non-NULL data pointer is a parse error for an empty JSON payload. Sets
   *out_model to NULL on failure. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_load(
  ViviRuntime* runtime,
  const uint8_t* data,
  uint64_t data_len,
  /* Set to NULL on failure. */
  ViviModel** out_model
);
/* NULL is a no-op. */
VIVI_EXPORT void VIVI_CALL vivi_model_destroy(ViviModel* model);
/* Returns the Runtime Spec version declared by the loaded model payload. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_get_spec_version(
  const ViviModel* model,
  ViviVersion* out_version
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_set_input(
  ViviModel* model,
  const char* id,
  double value
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_get_input(
  const ViviModel* model,
  const char* id,
  /* Returns the current clamped scalar input value, including any prior
     set_input or expression-preset change, not derived binding/physics state. */
  double* out_value
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_update(
  ViviModel* model,
  double delta_seconds
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_play_clip(
  ViviModel* model,
  const char* clip_id,
  uint8_t loop,
  double start_time_seconds
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_stop_clip(ViviModel* model);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_seek_clip(
  ViviModel* model,
  double seconds
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_set_state_machine_state(
  ViviModel* model,
  const char* machine_id,
  const char* state_id
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_get_state_machine_state(
  const ViviModel* model,
  const char* machine_id,
  /* Returned pointer is owned by model and valid until the next update,
     state-machine mutation, model reload, or model destruction. */
  const char** out_state_id,
  uint8_t* out_transitioning
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_parameter_count(
  const ViviModel* model,
  uint64_t* out_count
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_parameter_info(
  const ViviModel* model,
  uint64_t parameter_index,
  ViviParameterInfo* out_info
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_texture_count(
  const ViviModel* model,
  uint64_t* out_count
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_texture_snapshot(
  const ViviModel* model,
  uint64_t texture_index,
  ViviTextureSnapshot* out_snapshot
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_expression_preset_count(
  const ViviModel* model,
  uint64_t* out_count
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_expression_preset_info(
  const ViviModel* model,
  uint64_t preset_index,
  ViviExpressionPresetInfo* out_info
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_expression_preset_value(
  const ViviModel* model,
  uint64_t preset_index,
  uint64_t value_index,
  /* Returned pointer is owned by model and valid until model reload or
     model destruction. */
  const char** out_parameter_id,
  double* out_value
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_apply_expression_preset(
  ViviModel* model,
  const char* preset_id
);
/* Returns the current render-list length, including invisible or culled meshes
   that remain in the render list. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_mesh_count(
  const ViviModel* model,
  uint64_t* out_count
);
/* render_index indexes the current render list. */
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_mesh_snapshot(
  const ViviModel* model,
  uint64_t render_index,
  ViviMeshSnapshot* out_snapshot
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_mesh_snapshot_by_id(
  const ViviModel* model,
  const char* mesh_id,
  ViviMeshSnapshot* out_snapshot
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_hit_test(
  const ViviModel* model,
  double x,
  double y,
  ViviHitResult* out_hit,
  /* When set to 0 on VIVI_OK, callers must not read out_hit fields other than
     struct_size. */
  uint8_t* out_has_hit
);
VIVI_EXPORT ViviStatus VIVI_CALL vivi_model_get_playback_state(
  const ViviModel* model,
  /* Any clip_id pointer inside out_state is owned by model and valid until the
     next update, playback mutation, model reload, or model destruction. */
  ViviPlaybackState* out_state
);

#ifdef __cplusplus
}
#endif

#endif
