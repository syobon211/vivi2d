#include "vivi_png.h"

#include <stddef.h>
#include <stdint.h>

#if defined(__cplusplus)
#define VIVI_TEST_STATIC_ASSERT static_assert
#define VIVI_TEST_ALIGNOF(type) alignof(type)
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
#define VIVI_TEST_STATIC_ASSERT _Static_assert
#define VIVI_TEST_ALIGNOF(type) _Alignof(type)
#else
#error "Vivi2D PNG ABI layout checks require C11 or C++11"
#endif

#define VIVI_ASSERT_LAYOUT(type, size, align) \
  VIVI_TEST_STATIC_ASSERT(sizeof(type) == (size), #type " size drift"); \
  VIVI_TEST_STATIC_ASSERT(VIVI_TEST_ALIGNOF(type) == (align), #type " alignment drift")
#define VIVI_ASSERT_OFFSET(type, field, offset) \
  VIVI_TEST_STATIC_ASSERT(offsetof(type, field) == (offset), #type "." #field " offset drift")

VIVI_TEST_STATIC_ASSERT(sizeof(ViviPngStatus) == 4, "PNG status width drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_SHA256_BYTES == 32u, "SHA-256 width drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_OK == 0, "PNG status drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_ERR_INVALID_ARGUMENT == 1, "PNG status drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_ERR_UNSUPPORTED == 2, "PNG status drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_ERR_MALFORMED == 3, "PNG status drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_ERR_LIMIT == 4, "PNG status drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_ERR_DIMENSION == 5, "PNG status drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_ERR_CONTENT_HASH_MISMATCH == 6, "PNG status drift");

VIVI_TEST_STATIC_ASSERT(VIVI_PNG_RGBA8_V1_MAX_WIDTH == 8192u, "PNG width limit drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_RGBA8_V1_MAX_HEIGHT == 8192u, "PNG height limit drift");
VIVI_TEST_STATIC_ASSERT(VIVI_PNG_RGBA8_V1_MAX_PIXELS == UINT64_C(67108864), "PNG pixel limit drift");
VIVI_TEST_STATIC_ASSERT(
  VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES == UINT64_C(67108864),
  "PNG input-byte limit drift"
);
VIVI_TEST_STATIC_ASSERT(
  VIVI_PNG_RGBA8_V1_MAX_TEXTURE_BYTES == UINT64_C(268435456),
  "PNG output-byte limit drift"
);

VIVI_ASSERT_LAYOUT(ViviPngInfo, 24, 8);
VIVI_ASSERT_OFFSET(ViviPngInfo, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviPngInfo, width, 4);
VIVI_ASSERT_OFFSET(ViviPngInfo, height, 8);
VIVI_ASSERT_OFFSET(ViviPngInfo, _reserved0, 12);
VIVI_ASSERT_OFFSET(ViviPngInfo, required_output_bytes, 16);

VIVI_ASSERT_LAYOUT(ViviPngLimits, 40, 8);
VIVI_ASSERT_OFFSET(ViviPngLimits, struct_size, 0);
VIVI_ASSERT_OFFSET(ViviPngLimits, max_width, 4);
VIVI_ASSERT_OFFSET(ViviPngLimits, max_height, 8);
VIVI_ASSERT_OFFSET(ViviPngLimits, _reserved0, 12);
VIVI_ASSERT_OFFSET(ViviPngLimits, max_pixels, 16);
VIVI_ASSERT_OFFSET(ViviPngLimits, max_png_input_bytes, 24);
VIVI_ASSERT_OFFSET(ViviPngLimits, max_texture_bytes, 32);

static const ViviPngLimits candidate_limits = VIVI_PNG_RGBA8_V1_LIMITS;

int main(void) {
  return candidate_limits.struct_size == sizeof(ViviPngLimits) &&
      candidate_limits.max_width == VIVI_PNG_RGBA8_V1_MAX_WIDTH &&
      candidate_limits.max_height == VIVI_PNG_RGBA8_V1_MAX_HEIGHT &&
      candidate_limits.max_pixels == VIVI_PNG_RGBA8_V1_MAX_PIXELS &&
      candidate_limits.max_png_input_bytes == VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES &&
      candidate_limits.max_texture_bytes == VIVI_PNG_RGBA8_V1_MAX_TEXTURE_BYTES
    ? 0
    : 1;
}
