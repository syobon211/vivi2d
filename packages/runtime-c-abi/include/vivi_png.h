#ifndef VIVI_PNG_H
#define VIVI_PNG_H

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

/* Reviewed Amendment 1 C surface for the frozen vivi2d.png.rgba8.v1
   semantics: exact spellings, layouts, numeric statuses, raw-digest
   representation, and limits. */
#define VIVI_PNG_RGBA8_V1_PROFILE "vivi2d.png.rgba8.v1"
#define VIVI_PNG_SHA256_BYTES UINT32_C(32)

/* Fixed-width status storage. INVALID_ARGUMENT is a separate C ABI misuse
   category, not a sixth PNG-content classification. */
typedef int32_t ViviPngStatus;
enum {
  VIVI_PNG_OK = 0,
  VIVI_PNG_ERR_INVALID_ARGUMENT = 1,
  VIVI_PNG_ERR_UNSUPPORTED = 2,
  VIVI_PNG_ERR_MALFORMED = 3,
  VIVI_PNG_ERR_LIMIT = 4,
  VIVI_PNG_ERR_DIMENSION = 5,
  VIVI_PNG_ERR_CONTENT_HASH_MISMATCH = 6
};

/* Content-result mapping required by Asset Model v1:
   UNSUPPORTED -> VIVI_ASSET_DECODING_PROFILE_UNSUPPORTED
   MALFORMED -> VIVI_ASSET_DECODE_MALFORMED
   LIMIT -> VIVI_ASSET_LIMIT_EXCEEDED
   DIMENSION -> VIVI_ASSET_DIMENSION_MISMATCH
   CONTENT_HASH_MISMATCH -> VIVI_ASSET_CONTENT_HASH_MISMATCH */

typedef struct ViviPngInfo {
  uint32_t struct_size;
  uint32_t width;
  uint32_t height;
  uint32_t _reserved0;
  uint64_t required_output_bytes;
} ViviPngInfo;

typedef struct ViviPngLimits {
  uint32_t struct_size;
  uint32_t max_width;
  uint32_t max_height;
  uint32_t _reserved0;
  uint64_t max_pixels;
  uint64_t max_png_input_bytes;
  uint64_t max_texture_bytes;
} ViviPngLimits;

/* Reviewed Amendment 1 vivi2d.png.rgba8.v1 limits. Changing any value requires
   a new decode profile. max_texture_bytes is the per-decode RGBA8 ceiling; the
   evaluation plan/model aggregate ceiling is declared in vivi_runtime_editor.h. */
#define VIVI_PNG_RGBA8_V1_MAX_WIDTH UINT32_C(8192)
#define VIVI_PNG_RGBA8_V1_MAX_HEIGHT UINT32_C(8192)
#define VIVI_PNG_RGBA8_V1_MAX_PIXELS UINT64_C(67108864)
#define VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES UINT64_C(67108864)
#define VIVI_PNG_RGBA8_V1_MAX_TEXTURE_BYTES UINT64_C(268435456)
#define VIVI_PNG_RGBA8_V1_LIMITS \
  { \
    (uint32_t)sizeof(ViviPngLimits), \
    VIVI_PNG_RGBA8_V1_MAX_WIDTH, \
    VIVI_PNG_RGBA8_V1_MAX_HEIGHT, \
    UINT32_C(0), \
    VIVI_PNG_RGBA8_V1_MAX_PIXELS, \
    VIVI_PNG_RGBA8_V1_MAX_INPUT_BYTES, \
    VIVI_PNG_RGBA8_V1_MAX_TEXTURE_BYTES \
  }

#if !defined(VIVI_RUNTIME_SKIP_LAYOUT_ASSERTS)
#if defined(__cplusplus)
#if !defined(_MSC_VER) && __cplusplus < 201103L
#error "Vivi2D PNG ABI layout asserts require C++11 or newer"
#endif
#define VIVI_PNG_STATIC_ASSERT static_assert
#define VIVI_PNG_ALIGNOF(type) alignof(type)
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
#define VIVI_PNG_STATIC_ASSERT _Static_assert
#define VIVI_PNG_ALIGNOF(type) _Alignof(type)
#else
#error "Vivi2D PNG ABI layout asserts require C11 or C++11"
#endif

#define VIVI_PNG_ASSERT_LAYOUT(type, size, align) \
  VIVI_PNG_STATIC_ASSERT(sizeof(type) == (size), #type " size drift"); \
  VIVI_PNG_STATIC_ASSERT(VIVI_PNG_ALIGNOF(type) == (align), #type " alignment drift")
#define VIVI_PNG_ASSERT_OFFSET(type, field, offset) \
  VIVI_PNG_STATIC_ASSERT( \
    offsetof(type, field) == (offset), \
    #type "." #field " offset drift" \
  )

VIVI_PNG_ASSERT_LAYOUT(ViviPngInfo, 24, 8);
VIVI_PNG_ASSERT_OFFSET(ViviPngInfo, struct_size, 0);
VIVI_PNG_ASSERT_OFFSET(ViviPngInfo, width, 4);
VIVI_PNG_ASSERT_OFFSET(ViviPngInfo, height, 8);
VIVI_PNG_ASSERT_OFFSET(ViviPngInfo, _reserved0, 12);
VIVI_PNG_ASSERT_OFFSET(ViviPngInfo, required_output_bytes, 16);

VIVI_PNG_ASSERT_LAYOUT(ViviPngLimits, 40, 8);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, struct_size, 0);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, max_width, 4);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, max_height, 8);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, _reserved0, 12);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, max_pixels, 16);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, max_png_input_bytes, 24);
VIVI_PNG_ASSERT_OFFSET(ViviPngLimits, max_texture_bytes, 32);

#undef VIVI_PNG_ASSERT_OFFSET
#undef VIVI_PNG_ASSERT_LAYOUT
#undef VIVI_PNG_ALIGNOF
#undef VIVI_PNG_STATIC_ASSERT
#endif

/* Allocation-free inspection. Validates the PNG signature, IHDR, accepted
   subset, declared dimensions, and immutable profile limits. On success,
   required_output_bytes is width * height * 4 using checked 64-bit arithmetic.

   Accepted subset: bit depth 8; color types 0, 2, 3, 4, and 6; no Adam7; no
   acTL/APNG; valid CRCs. ICC, gAMA, cHRM, and sRGB ancillary chunks are ignored.
   The eventual output is RGBA8 straight-alpha, sRGB interpretation, top-left
   origin, row stride width * 4, preserving RGB bytes when alpha is zero. */
VIVI_EXPORT ViviPngStatus VIVI_CALL vivi_png_inspect(
  const uint8_t* bytes,
  uint64_t len,
  uint32_t declared_width,
  uint32_t declared_height,
  ViviPngInfo* out_info
);

/* Decode validation order is normative:
   0. Validate pointers, lengths, and non-overlap of input/output ranges.
   1. Enforce len <= max_png_input_bytes; do not hash an oversized input.
   2. Verify SHA-256(bytes) against all 32 expected_content_sha256 bytes.
   3. Revalidate signature, IHDR, accepted subset, CRCs, and dimensions.
   4. Check width * height * 4 overflow, all profile limits, and capacity.
   5. Inflate zlib with the output ceiling enforced.

   Reviewed Amendment 1 failure-atomic rule: step 5 is completed in
   decoder-owned scratch storage and output_ptr is committed only after the
   entire operation succeeds. Failure to allocate that scratch storage returns
   VIVI_PNG_ERR_LIMIT. On every non-OK return, all output_capacity bytes at
   output_ptr are left byte-for-byte unchanged. On success, exactly the first
   required_output_bytes bytes are committed; the range
   [required_output_bytes, output_capacity) is left byte-for-byte unchanged.
   Input and output ranges must not overlap. expected_content_sha256 points to
   exactly 32 readable raw digest bytes. */
VIVI_EXPORT ViviPngStatus VIVI_CALL vivi_png_decode(
  const uint8_t* bytes,
  uint64_t len,
  const uint8_t expected_content_sha256[VIVI_PNG_SHA256_BYTES],
  uint32_t declared_width,
  uint32_t declared_height,
  uint8_t* output_ptr,
  uint64_t output_capacity
);

#ifdef __cplusplus
}
#endif

#endif
