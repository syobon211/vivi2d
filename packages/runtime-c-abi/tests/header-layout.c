#include "vivi_runtime.h"

#include <stddef.h>
#include <stdint.h>

#if !defined(__STDC_VERSION__) || __STDC_VERSION__ < 201112L
#error "Vivi2D C ABI layout checks require C11 _Static_assert"
#endif

#define VIVI_ASSERT_LAYOUT(type, size, align) \
  _Static_assert(sizeof(type) == (size), #type " size drift"); \
  _Static_assert(_Alignof(type) == (align), #type " alignment drift")

#define VIVI_ASSERT_OFFSET(type, field, offset) \
  _Static_assert(offsetof(type, field) == (offset), #type "." #field " offset drift")

_Static_assert(sizeof(void*) == 8, "Vivi2D C ABI v0.1 layout is 64-bit only");

VIVI_ASSERT_LAYOUT(ViviVersion, 16, 4);
VIVI_ASSERT_OFFSET(ViviVersion, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviVersion, major, 4);
VIVI_ASSERT_OFFSET(ViviVersion, minor, 8);
VIVI_ASSERT_OFFSET(ViviVersion, patch, 12);

VIVI_ASSERT_LAYOUT(ViviRuntimeLimits, 88, 8);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, _reserved0, 4);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_payload_bytes, 8);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_texture_bytes, 16);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_textures, 24);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_layers, 28);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_meshes, 32);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_vertices_per_mesh, 36);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_indices_per_mesh, 40);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_bones, 44);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_ik_controllers, 48);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_physics_groups, 52);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_pendulums_per_physics_group, 56);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_parameters, 60);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_binding_points, 64);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_colliders, 68);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_animation_clips, 72);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_state_machines, 76);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_states_per_state_machine, 80);
VIVI_ASSERT_OFFSET(ViviRuntimeLimits, max_transitions_per_state_machine, 84);

VIVI_ASSERT_LAYOUT(ViviCreateError, 264, 4);
VIVI_ASSERT_OFFSET(ViviCreateError, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviCreateError, status, 4);
VIVI_ASSERT_OFFSET(ViviCreateError, message, 8);

VIVI_ASSERT_LAYOUT(ViviTextureSnapshot, 64, 8);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, _reserved0, 4);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, id, 8);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, width, 16);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, height, 20);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, pixel_format, 24);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, color_space, 28);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, pixels, 32);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, pixel_byte_len, 40);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, row_stride, 48);
VIVI_ASSERT_OFFSET(ViviTextureSnapshot, host_image_id, 56);

VIVI_ASSERT_LAYOUT(ViviParameterInfo, 48, 8);
VIVI_ASSERT_OFFSET(ViviParameterInfo, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviParameterInfo, _reserved0, 4);
VIVI_ASSERT_OFFSET(ViviParameterInfo, id, 8);
VIVI_ASSERT_OFFSET(ViviParameterInfo, min, 16);
VIVI_ASSERT_OFFSET(ViviParameterInfo, max, 24);
VIVI_ASSERT_OFFSET(ViviParameterInfo, default_value, 32);
VIVI_ASSERT_OFFSET(ViviParameterInfo, current_value, 40);

VIVI_ASSERT_LAYOUT(ViviHitResult, 48, 8);
VIVI_ASSERT_OFFSET(ViviHitResult, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviHitResult, _reserved0, 4);
VIVI_ASSERT_OFFSET(ViviHitResult, collider_id, 8);
VIVI_ASSERT_OFFSET(ViviHitResult, layer_id, 16);
VIVI_ASSERT_OFFSET(ViviHitResult, mesh_id, 24);
VIVI_ASSERT_OFFSET(ViviHitResult, x, 32);
VIVI_ASSERT_OFFSET(ViviHitResult, y, 40);

VIVI_ASSERT_LAYOUT(ViviPlaybackState, 24, 8);
VIVI_ASSERT_OFFSET(ViviPlaybackState, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviPlaybackState, playing, 4);
VIVI_ASSERT_OFFSET(ViviPlaybackState, loop, 5);
VIVI_ASSERT_OFFSET(ViviPlaybackState, _reserved0, 6);
VIVI_ASSERT_OFFSET(ViviPlaybackState, clip_id, 8);
VIVI_ASSERT_OFFSET(ViviPlaybackState, time_seconds, 16);

VIVI_ASSERT_LAYOUT(ViviExpressionPresetInfo, 48, 8);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, _reserved0, 4);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, id, 8);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, name, 16);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, color, 24);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, hotkey, 32);
VIVI_ASSERT_OFFSET(ViviExpressionPresetInfo, parameter_value_count, 40);

VIVI_ASSERT_LAYOUT(ViviMeshSnapshot, 128, 8);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, _reserved0, 4);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, id, 8);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, texture_id, 16);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, vertices, 24);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, vertex_float_count, 32);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, uvs, 40);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, uv_float_count, 48);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, indices, 56);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, index_count, 64);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, x, 72);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, y, 76);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, opacity, 80);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, draw_order, 84);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, blend_mode, 88);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, visible, 92);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, culled, 93);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, has_multiply_color, 94);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, has_screen_color, 95);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, multiply_color, 96);
VIVI_ASSERT_OFFSET(ViviMeshSnapshot, screen_color, 112);

int main(void) {
  return 0;
}
