#ifndef VIVI_LOCAL_ASSET_H
#define VIVI_LOCAL_ASSET_H

#include <limits.h>
#include <stddef.h>
#include <stdint.h>

/* Internal, opt-in local-asset-host-v1 profile. This is not a stable runtime
   ABI promotion. The shipping consumer is Windows x64; this layout is native
   64-bit little-endian only. It does not expose a host/store handle. */
#if defined(__wasm__) || defined(__wasm32__) || defined(__wasm64__)
#error "The local Asset ABI is native only"
#endif
#if defined(_WIN32)
#if !defined(_WIN64)
#error "The local Asset ABI requires a 64-bit target"
#endif
#elif defined(__BYTE_ORDER__) && defined(__ORDER_LITTLE_ENDIAN__)
#if __BYTE_ORDER__ != __ORDER_LITTLE_ENDIAN__
#error "The local Asset ABI requires little-endian byte order"
#endif
#else
#error "The local Asset ABI requires a known little-endian target"
#endif

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

#define VIVI_LOCAL_ASSET_ABI_VERSION_V1 UINT32_C(1)
#define VIVI_LOCAL_ASSET_ENDPOINT_SIZE_V1 UINT32_C(40)
#define VIVI_LOCAL_ASSET_REF_SIZE_V1 UINT32_C(216)
#define VIVI_LOCAL_ASSET_RESULT_SIZE_V1 UINT32_C(264)
#define VIVI_LOCAL_ASSET_SHA256_BYTES_V1 UINT32_C(32)
#define VIVI_LOCAL_ASSET_MEDIA_CAPACITY_V1 UINT32_C(128)
#define VIVI_LOCAL_ASSET_MAX_MEDIA_BYTES_V1 UINT32_C(127)
#define VIVI_LOCAL_ASSET_MAX_PATH_BYTES_V1 UINT64_C(131068)
#define VIVI_LOCAL_ASSET_MAX_PRINCIPAL_BYTES_V1 UINT64_C(4096)
#define VIVI_LOCAL_ASSET_PNG_RGBA8_V1_PROFILE "vivi2d.png.rgba8.v1"

/* These integer constants are never used as C enum-typed ABI fields.
   A zero bridge return means inspect Result, not necessarily Ready. */
enum {
  VIVI_LOCAL_ASSET_BRIDGE_OK_V1 = 0,
  VIVI_LOCAL_ASSET_BRIDGE_INVALID_ARGUMENT_V1 = 1,
  VIVI_LOCAL_ASSET_BRIDGE_RESOURCE_V1 = 2,
  VIVI_LOCAL_ASSET_BRIDGE_INTERNAL_PANIC_V1 = 3
};
enum {
  VIVI_LOCAL_ASSET_READY_V1 = 1,
  VIVI_LOCAL_ASSET_MISSING_V1 = 2,
  VIVI_LOCAL_ASSET_CANCELLED_BEFORE_OPERATION_PUBLICATION_V1 = 3,
  VIVI_LOCAL_ASSET_HOST_ERROR_V1 = 4,
  VIVI_LOCAL_ASSET_INTERNAL_V1 = 5
};
enum {
  VIVI_LOCAL_ASSET_STAGE_ARGUMENT_ADMITTED_V1 = 1,
  VIVI_LOCAL_ASSET_STAGE_SOURCE_OPEN_V1 = 2,
  VIVI_LOCAL_ASSET_STAGE_SOURCE_EXPORT_V1 = 3,
  VIVI_LOCAL_ASSET_STAGE_RECEIVER_OPEN_V1 = 4,
  VIVI_LOCAL_ASSET_STAGE_RECEIVER_IMPORT_V1 = 5,
  VIVI_LOCAL_ASSET_STAGE_LOCAL_OPEN_V1 = 6,
  VIVI_LOCAL_ASSET_STAGE_LOCAL_RESOLVE_V1 = 7,
  VIVI_LOCAL_ASSET_STAGE_LOCAL_MATERIALIZE_V1 = 8
};
enum {
  VIVI_LOCAL_ASSET_HOST_INVALID_TEXTURE_PLAN_V1 = 1,
  VIVI_LOCAL_ASSET_HOST_RESOURCE_LIMIT_EXCEEDED_V1 = 2,
  VIVI_LOCAL_ASSET_HOST_ASSET_V1 = 3,
  VIVI_LOCAL_ASSET_HOST_STORE_V1 = 4
};
/* Exact AssetErrorCode order; diagnostic strings are not part of this ABI. */
enum {
  VIVI_LOCAL_ASSET_HASH_MISMATCH_V1 = 1,
  VIVI_LOCAL_ASSET_SIZE_MISMATCH_V1 = 2,
  VIVI_LOCAL_ASSET_TOO_LARGE_FOR_EMBED_V1 = 3,
  VIVI_LOCAL_ASSET_CHUNK_MISSING_V1 = 4,
  VIVI_LOCAL_ASSET_MANIFEST_INVALID_V1 = 5,
  VIVI_LOCAL_ASSET_REF_SET_MISMATCH_V1 = 6,
  VIVI_LOCAL_ASSET_UPLOAD_EXPIRED_V1 = 7,
  VIVI_LOCAL_ASSET_UNSUPPORTED_KIND_V1 = 8,
  VIVI_LOCAL_ASSET_DELETED_OBJECT_REF_V1 = 9,
  VIVI_LOCAL_ASSET_DESCRIPTOR_MISMATCH_V1 = 10,
  VIVI_LOCAL_ASSET_MEDIA_TYPE_MISMATCH_V1 = 11,
  VIVI_LOCAL_ASSET_CONTENT_HASH_MISMATCH_V1 = 12,
  VIVI_LOCAL_ASSET_DECODING_PROFILE_UNSUPPORTED_V1 = 13,
  VIVI_LOCAL_ASSET_DIMENSION_MISMATCH_V1 = 14,
  VIVI_LOCAL_ASSET_DECODE_MALFORMED_V1 = 15,
  VIVI_LOCAL_ASSET_LIMIT_EXCEEDED_V1 = 16,
  VIVI_LOCAL_ASSET_WRITE_IN_PROGRESS_V1 = 17,
  VIVI_LOCAL_ASSET_WRITE_LEASE_LOST_V1 = 18
};
enum {
  VIVI_LOCAL_ASSET_STORE_PATH_REJECTED_V1 = 1,
  VIVI_LOCAL_ASSET_STORE_UNAVAILABLE_V1 = 2,
  VIVI_LOCAL_ASSET_STORE_INTEGRITY_VIOLATION_V1 = 3,
  VIVI_LOCAL_ASSET_STORE_PRINCIPAL_MISMATCH_V1 = 4,
  VIVI_LOCAL_ASSET_STORE_INVALID_INPUT_V1 = 5,
  VIVI_LOCAL_ASSET_STORE_IMMUTABLE_CONFLICT_V1 = 6,
  VIVI_LOCAL_ASSET_STORE_UNKNOWN_KIND_V1 = 255
};
enum {
  VIVI_LOCAL_ASSET_STORAGE_BLOB_V1 = 1,
  VIVI_LOCAL_ASSET_STORAGE_CHUNK_MANIFEST_V1 = 2,
  VIVI_LOCAL_ASSET_PNG_PROFILE_RGBA8_V1 = 1
};

typedef struct ViviLocalAssetCancelV1 ViviLocalAssetCancelV1;

typedef struct ViviLocalAssetSliceV1 {
  const uint8_t* data;
  uint64_t length;
} ViviLocalAssetSliceV1;

typedef struct ViviLocalAssetEndpointV1 {
  uint32_t struct_size;
  uint32_t reserved;
  ViviLocalAssetSliceV1 path;
  ViviLocalAssetSliceV1 principal;
} ViviLocalAssetEndpointV1;

typedef struct ViviLocalAssetRefV1 {
  uint32_t struct_size;
  uint32_t storage_kind;
  uint8_t object_address[32];
  uint8_t content_sha256[32];
  uint64_t size_bytes;
  uint32_t media_length;
  uint32_t reserved;
  uint8_t media_utf8[128];
} ViviLocalAssetRefV1;

typedef struct ViviLocalAssetResultV1 {
  uint32_t struct_size;
  uint32_t outcome;
  uint32_t stage;
  uint32_t host_kind;
  uint32_t asset_code;
  uint32_t store_kind;
  uint32_t outcome_may_have_committed;
  uint32_t reserved0;
  ViviLocalAssetRefV1 reference;
  uint32_t width;
  uint32_t height;
  uint32_t png_profile;
  uint32_t reserved1;
} ViviLocalAssetResultV1;

/* Mandatory profile assertions, including when other runtime layout asserts
   are disabled. No packing override is permitted for these structures. */
#if defined(__cplusplus)
#if !defined(_MSC_VER) && __cplusplus < 201103L
#error "The local Asset ABI requires C11 or C++11"
#endif
#define VIVI_LOCAL_ASSET_ASSERT static_assert
#define VIVI_LOCAL_ASSET_ALIGNOF(type) alignof(type)
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
#define VIVI_LOCAL_ASSET_ASSERT _Static_assert
#define VIVI_LOCAL_ASSET_ALIGNOF(type) _Alignof(type)
#else
#error "The local Asset ABI requires C11 or C++11"
#endif
#define VIVI_LOCAL_ASSET_LAYOUT(type, size, alignment) \
  VIVI_LOCAL_ASSET_ASSERT(sizeof(type) == (size), #type " size drift"); \
  VIVI_LOCAL_ASSET_ASSERT( \
    VIVI_LOCAL_ASSET_ALIGNOF(type) == (alignment), #type " alignment drift")
#define VIVI_LOCAL_ASSET_OFFSET(type, field, offset) \
  VIVI_LOCAL_ASSET_ASSERT(offsetof(type, field) == (offset), \
    #type "." #field " offset drift")
#define VIVI_LOCAL_ASSET_VALUE(name, value) \
  VIVI_LOCAL_ASSET_ASSERT((name) == (value), #name " value drift")

VIVI_LOCAL_ASSET_VALUE(CHAR_BIT, 8);
VIVI_LOCAL_ASSET_LAYOUT(uint8_t, 1, 1);
VIVI_LOCAL_ASSET_LAYOUT(uint32_t, 4, 4);
VIVI_LOCAL_ASSET_LAYOUT(int32_t, 4, 4);
VIVI_LOCAL_ASSET_LAYOUT(uint64_t, 8, 8);
VIVI_LOCAL_ASSET_LAYOUT(const uint8_t*, 8, 8);

VIVI_LOCAL_ASSET_LAYOUT(ViviLocalAssetSliceV1, 16, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetSliceV1, data, 0);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetSliceV1, length, 8);
VIVI_LOCAL_ASSET_LAYOUT(ViviLocalAssetEndpointV1, 40, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetEndpointV1, struct_size, 0);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetEndpointV1, reserved, 4);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetEndpointV1, path, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetEndpointV1, principal, 24);
VIVI_LOCAL_ASSET_LAYOUT(ViviLocalAssetRefV1, 216, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, struct_size, 0);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, storage_kind, 4);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, object_address, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, content_sha256, 40);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, size_bytes, 72);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, media_length, 80);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, reserved, 84);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetRefV1, media_utf8, 88);
VIVI_LOCAL_ASSET_LAYOUT(ViviLocalAssetResultV1, 264, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, struct_size, 0);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, outcome, 4);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, stage, 8);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, host_kind, 12);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, asset_code, 16);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, store_kind, 20);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, outcome_may_have_committed, 24);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, reserved0, 28);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, reference, 32);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, width, 248);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, height, 252);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, png_profile, 256);
VIVI_LOCAL_ASSET_OFFSET(ViviLocalAssetResultV1, reserved1, 260);

VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_ABI_VERSION_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_ENDPOINT_SIZE_V1, 40);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_REF_SIZE_V1, 216);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_RESULT_SIZE_V1, 264);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_SHA256_BYTES_V1, 32);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MEDIA_CAPACITY_V1, 128);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MAX_MEDIA_BYTES_V1, 127);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MAX_PATH_BYTES_V1, 131068);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MAX_PRINCIPAL_BYTES_V1, 4096);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_BRIDGE_OK_V1, 0);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_BRIDGE_INVALID_ARGUMENT_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_BRIDGE_RESOURCE_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_BRIDGE_INTERNAL_PANIC_V1, 3);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_READY_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MISSING_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_CANCELLED_BEFORE_OPERATION_PUBLICATION_V1, 3);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_HOST_ERROR_V1, 4);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_INTERNAL_V1, 5);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_ARGUMENT_ADMITTED_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_SOURCE_OPEN_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_SOURCE_EXPORT_V1, 3);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_RECEIVER_OPEN_V1, 4);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_RECEIVER_IMPORT_V1, 5);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_LOCAL_OPEN_V1, 6);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_LOCAL_RESOLVE_V1, 7);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STAGE_LOCAL_MATERIALIZE_V1, 8);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_HOST_INVALID_TEXTURE_PLAN_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_HOST_RESOURCE_LIMIT_EXCEEDED_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_HOST_ASSET_V1, 3);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_HOST_STORE_V1, 4);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_HASH_MISMATCH_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_SIZE_MISMATCH_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_TOO_LARGE_FOR_EMBED_V1, 3);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_CHUNK_MISSING_V1, 4);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MANIFEST_INVALID_V1, 5);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_REF_SET_MISMATCH_V1, 6);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_UPLOAD_EXPIRED_V1, 7);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_UNSUPPORTED_KIND_V1, 8);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_DELETED_OBJECT_REF_V1, 9);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_DESCRIPTOR_MISMATCH_V1, 10);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_MEDIA_TYPE_MISMATCH_V1, 11);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_CONTENT_HASH_MISMATCH_V1, 12);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_DECODING_PROFILE_UNSUPPORTED_V1, 13);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_DIMENSION_MISMATCH_V1, 14);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_DECODE_MALFORMED_V1, 15);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_LIMIT_EXCEEDED_V1, 16);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_WRITE_IN_PROGRESS_V1, 17);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_WRITE_LEASE_LOST_V1, 18);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_PATH_REJECTED_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_UNAVAILABLE_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_INTEGRITY_VIOLATION_V1, 3);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_PRINCIPAL_MISMATCH_V1, 4);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_INVALID_INPUT_V1, 5);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_IMMUTABLE_CONFLICT_V1, 6);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORE_UNKNOWN_KIND_V1, 255);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORAGE_BLOB_V1, 1);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_STORAGE_CHUNK_MANIFEST_V1, 2);
VIVI_LOCAL_ASSET_VALUE(VIVI_LOCAL_ASSET_PNG_PROFILE_RGBA8_V1, 1);

#undef VIVI_LOCAL_ASSET_VALUE
#undef VIVI_LOCAL_ASSET_OFFSET
#undef VIVI_LOCAL_ASSET_LAYOUT
#undef VIVI_LOCAL_ASSET_ALIGNOF
#undef VIVI_LOCAL_ASSET_ASSERT

/* Endpoint path: 1..131068 UTF-8 bytes, no NUL, trusted absolute local path.
   Principal: 1..4096 opaque bytes. Ref media: 1..127 UTF-8 bytes, no NUL,
   with every remaining media_utf8 byte zero. All reserved fields are zero.
   Every input struct_size equals its corresponding SIZE_V1 constant.

   Required input/output pointers must be aligned, initialized and live; input
   buffers are immutable and do not overlap output until synchronous return.
   Valid-pointer obligations cannot be checked for forged/dangling addresses.
   No borrowed pointer is retained. Result is writable, with struct_size=264
   on entry. Admission checks required pointers/alignment and Result size
   before reading inputs; a valid output is zeroed with outer size restored.
   On a nonzero bridge return it remains zero except that outer size.

   Ready contains the real host PNG attestation, including image/png length 9,
   a full Ref (size=216), dimensions and profile=1. Error fields are zero.
   Non-Ready reference (including its struct_size), dimensions and profile
   are zero. HostError carries the actual host kind and optional asset/store
   code; code zero means absent. outcome_may_have_committed is exactly 0 or 1.
   Unknown decoded tag/code combinations are Internal, not ignored. */

VIVI_EXPORT uint32_t VIVI_CALL vivi_local_asset_get_abi_version_v1(void);

/* One Arc<AtomicBool> allocation; create gives one strong reference and leaves
   *out null on recoverable failure. Retain adds one; release consumes one.
   Each concurrent caller must independently hold a live strong reference.
   Request is idempotent. Request/release(NULL) are no-ops; retain(NULL) is not
   valid. A valid operation always requires a nonnull live cancellation handle.
   Request/retain/release do not unwind across C. No use-after-release detection
   or recoverability from global allocator abort/OS termination is promised. */
VIVI_EXPORT int32_t VIVI_CALL vivi_local_asset_cancel_create_v1(
  ViviLocalAssetCancelV1** out
);
VIVI_EXPORT void VIVI_CALL vivi_local_asset_cancel_retain_v1(
  ViviLocalAssetCancelV1* handle
);
VIVI_EXPORT void VIVI_CALL vivi_local_asset_cancel_request_v1(
  ViviLocalAssetCancelV1* handle
);
VIVI_EXPORT void VIVI_CALL vivi_local_asset_cancel_release_v1(
  ViviLocalAssetCancelV1* handle
);

/* Calls open/use/drop the host on the caller's native worker thread. Cancel
   observed before opening prevents Asset publication, not necessarily all
   filesystem effects. After resolve/materialize entry, the real host outcome
   wins; neither operation invents an in-call cancellation checkpoint.
   Operation panics map to bridge OK + Internal, with conservative ambiguity
   after a mutating host entry. Materialize Store failures after entry are also
   conservatively ambiguous; Asset validation/open failures are not.
   There is no last-error string API. */
VIVI_EXPORT int32_t VIVI_CALL vivi_local_asset_resolve_v1(
  const ViviLocalAssetEndpointV1* endpoint,
  const ViviLocalAssetRefV1* reference,
  uint32_t width,
  uint32_t height,
  ViviLocalAssetCancelV1* cancel,
  ViviLocalAssetResultV1* result
);

/* png_len=0 permits png=NULL and reaches the real decoder. All other input
   buffer lifetime/length obligations remain unchanged. */
VIVI_EXPORT int32_t VIVI_CALL vivi_local_asset_materialize_v1(
  const ViviLocalAssetEndpointV1* endpoint,
  const uint8_t* png,
  uint64_t png_len,
  uint32_t width,
  uint32_t height,
  ViviLocalAssetCancelV1* cancel,
  ViviLocalAssetResultV1* result
);

/* Export precedes receiver open: source host is dropped while its owned
   closure remains live. The real resolver determines Missing/error precedence;
   no premature Asset shape/PNG/media/size validation substitutes for export.
   Import fully validates before first put and publishes the descriptor last.
   Raw manifests, full references and precise transfer ambiguity are preserved.
   After first receiver put, real Ready/HostError wins over cancellation. No
   rollback, deletion or GC is attempted; prior immutable objects may remain. */
VIVI_EXPORT int32_t VIVI_CALL vivi_local_asset_transfer_v1(
  const ViviLocalAssetEndpointV1* source,
  const ViviLocalAssetEndpointV1* receiver,
  const ViviLocalAssetRefV1* reference,
  uint32_t width,
  uint32_t height,
  ViviLocalAssetCancelV1* cancel,
  ViviLocalAssetResultV1* result
);

#ifdef __cplusplus
}
#endif

#endif
