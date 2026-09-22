#ifndef VIVI_LOCAL_ASSET_PREVIEW_H
#define VIVI_LOCAL_ASSET_PREVIEW_H

/* Internal native-only additive preview bridge; excluded from the npm API.
   The original local Asset ABI version, eight symbols and layouts are unchanged. */
#include "vivi_local_asset.h"

#ifdef __cplusplus
extern "C" {
#endif

#define VIVI_LOCAL_ASSET_CAPTURE_INFO_SIZE_V1 UINT32_C(16)
#define VIVI_LOCAL_ASSET_OBJECT_INFO_SIZE_V1 UINT32_C(48)
#define VIVI_LOCAL_ASSET_MAX_CLOSURE_OBJECTS_V1 UINT32_C(9)
#define VIVI_LOCAL_ASSET_MAX_CLOSURE_BYTES_V1 UINT64_C(68157440)

typedef struct ViviLocalAssetCaptureV1 ViviLocalAssetCaptureV1;
typedef struct ViviLocalAssetCaptureInfoV1 {
  uint32_t struct_size;
  uint32_t object_count;
  uint64_t total_bytes;
} ViviLocalAssetCaptureInfoV1;
typedef struct ViviLocalAssetObjectInfoV1 {
  uint32_t struct_size;
  uint32_t reserved;
  uint8_t address[32];
  uint64_t byte_length;
} ViviLocalAssetObjectInfoV1;

#ifdef __cplusplus
#define VIVI_PREVIEW_ASSERT static_assert
#define VIVI_PREVIEW_ALIGNOF(type) alignof(type)
#else
#define VIVI_PREVIEW_ASSERT _Static_assert
#define VIVI_PREVIEW_ALIGNOF(type) _Alignof(type)
#endif
#define VIVI_PREVIEW_OFFSET(type, field, value) \
  VIVI_PREVIEW_ASSERT(offsetof(type, field) == (value), #type "." #field " drift")
VIVI_PREVIEW_ASSERT(sizeof(ViviLocalAssetCaptureInfoV1) == 16, "CaptureInfo size drift");
VIVI_PREVIEW_ASSERT(VIVI_PREVIEW_ALIGNOF(ViviLocalAssetCaptureInfoV1) == 8, "CaptureInfo alignment drift");
VIVI_PREVIEW_OFFSET(ViviLocalAssetCaptureInfoV1, struct_size, 0);
VIVI_PREVIEW_OFFSET(ViviLocalAssetCaptureInfoV1, object_count, 4);
VIVI_PREVIEW_OFFSET(ViviLocalAssetCaptureInfoV1, total_bytes, 8);
VIVI_PREVIEW_ASSERT(sizeof(ViviLocalAssetObjectInfoV1) == 48, "ObjectInfo size drift");
VIVI_PREVIEW_ASSERT(VIVI_PREVIEW_ALIGNOF(ViviLocalAssetObjectInfoV1) == 8, "ObjectInfo alignment drift");
VIVI_PREVIEW_OFFSET(ViviLocalAssetObjectInfoV1, struct_size, 0);
VIVI_PREVIEW_OFFSET(ViviLocalAssetObjectInfoV1, reserved, 4);
VIVI_PREVIEW_OFFSET(ViviLocalAssetObjectInfoV1, address, 8);
VIVI_PREVIEW_OFFSET(ViviLocalAssetObjectInfoV1, byte_length, 40);
VIVI_PREVIEW_ASSERT(VIVI_LOCAL_ASSET_CAPTURE_INFO_SIZE_V1 == 16, "CaptureInfo constant drift");
VIVI_PREVIEW_ASSERT(VIVI_LOCAL_ASSET_OBJECT_INFO_SIZE_V1 == 48, "ObjectInfo constant drift");
VIVI_PREVIEW_ASSERT(VIVI_LOCAL_ASSET_MAX_CLOSURE_OBJECTS_V1 == 9, "Object bound drift");
VIVI_PREVIEW_ASSERT(VIVI_LOCAL_ASSET_MAX_CLOSURE_BYTES_V1 == 68157440, "Byte bound drift");
#undef VIVI_PREVIEW_OFFSET
#undef VIVI_PREVIEW_ALIGNOF
#undef VIVI_PREVIEW_ASSERT

/* All ranges are initialized, live, correctly aligned and mutually disjoint,
   including endpoint path/principal bytes, cancellation storage and all three
   outputs. Result size is 264 and CaptureInfo size is 16 on entry. Admission
   rejects bad sizes/ranges/overlap without changing any output. Once admitted,
   outputs are zeroed except their sizes and *out_capture=NULL; every non-Ready
   or nonzero return retains no capture. Forged/dangling pointers remain caller
   UB; numeric range checks are not pointer-validity or lifetime protection.

   Opens/uses/drops the real host on the calling worker. SourceOpen=2 and
   SourceExport=3, exact resolver precedence and actual cancellation checkpoints
   are unchanged. No receiver/import/publication occurs; ambiguity is always 0.
   Ready yields one owned capture containing only the exact exported physical
   bytes in first-read order, including raw (not reencoded) manifests. A panic
   is contained as existing bridge OK + Internal, with no partial capture.
   No successful cancellation is invented after export has returned Ready. */
VIVI_EXPORT int32_t VIVI_CALL vivi_local_asset_export_closure_v1(
  const ViviLocalAssetEndpointV1* endpoint,
  const ViviLocalAssetRefV1* reference,
  uint32_t width,
  uint32_t height,
  ViviLocalAssetCancelV1* cancel,
  ViviLocalAssetResultV1* result,
  ViviLocalAssetCaptureInfoV1* capture_info,
  ViviLocalAssetCaptureV1** out_capture
);

/* A live capture is immutable until destroy. Its owner prevents concurrent
   destroy while a query/copy is running. ObjectInfo requires size=48/reserved=0.
   output=NULL,capacity=0 queries metadata only. Otherwise capacity must cover
   the complete object; the entire output capacity is live writable storage.
   ObjectInfo/output ranges cannot overlap each other or any captured storage.
   Invalid index, size, reserved, range, overlap or capacity returns bridge 1
   without changing metadata or payload. Admission finishes before any copy;
   bytes are copied completely, then metadata is written last. No prefix copy,
   borrowed pointer, callback, parser, store access or additional validation.
   Unexpected panic returns bridge 3; no unwind crosses C. */
VIVI_EXPORT int32_t VIVI_CALL vivi_local_asset_closure_object_v1(
  const ViviLocalAssetCaptureV1* capture,
  uint32_t index,
  ViviLocalAssetObjectInfoV1* object_info,
  uint8_t* output,
  uint64_t capacity
);

/* Consumes exactly one owned live capture; NULL is a no-op. No host/store work.
   Double destroy, forged pointers and query-after-destroy remain caller UB.
   Global allocator abort/OS termination is not a recoverable ABI outcome. */
VIVI_EXPORT void VIVI_CALL vivi_local_asset_closure_destroy_v1(
  ViviLocalAssetCaptureV1* capture
);

#ifdef __cplusplus
}
#endif
#endif
