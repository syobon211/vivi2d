/* Apache-2.0. Fixed internal Node-API v8 bridge; no JS memory on workers. */
#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "vivi_local_asset_preview.h"
#ifdef VIVI_LOCAL_ASSET_TEST
#include <windows.h>
static volatile LONG test_release_all;
static volatile LONG test_capture_releases;
#endif
#ifdef VIVI_LOCAL_ASSET_TEST_INIT_FAILURE
static volatile int test_initialization_failure = 1;
#endif

#if NAPI_VERSION != 8
#error "Compile this bridge against exactly stable Node-API v8"
#endif

typedef struct Environment Environment;
typedef struct Work Work;
typedef struct Token {
  napi_env identity; /* Compare only; the finalizer never dereferences it. */
  ViviLocalAssetCancelV1* cancel;
} Token;
struct Environment {
  napi_env env;
  napi_async_cleanup_hook_handle cleanup;
  napi_ref buffer_constructor;
  napi_ref is_buffer;
  napi_ref close_promise;
  napi_deferred close_deferred;
  bool accepting;
  bool tearing_down;
  Work* work;
#ifdef VIVI_LOCAL_ASSET_TEST
  volatile LONG test_hold;
  volatile LONG test_entered;
  volatile LONG test_capture_hold;
  volatile LONG test_captured;
  uint32_t test_failure;
  uint32_t test_completed;
  uint32_t test_setup_failures;
#endif
};
struct Work {
  Environment* owner;
  napi_async_work async;
  napi_deferred deferred;
  ViviLocalAssetCancelV1* cancel;
  uint32_t operation;
  uint32_t width;
  uint32_t height;
  uint8_t* endpoint_bytes[2];
  ViviLocalAssetEndpointV1 endpoints[2];
  ViviLocalAssetRefV1 reference;
  uint8_t* png;
  size_t png_length;
  int32_t bridge_status;
  ViviLocalAssetResultV1 result;
  ViviLocalAssetCaptureV1* capture;
  ViviLocalAssetCaptureInfoV1 capture_info;
};
static const napi_type_tag TOKEN_TAG = {
  UINT64_C(0x766976696c6f6361), UINT64_C(0x6c61737365747631)
};
static const char* ASSET_CODES[] = {
  NULL, "VIVI_ASSET_HASH_MISMATCH", "VIVI_ASSET_SIZE_MISMATCH",
  "VIVI_ASSET_TOO_LARGE_FOR_EMBED", "VIVI_ASSET_CHUNK_MISSING",
  "VIVI_ASSET_MANIFEST_INVALID", "VIVI_ASSET_REF_SET_MISMATCH",
  "VIVI_ASSET_UPLOAD_EXPIRED", "VIVI_ASSET_UNSUPPORTED_KIND",
  "VIVI_ASSET_DELETED_OBJECT_REF", "VIVI_ASSET_DESCRIPTOR_MISMATCH",
  "VIVI_ASSET_MEDIA_TYPE_MISMATCH", "VIVI_ASSET_CONTENT_HASH_MISMATCH",
  "VIVI_ASSET_DECODING_PROFILE_UNSUPPORTED", "VIVI_ASSET_DIMENSION_MISMATCH",
  "VIVI_ASSET_DECODE_MALFORMED", "VIVI_ASSET_LIMIT_EXCEEDED",
  "VIVI_ASSET_WRITE_IN_PROGRESS", "VIVI_ASSET_WRITE_LEASE_LOST"
};
static const char* HOST_KINDS[] = {
  NULL, "InvalidTexturePlan", "ResourceLimitExceeded", "Asset", "Store"
};
static const char* STORE_KINDS[] = {
  NULL, "PathRejected", "StoreUnavailable", "IntegrityViolation",
  "PrincipalMismatch", "InvalidInput", "ImmutableConflict"
};

static void clear_pending_exception(napi_env env) {
  bool pending = false;
  napi_value ignored;
  if (napi_is_exception_pending(env, &pending) == napi_ok && pending)
    (void)napi_get_and_clear_last_exception(env, &ignored);
}
/* An unpublished promise still owns a persistent Node resolver. Normal setup
 * unwind must settle it; resolving undefined cannot create an unhandled reject. */
static void settle_unpublished(napi_env env, napi_deferred* deferred) {
  napi_value value;
  clear_pending_exception(env);
  if (*deferred != NULL && napi_get_undefined(env, &value) == napi_ok) {
    (void)napi_resolve_deferred(env, *deferred, value);
    *deferred = NULL;
  }
}
static napi_value fail(napi_env env, const char* code) {
  clear_pending_exception(env);
  (void)napi_throw_error(env, code, code);
  return NULL;
}
static napi_status string_value(napi_env env, const char* text, napi_value* out) {
  return text == NULL ? napi_get_null(env, out)
    : napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, out);
}
static napi_status field(napi_env env, napi_value object, const char* key, napi_value value) {
  const napi_property_descriptor descriptor = {
    key, NULL, NULL, NULL, NULL, value, napi_enumerable, NULL
  };
  return napi_define_properties(env, object, 1, &descriptor);
}
static napi_status text_field(napi_env env, napi_value object, const char* key, const char* text) {
  napi_value value;
  napi_status status = string_value(env, text, &value);
  return status == napi_ok ? field(env, object, key, value) : status;
}
static napi_status number_field(napi_env env, napi_value object, const char* key, double number) {
  napi_value value;
  napi_status status = napi_create_double(env, number, &value);
  return status == napi_ok ? field(env, object, key, value) : status;
}
static napi_status bool_field(napi_env env, napi_value object, const char* key, bool flag) {
  napi_value value;
  napi_status status = napi_get_boolean(env, flag, &value);
  return status == napi_ok ? field(env, object, key, value) : status;
}
static bool is_null(napi_env env, napi_value value) {
  napi_valuetype type;
  return napi_typeof(env, value, &type) == napi_ok && type == napi_null;
}
static bool unsigned_value(napi_env env, napi_value value, uint32_t maximum, uint32_t* out) {
  napi_valuetype type;
  double number;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_number ||
      napi_get_value_double(env, value, &number) != napi_ok ||
      !(number >= 1 && number <= maximum)) return false;
  *out = (uint32_t)number;
  return number == (double)*out;
}
static uint32_t little_u32(const uint8_t* bytes) {
  return (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8) |
    ((uint32_t)bytes[2] << 16) | ((uint32_t)bytes[3] << 24);
}

/* napi_is_buffer alone also accepts ordinary Uint8Array on supported runtimes.
 * Independently use captured Node Buffer.isBuffer and the actual backing store. */
static bool buffer_view(Environment* state, napi_value input, void** data, size_t* length) {
  napi_env env = state->env;
  napi_value constructor, predicate, branded, backing;
  napi_typedarray_type type;
  bool is_buffer = false, brand = false, is_array = false, detached = false;
  size_t offset = 0;
  if (napi_is_buffer(env, input, &is_buffer) != napi_ok || !is_buffer ||
      napi_get_reference_value(env, state->buffer_constructor, &constructor) != napi_ok ||
      napi_get_reference_value(env, state->is_buffer, &predicate) != napi_ok ||
      napi_call_function(env, constructor, predicate, 1, &input, &branded) != napi_ok ||
      napi_get_value_bool(env, branded, &brand) != napi_ok || !brand ||
      napi_get_typedarray_info(env, input, &type, length, data, &backing, &offset) != napi_ok ||
      type != napi_uint8_array ||
      napi_is_arraybuffer(env, backing, &is_array) != napi_ok || !is_array ||
      napi_is_detached_arraybuffer(env, backing, &detached) != napi_ok || detached)
    return false;
  return *length == 0 || *data != NULL;
}
static int copy_endpoint(Work* work, size_t index, napi_value input) {
  void* raw;
  size_t length;
  uint32_t path_length, principal_length;
  uint8_t* copy;
  if (!buffer_view(work->owner, input, &raw, &length) || length < 8 ||
      length > 8 + VIVI_LOCAL_ASSET_MAX_PATH_BYTES_V1 + VIVI_LOCAL_ASSET_MAX_PRINCIPAL_BYTES_V1)
    return 1;
  path_length = little_u32((const uint8_t*)raw);
  principal_length = little_u32((const uint8_t*)raw + 4);
  if (path_length == 0 || path_length > VIVI_LOCAL_ASSET_MAX_PATH_BYTES_V1 ||
      principal_length == 0 || principal_length > VIVI_LOCAL_ASSET_MAX_PRINCIPAL_BYTES_V1 ||
      path_length > length - 8 || principal_length != length - 8 - path_length) return 1;
#ifdef VIVI_LOCAL_ASSET_TEST
  if (work->owner->test_failure == 1) return 2;
#endif
  copy = (uint8_t*)malloc(length - 8);
  if (copy == NULL) return 2;
  memcpy(copy, (const uint8_t*)raw + 8, length - 8);
  work->endpoint_bytes[index] = copy;
  work->endpoints[index].struct_size = VIVI_LOCAL_ASSET_ENDPOINT_SIZE_V1;
  work->endpoints[index].path.data = copy;
  work->endpoints[index].path.length = path_length;
  work->endpoints[index].principal.data = copy + path_length;
  work->endpoints[index].principal.length = principal_length;
  return 0;
}
static void free_inputs(Work* work) {
  free(work->endpoint_bytes[0]);
  free(work->endpoint_bytes[1]);
  free(work->png);
  work->endpoint_bytes[0] = work->endpoint_bytes[1] = work->png = NULL;
}
static void free_capture(Work* work) {
  if (work->capture != NULL) {
    vivi_local_asset_closure_destroy_v1(work->capture);
    work->capture = NULL;
#ifdef VIVI_LOCAL_ASSET_TEST
    InterlockedIncrement(&test_capture_releases);
#endif
  }
}
static void token_finalize(napi_env env, void* data, void* hint) {
  Token* token = (Token*)data;
  (void)env; (void)hint;
  vivi_local_asset_cancel_request_v1(token->cancel);
  vivi_local_asset_cancel_release_v1(token->cancel);
  free(token);
}
static void execute(napi_env env, void* data) {
  Work* work = (Work*)data;
  (void)env; /* Never invoke Node-API or read JS objects from this callback. */
#ifdef VIVI_LOCAL_ASSET_TEST
  InterlockedExchange(&work->owner->test_entered, 1);
  while (InterlockedCompareExchange(&work->owner->test_hold, 0, 0) != 0 &&
      InterlockedCompareExchange(&test_release_all, 0, 0) == 0) Sleep(1);
#endif
  work->result.struct_size = VIVI_LOCAL_ASSET_RESULT_SIZE_V1;
  if (work->operation == 1)
    work->bridge_status = vivi_local_asset_resolve_v1(&work->endpoints[0],
      &work->reference, work->width, work->height, work->cancel, &work->result);
  else if (work->operation == 2)
    work->bridge_status = vivi_local_asset_materialize_v1(&work->endpoints[0],
      work->png, work->png_length, work->width, work->height, work->cancel, &work->result);
  else if (work->operation == 3)
    work->bridge_status = vivi_local_asset_transfer_v1(&work->endpoints[0],
      &work->endpoints[1], &work->reference, work->width, work->height, work->cancel, &work->result);
  else {
    work->capture_info.struct_size = VIVI_LOCAL_ASSET_CAPTURE_INFO_SIZE_V1;
    work->bridge_status = vivi_local_asset_export_closure_v1(&work->endpoints[0],
      &work->reference, work->width, work->height, work->cancel, &work->result,
      &work->capture_info, &work->capture);
#ifdef VIVI_LOCAL_ASSET_TEST
    if (work->capture != NULL) InterlockedExchange(&work->owner->test_captured, 1);
    while (InterlockedCompareExchange(&work->owner->test_capture_hold, 0, 0) != 0 &&
        InterlockedCompareExchange(&test_release_all, 0, 0) == 0) Sleep(1);
#endif
  }
}
static bool zero_bytes(const void* bytes, size_t length) {
  const uint8_t* p = (const uint8_t*)bytes;
  size_t i;
  for (i = 0; i < length; i++) if (p[i] != 0) return false;
  return true;
}
static bool valid_result(const Work* work) {
  const ViviLocalAssetResultV1* r = &work->result;
  if (r->struct_size != 264 || r->reserved0 || r->reserved1 ||
      r->stage < 1 || r->stage > 8 || r->outcome_may_have_committed > 1) return false;
  if ((work->operation == 1 && r->stage != 1 && r->stage != 6 && r->stage != 7) ||
      (work->operation == 2 && r->stage != 1 && r->stage != 6 && r->stage != 8) ||
      (work->operation == 3 && r->stage > 5) ||
      (work->operation == 4 && r->stage > 3) ||
      (r->outcome_may_have_committed && !((work->operation == 2 && r->stage == 8) ||
        (work->operation == 3 && r->stage == 5)))) return false;
  if (r->outcome == VIVI_LOCAL_ASSET_READY_V1) {
    const ViviLocalAssetRefV1* ref = &r->reference;
    if (r->host_kind || r->asset_code || r->store_kind || r->outcome_may_have_committed ||
        ref->struct_size != 216 || ref->reserved || ref->media_length != 9 ||
        memcmp(ref->media_utf8, "image/png", 9) != 0 ||
        !zero_bytes(ref->media_utf8 + 9, 119) || ref->size_bytes > UINT64_C(9007199254740991) ||
        (ref->storage_kind != 1 && ref->storage_kind != 2) ||
        r->width != work->width || r->height != work->height || r->png_profile != 1) return false;
    if (work->operation != 2 && memcmp(ref, &work->reference, sizeof(*ref)) != 0) return false;
    return r->stage == (work->operation == 1 ? 7u : work->operation == 2 ? 8u : work->operation == 3 ? 5u : 3u);
  }
  if (!zero_bytes(&r->reference, sizeof(r->reference)) || r->width || r->height || r->png_profile)
    return false;
  if (r->outcome == VIVI_LOCAL_ASSET_MISSING_V1)
    return work->operation != 2 && !r->host_kind && !r->asset_code && !r->store_kind &&
      !r->outcome_may_have_committed && r->stage == (work->operation == 1 ? 7u : 3u);
  if (r->outcome == VIVI_LOCAL_ASSET_CANCELLED_BEFORE_OPERATION_PUBLICATION_V1)
    return !r->host_kind && !r->asset_code && !r->store_kind && !r->outcome_may_have_committed &&
      (r->stage == 1 || (work->operation == 3 && (r->stage == 3 || r->stage == 5)) ||
        (work->operation == 4 && r->stage == 3));
  if (r->outcome == VIVI_LOCAL_ASSET_INTERNAL_V1)
    return !r->host_kind && !r->asset_code && !r->store_kind;
  if (r->outcome != VIVI_LOCAL_ASSET_HOST_ERROR_V1 || r->host_kind < 1 || r->host_kind > 4)
    return false;
  if (r->host_kind == 3) return r->asset_code >= 1 && r->asset_code <= 18 &&
    r->store_kind == 0 && !r->outcome_may_have_committed;
  if (r->host_kind == 4) return r->asset_code == 0 &&
    ((r->store_kind >= 1 && r->store_kind <= 6) || r->store_kind == 255);
  return r->asset_code == 0 && r->store_kind == 0 && !r->outcome_may_have_committed;
}
static void digest_text(const uint8_t* bytes, char out[65]) {
  static const char digits[] = "0123456789abcdef";
  size_t i;
  for (i = 0; i < 32; i++) { out[2*i] = digits[bytes[i] >> 4]; out[2*i+1] = digits[bytes[i] & 15]; }
  out[64] = '\0';
}
static bool mutating_operation(const Work* work) {
  return work->operation == 2 || work->operation == 3;
}
/* Capture is already resolved data, not a second parser. Admit the entire fixed
 * metadata batch and checked sum before allocating any JS byte buffers. */
static bool capture_metadata(const Work* work, ViviLocalAssetObjectInfoV1 objects[9]) {
  uint64_t total = 0;
  uint32_t i;
  if (work->capture == NULL ||
      work->capture_info.struct_size != VIVI_LOCAL_ASSET_CAPTURE_INFO_SIZE_V1 ||
      work->capture_info.object_count == 0 ||
      work->capture_info.object_count > VIVI_LOCAL_ASSET_MAX_CLOSURE_OBJECTS_V1 ||
      work->capture_info.total_bytes > VIVI_LOCAL_ASSET_MAX_CLOSURE_BYTES_V1)
    return false;
  memset(objects, 0, 9 * sizeof(*objects));
  for (i = 0; i < work->capture_info.object_count; i++) {
    objects[i].struct_size = VIVI_LOCAL_ASSET_OBJECT_INFO_SIZE_V1;
    if (vivi_local_asset_closure_object_v1(work->capture, i, &objects[i], NULL, 0) != 0 ||
        objects[i].struct_size != VIVI_LOCAL_ASSET_OBJECT_INFO_SIZE_V1 || objects[i].reserved ||
        objects[i].byte_length > VIVI_LOCAL_ASSET_MAX_CLOSURE_BYTES_V1 - total)
      return false;
    total += objects[i].byte_length;
  }
  return total == work->capture_info.total_bytes;
}
#define MAP_CHECK(call) do { if ((call) != napi_ok) return NULL; } while (0)
static napi_value error_result(napi_env env, const char* code, uint32_t host, uint32_t asset,
    uint32_t store, bool ambiguous) {
  napi_value out;
  MAP_CHECK(napi_create_object(env, &out));
  MAP_CHECK(text_field(env, out, "status", "error"));
  MAP_CHECK(text_field(env, out, "code", code));
  MAP_CHECK(text_field(env, out, "hostKind", HOST_KINDS[host]));
  MAP_CHECK(text_field(env, out, "assetCode", ASSET_CODES[asset]));
  MAP_CHECK(text_field(env, out, "storeKind", store == 255 ? "UnknownStoreKind" : STORE_KINDS[store]));
  MAP_CHECK(bool_field(env, out, "outcomeMayHaveCommitted", ambiguous));
  MAP_CHECK(napi_object_freeze(env, out));
  return out;
}
static napi_value map_result(napi_env env, const Work* work) {
  const ViviLocalAssetResultV1* r = &work->result;
  napi_value out, verified, asset, png;
  char digest[65];
  ViviLocalAssetObjectInfoV1 objects[9];
#ifdef VIVI_LOCAL_ASSET_TEST
  if (work->owner->test_failure == 6) return NULL;
#endif
  if (work->bridge_status != 0) {
    const char* code = work->bridge_status == 1 ? "LOCAL_ASSET_INVALID_ARGUMENT" :
      work->bridge_status == 2 ? "LOCAL_ASSET_RESOURCE" : "LOCAL_ASSET_INTERNAL";
    return error_result(env, code, 0, 0, 0, work->bridge_status > 2 && mutating_operation(work));
  }
  if (!valid_result(work)) return error_result(env, "LOCAL_ASSET_INTERNAL", 0, 0, 0, mutating_operation(work));
  if (work->operation == 4 && (r->outcome == VIVI_LOCAL_ASSET_READY_V1
      ? !capture_metadata(work, objects) : work->capture != NULL))
    return error_result(env, "LOCAL_ASSET_INTERNAL", 0, 0, 0, false);
  if (r->outcome == VIVI_LOCAL_ASSET_INTERNAL_V1)
    return error_result(env, "LOCAL_ASSET_INTERNAL", 0, 0, 0, r->outcome_may_have_committed != 0);
  if (r->outcome == VIVI_LOCAL_ASSET_HOST_ERROR_V1)
    return error_result(env, r->asset_code ? ASSET_CODES[r->asset_code] :
      r->host_kind == 2 ? "LOCAL_ASSET_RESOURCE" :
      r->host_kind == 4 ? "LOCAL_ASSET_STORE" : "LOCAL_ASSET_INVALID_PLAN",
      r->host_kind, r->asset_code, r->store_kind, r->outcome_may_have_committed != 0);
  MAP_CHECK(napi_create_object(env, &out));
  if (r->outcome != VIVI_LOCAL_ASSET_READY_V1) {
    MAP_CHECK(text_field(env, out, "status", r->outcome == VIVI_LOCAL_ASSET_MISSING_V1 ? "missing" : "cancelled"));
    if (r->outcome != VIVI_LOCAL_ASSET_MISSING_V1)
      MAP_CHECK(bool_field(env, out, "outcomeMayHaveCommitted", false));
    MAP_CHECK(napi_object_freeze(env, out));
    return out;
  }
  MAP_CHECK(napi_create_object(env, &verified));
  MAP_CHECK(napi_create_object(env, &asset));
  MAP_CHECK(napi_create_object(env, &png));
  digest_text(r->reference.object_address, digest);
  MAP_CHECK(text_field(env, asset, "objectAddress", digest));
  digest_text(r->reference.content_sha256, digest);
  MAP_CHECK(text_field(env, asset, "contentSha256", digest));
  MAP_CHECK(text_field(env, asset, "storageKind", r->reference.storage_kind == 1 ? "blob" : "chunk_manifest"));
  MAP_CHECK(text_field(env, asset, "mediaType", "image/png"));
  MAP_CHECK(number_field(env, asset, "sizeBytes", (double)r->reference.size_bytes));
  MAP_CHECK(text_field(env, png, "profile", VIVI_LOCAL_ASSET_PNG_RGBA8_V1_PROFILE));
  MAP_CHECK(number_field(env, png, "width", r->width));
  MAP_CHECK(number_field(env, png, "height", r->height));
  MAP_CHECK(napi_object_freeze(env, asset));
  MAP_CHECK(napi_object_freeze(env, png));
  MAP_CHECK(field(env, verified, "asset", asset));
  MAP_CHECK(field(env, verified, "png", png));
  MAP_CHECK(napi_object_freeze(env, verified));
  MAP_CHECK(text_field(env, out, "status", "ready"));
  MAP_CHECK(field(env, out, "verified", verified));
  if (work->operation == 4) {
    napi_value array;
    uint32_t i;
    MAP_CHECK(napi_create_array_with_length(env, work->capture_info.object_count, &array));
    for (i = 0; i < work->capture_info.object_count; i++) {
      napi_value object, bytes;
      void* output = NULL;
      char index[2] = { (char)('0' + i), '\0' };
      ViviLocalAssetObjectInfoV1 copied = objects[i];
      MAP_CHECK(napi_create_object(env, &object));
#ifdef VIVI_LOCAL_ASSET_TEST
      if (work->owner->test_failure == 10 && i + 1 == work->capture_info.object_count) return NULL;
#endif
      MAP_CHECK(napi_create_buffer(env, (size_t)objects[i].byte_length, &output, &bytes));
      if ((objects[i].byte_length != 0 && output == NULL) ||
          vivi_local_asset_closure_object_v1(work->capture, i, &copied,
            (uint8_t*)output, objects[i].byte_length) != 0 ||
          memcmp(&copied, &objects[i], sizeof(copied)) != 0)
        return error_result(env, "LOCAL_ASSET_INTERNAL", 0, 0, 0, false);
      digest_text(objects[i].address, digest);
      MAP_CHECK(text_field(env, object, "objectAddress", digest));
      MAP_CHECK(field(env, object, "bytes", bytes));
      MAP_CHECK(napi_object_freeze(env, object));
      /* Define own array entries, without calling inherited index setters. */
      MAP_CHECK(field(env, array, index, object));
    }
    MAP_CHECK(napi_object_freeze(env, array));
    MAP_CHECK(field(env, out, "objects", array));
  }
  MAP_CHECK(napi_object_freeze(env, out));
  return out;
}
#undef MAP_CHECK

static void dispose_environment(Environment* state) {
  if (state->buffer_constructor) (void)napi_delete_reference(state->env, state->buffer_constructor);
  if (state->is_buffer) (void)napi_delete_reference(state->env, state->is_buffer);
  if (state->close_promise) (void)napi_delete_reference(state->env, state->close_promise);
  (void)napi_remove_async_cleanup_hook(state->cleanup);
  free(state);
}
static void complete(napi_env env, napi_status status, void* data) {
  Work* work = (Work*)data;
  Environment* state = work->owner;
  napi_value value;
  if (status == napi_cancelled) {
    memset(&work->result, 0, sizeof(work->result));
    work->result.struct_size = 264;
    work->result.outcome = VIVI_LOCAL_ASSET_CANCELLED_BEFORE_OPERATION_PUBLICATION_V1;
    work->result.stage = VIVI_LOCAL_ASSET_STAGE_ARGUMENT_ADMITTED_V1;
  } else if (status != napi_ok) work->bridge_status = 3;
  free_inputs(work);
  vivi_local_asset_cancel_release_v1(work->cancel);
  (void)napi_delete_async_work(env, work->async);
  state->work = NULL;
#ifdef VIVI_LOCAL_ASSET_TEST
  state->test_completed++;
#endif
  if (!state->tearing_down) {
    value = map_result(env, work);
    if (value != NULL) (void)napi_resolve_deferred(env, work->deferred, value);
    else {
      bool pending = false;
      napi_value ignored, message, error;
      if (napi_is_exception_pending(env, &pending) == napi_ok && pending)
        (void)napi_get_and_clear_last_exception(env, &ignored);
      if (string_value(env, "LOCAL_ASSET_INTERNAL", &message) == napi_ok &&
          napi_create_error(env, message, message, &error) == napi_ok)
        (void)napi_reject_deferred(env, work->deferred, error);
    }
    if (state->close_deferred && napi_get_undefined(env, &value) == napi_ok) {
      (void)napi_resolve_deferred(env, state->close_deferred, value);
      state->close_deferred = NULL;
    }
  }
  free_capture(work);
  free(work);
  if (state->tearing_down) dispose_environment(state);
}
static void request_work_cancel(Environment* state) {
  if (state->work != NULL) {
    vivi_local_asset_cancel_request_v1(state->work->cancel);
    /* Generic failure means it is already executing. Completion still owns it. */
    if (state->work->async != NULL)
      (void)napi_cancel_async_work(state->env, state->work->async);
  }
}
static void cleanup(napi_async_cleanup_hook_handle handle, void* data) {
  Environment* state = (Environment*)data;
  (void)handle;
  state->accepting = false;
  state->tearing_down = true;
#ifdef VIVI_LOCAL_ASSET_TEST
  InterlockedExchange(&state->test_hold, 0);
  InterlockedExchange(&state->test_capture_hold, 0);
#endif
  if (state->work != NULL) request_work_cancel(state);
  else dispose_environment(state);
}

static napi_value start(napi_env env, napi_callback_info info) {
  size_t argc = 8, length;
  napi_value argv[8], token_value, promise, answer, resource_name;
  Environment* state;
  Work* work;
  Token* token = NULL;
  bool wrapped = false;
  void* raw;
  int error = 1;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, (void**)&state) != napi_ok)
    return fail(env, "LOCAL_ASSET_INTERNAL");
  if (!state->accepting || state->tearing_down) return fail(env, "LOCAL_ASSET_CLOSED");
  if (state->work != NULL) return fail(env, "LOCAL_ASSET_BUSY");
  if (argc != 7) return fail(env, "LOCAL_ASSET_INVALID_ARGUMENT");
  work = (Work*)calloc(1, sizeof(*work));
  if (work == NULL) return fail(env, "LOCAL_ASSET_RESOURCE");
  work->owner = state;
  state->work = work; /* Reserve before invoking the captured Buffer predicate. */
  if (!unsigned_value(env, argv[0], 4, &work->operation) ||
      !unsigned_value(env, argv[5], 8192, &work->width) ||
      !unsigned_value(env, argv[6], 8192, &work->height)) goto failed;
  error = copy_endpoint(work, 0, argv[1]);
  if (error) goto failed;
  error = 1;
  if (work->operation == 3) {
    error = copy_endpoint(work, 1, argv[2]);
    if (error) goto failed;
  } else if (!is_null(env, argv[2])) goto failed;
  error = 1;
  if (work->operation == 2) {
    if (!is_null(env, argv[3]) || !buffer_view(state, argv[4], &raw, &length) ||
        length > 16777216) goto failed;
    work->png_length = length;
    if (length != 0) {
#ifdef VIVI_LOCAL_ASSET_TEST
      if (state->test_failure == 2) { error = 2; goto failed; }
#endif
      work->png = (uint8_t*)malloc(length);
      if (work->png == NULL) { error = 2; goto failed; }
      memcpy(work->png, raw, length);
    }
  } else {
    if (!is_null(env, argv[4]) || !buffer_view(state, argv[3], &raw, &length) || length != 216)
      goto failed;
    memcpy(&work->reference, raw, 216);
  }
  error = vivi_local_asset_cancel_create_v1(&work->cancel);
  if (error) goto failed;
  error = 2;
#ifdef VIVI_LOCAL_ASSET_TEST
  if (state->test_failure == 3) goto failed;
#endif
  token = (Token*)calloc(1, sizeof(*token));
  if (token == NULL) goto failed;
  token->identity = env;
  token->cancel = work->cancel;
  vivi_local_asset_cancel_retain_v1(token->cancel);
  error = 3;
  if (napi_create_object(env, &token_value) != napi_ok ||
      napi_type_tag_object(env, token_value, &TOKEN_TAG) != napi_ok ||
      napi_wrap(env, token_value, token, token_finalize, NULL, NULL) != napi_ok) goto failed;
  wrapped = true;
  if (napi_object_freeze(env, token_value) != napi_ok ||
      napi_create_promise(env, &work->deferred, &promise) != napi_ok) goto failed;
#ifdef VIVI_LOCAL_ASSET_TEST
  if (state->test_failure == 8) goto failed;
  if (state->test_failure == 9) { (void)napi_throw_error(env, "TEST_PENDING", "TEST_PENDING"); goto failed; }
#endif
  if (napi_create_object(env, &answer) != napi_ok ||
      field(env, answer, "token", token_value) != napi_ok ||
      field(env, answer, "result", promise) != napi_ok ||
      napi_object_freeze(env, answer) != napi_ok ||
      string_value(env, "vivi.local.asset.v1", &resource_name) != napi_ok) goto failed;
#ifdef VIVI_LOCAL_ASSET_TEST
  if (state->test_failure == 4) goto failed;
#endif
  if (napi_create_async_work(env, NULL, resource_name, execute, complete, work, &work->async) != napi_ok) goto failed;
#ifdef VIVI_LOCAL_ASSET_TEST
  if (state->test_failure == 5) goto failed;
#endif
  /* Buffer branding and async-work setup can reenter JS. A close before this
   * queue boundary is never permission to start fresh uncancelled work. */
  if (!state->accepting || state->tearing_down) { error = 4; goto failed; }
  if (napi_queue_async_work(env, work->async) != napi_ok) goto failed;
  return answer;
failed:
  settle_unpublished(env, &work->deferred);
  if (work->async != NULL) (void)napi_delete_async_work(env, work->async);
  if (token != NULL && !wrapped) token_finalize(env, token, NULL);
  vivi_local_asset_cancel_release_v1(work->cancel);
  free_inputs(work);
  free_capture(work);
  free(work);
  state->work = NULL;
#ifdef VIVI_LOCAL_ASSET_TEST
  state->test_setup_failures++;
#endif
  settle_unpublished(env, &state->close_deferred);
  return fail(env, error == 1 ? "LOCAL_ASSET_INVALID_ARGUMENT" :
    error == 2 ? "LOCAL_ASSET_RESOURCE" : error == 4 ? "LOCAL_ASSET_CLOSED" : "LOCAL_ASSET_INTERNAL");
}
static napi_value cancel(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], answer;
  Token* token;
  Environment* state;
  bool tagged = false;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, (void**)&state) != napi_ok || argc != 1 ||
      napi_check_object_type_tag(env, argv[0], &TOKEN_TAG, &tagged) != napi_ok || !tagged ||
      napi_unwrap(env, argv[0], (void**)&token) != napi_ok || token->identity != env)
    return fail(env, "LOCAL_ASSET_INVALID_ARGUMENT");
  vivi_local_asset_cancel_request_v1(token->cancel);
  if (state->work && state->work->cancel == token->cancel) request_work_cancel(state);
  if (napi_get_undefined(env, &answer) != napi_ok) return fail(env, "LOCAL_ASSET_INTERNAL");
  return answer;
}
static napi_value close_bridge(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], promise, value;
  napi_deferred deferred = NULL;
  Environment* state;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, (void**)&state) != napi_ok || argc != 0)
    return fail(env, "LOCAL_ASSET_INVALID_ARGUMENT");
  if (state->close_promise != NULL) {
    if (napi_get_reference_value(env, state->close_promise, &promise) != napi_ok)
      return fail(env, "LOCAL_ASSET_INTERNAL");
    return promise;
  }
  if (napi_create_promise(env, &deferred, &promise) != napi_ok)
    return fail(env, "LOCAL_ASSET_RESOURCE");
#ifdef VIVI_LOCAL_ASSET_TEST
  if (state->test_failure == 7) goto failed;
#endif
  if (napi_create_reference(env, promise, 1, &state->close_promise) != napi_ok)
    goto failed;
  state->close_deferred = deferred;
  state->accepting = false;
  request_work_cancel(state);
  if (state->work == NULL && napi_get_undefined(env, &value) == napi_ok) {
    (void)napi_resolve_deferred(env, state->close_deferred, value);
    state->close_deferred = NULL;
  }
  return promise;
failed:
  settle_unpublished(env, &deferred);
  return fail(env, "LOCAL_ASSET_RESOURCE");
}
#ifdef VIVI_LOCAL_ASSET_TEST
/* This descriptor and synchronization are absent from the shipping build. The
 * worker still calls the same real C ABI after the controlled pre-entry hold. */
static napi_value test_control(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2], answer;
  Environment* state;
  uint32_t command;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, (void**)&state) != napi_ok || argc != 1 ||
      !unsigned_value(env, argv[0], 17, &command)) return fail(env, "LOCAL_ASSET_INVALID_ARGUMENT");
  if (command == 1) { InterlockedExchange(&test_release_all, 0); InterlockedExchange(&state->test_entered, 0); InterlockedExchange(&state->test_hold, 1); }
  else if (command == 2) InterlockedExchange(&state->test_hold, 0);
  else if (command == 10) InterlockedExchange(&test_release_all, 1);
  else if (command == 11) state->test_failure = 6;
  else if (command == 15) state->test_failure = 10;
  else if (command == 16) { InterlockedExchange(&test_release_all, 0); InterlockedExchange(&state->test_captured, 0); InterlockedExchange(&state->test_capture_hold, 1); }
  else if (command == 17) InterlockedExchange(&state->test_capture_hold, 0);
  else if (command >= 12) state->test_failure = command - 5;
  else if (command >= 4) state->test_failure = command == 9 ? 0 : command - 3;
  if (napi_create_object(env, &answer) != napi_ok ||
      bool_field(env, answer, "entered", InterlockedCompareExchange(&state->test_entered, 0, 0) != 0) != napi_ok ||
      bool_field(env, answer, "busy", state->work != NULL) != napi_ok ||
      bool_field(env, answer, "captured", InterlockedCompareExchange(&state->test_captured, 0, 0) != 0) != napi_ok ||
      number_field(env, answer, "captureReleases", InterlockedCompareExchange(&test_capture_releases, 0, 0)) != napi_ok ||
      number_field(env, answer, "completed", state->test_completed) != napi_ok ||
      number_field(env, answer, "setupFailures", state->test_setup_failures) != napi_ok ||
      napi_object_freeze(env, answer) != napi_ok) return fail(env, "LOCAL_ASSET_INTERNAL");
  return answer;
}
#endif
static napi_value init(napi_env env, napi_value exports) {
  Environment* state = (Environment*)calloc(1, sizeof(*state));
  napi_value global, constructor, predicate, version;
  uint32_t supported = 0;
  napi_property_descriptor descriptors[4];
  if (state == NULL) return fail(env, "LOCAL_ASSET_RESOURCE");
  state->env = env;
  state->accepting = true;
  if (napi_get_version(env, &supported) != napi_ok || supported < 8 ||
      vivi_local_asset_get_abi_version_v1() != 1 ||
      napi_get_global(env, &global) != napi_ok ||
      napi_get_named_property(env, global, "Buffer", &constructor) != napi_ok ||
      napi_get_named_property(env, constructor, "isBuffer", &predicate) != napi_ok ||
      napi_create_reference(env, constructor, 1, &state->buffer_constructor) != napi_ok ||
      napi_create_reference(env, predicate, 1, &state->is_buffer) != napi_ok ||
      napi_create_uint32(env, 1, &version) != napi_ok) goto failed;
#ifdef VIVI_LOCAL_ASSET_TEST_INIT_FAILURE
  if (test_initialization_failure) goto failed;
#endif
  memset(descriptors, 0, sizeof(descriptors));
  descriptors[0].utf8name = "start"; descriptors[0].method = start; descriptors[0].data = state;
  descriptors[1].utf8name = "cancel"; descriptors[1].method = cancel; descriptors[1].data = state;
  descriptors[2].utf8name = "close"; descriptors[2].method = close_bridge; descriptors[2].data = state;
  descriptors[3].utf8name = "abiVersion"; descriptors[3].value = version;
  if (napi_define_properties(env, exports, 4, descriptors) != napi_ok) goto failed;
#ifdef VIVI_LOCAL_ASSET_TEST
  {
    const napi_property_descriptor test = { "__test", NULL, test_control, NULL, NULL, NULL, napi_default, state };
    if (napi_define_properties(env, exports, 1, &test) != napi_ok) goto failed;
  }
#endif
  if (napi_object_freeze(env, exports) != napi_ok ||
      napi_add_async_cleanup_hook(env, cleanup, state, &state->cleanup) != napi_ok) goto failed;
  return exports;
failed:
  if (state->buffer_constructor) (void)napi_delete_reference(env, state->buffer_constructor);
  if (state->is_buffer) (void)napi_delete_reference(env, state->is_buffer);
  free(state);
  return fail(env, "LOCAL_ASSET_UNAVAILABLE");
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
