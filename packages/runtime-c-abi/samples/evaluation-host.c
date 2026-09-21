/* Internal C2 host probe: real owned preparation and length-delimited copy-out.
   Synthetic 1x1 input only; no product data, paths, services or renderer claims. */
#include "vivi_runtime_editor.h"
#include <stdio.h>
#include <string.h>

static const uint8_t png[] = {137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,16,50,9,99,0,0,1,149,0,157,77,65,8,223,0,0,0,0,73,69,78,68,174,66,96,130};
static const uint8_t digest[32] = {0x76,0xf4,0x30,0xc6,0x6c,0xac,0x7e,0xb8,0x23,0xfa,0x3a,0x8c,0xa4,0x42,0x09,0xc9,0x58,0x46,0x93,0xdf,0xbc,0xc1,0x5d,0x9b,0x1d,0x5e,0xa3,0x0d,0xaa,0x4d,0xd3,0xd2};
static const char payload[] =
  "{\"schema\":\"vivi2d.evaluationPayload.v1\",\"canvas\":{\"width\":32,\"height\":32},"
  "\"layers\":[{\"id\":\"mesh\",\"name\":\"mesh\",\"kind\":\"viviMesh\",\"visible\":true,\"opacity\":1,\"x\":0,\"y\":0,\"width\":1,\"height\":1,\"blendMode\":\"normal\",\"expanded\":true,\"children\":[],\"mesh\":{\"vertices\":[0,0,1,0,0,1],\"uvs\":[0,0,1,0,0,1],\"indices\":[0,1,2],\"divisionsX\":1,\"divisionsY\":1}}],"
  "\"parameters\":[{\"id\":\"p\",\"name\":\"p\",\"minValue\":0,\"maxValue\":1,\"defaultValue\":0}],\"parameterBindings\":[],\"skins\":{},\"ikControllers\":[],\"physicsGroups\":[],\"colliders\":[],\"expressionPresets\":[{\"id\":\"zero\",\"name\":\"zero\",\"values\":{\"p\":0}}],\"clips\":[],\"stateMachines\":[],"
  "\"atlases\":[{\"id\":\"a\",\"width\":1,\"height\":1,\"entries\":[{\"layerId\":\"mesh\",\"x\":0,\"y\":0,\"width\":1,\"height\":1}]}]}";

#define REQUIRE(test) do { if (!(test)) { fprintf(stderr,"Evaluation C probe failed at line %d\n",__LINE__); goto failure; } } while (0)
int main(void) {
  ViviEvaluationRuntime *runtime = NULL;
  ViviPreparedEvaluation *prepared = NULL;
  ViviEvaluationTextureV2 texture = {0};
  ViviEvaluationObjectV2 object = {0};
  ViviEvaluationLoadV2 load = {0};
  ViviEvaluationPrepareInfoV2 info = {16,0,0,0};
  ViviEvaluationRequestStateV2 state = {24,0,1,0};
  ViviEvaluationTextureInfoV2 texture_info = {0};
  ViviEvaluationTextureBuffersV2 texture_buffers = {0};
  ViviEvaluationMeshInfoV2 mesh_info = {0};
  ViviEvaluationMeshBuffersV2 mesh_buffers = {0};
  ViviGenerations generations = {0};
  ViviDrawCommandV2 command = {24,0,0,0,0,0};
  uint8_t texture_id[7], pixels[4], mesh_id[4];
  uint32_t vertices[6] = {0}, uvs[6] = {0}, indices[3] = {0};
  uint32_t activated = 0;
  ViviEvaluationBytesV2 parameter_id = {(const uint8_t *)"p",1};
  ViviEvaluationBytesV2 preset_id = {(const uint8_t *)"zero",4};
  REQUIRE(vivi_evaluation_abi_version() == 2);
  REQUIRE(vivi_evaluation_create(&runtime) == 0);
  REQUIRE(vivi_evaluation_observe_request_state(runtime,&state) == 0);
  texture.struct_size=112; texture.storage_kind=1; texture.width=1; texture.height=1;
  texture.id.data=(const uint8_t *)"atlas:a"; texture.id.len=7; texture.logical_size=sizeof(png);
  memcpy(texture.object_address,digest,32); memcpy(texture.content_sha256,digest,32);
  object.struct_size=56; memcpy(object.object_address,digest,32); object.bytes.data=png; object.bytes.len=sizeof(png);
  load.struct_size=64; load.request_generation=1; load.payload.data=(const uint8_t *)payload; load.payload.len=sizeof(payload)-1; load.textures=&texture; load.texture_count=1;
  REQUIRE(vivi_evaluation_prepare(runtime,&load,&prepared,&info) == 0 && info.kind == 2 && info.missing_count == 1);
  REQUIRE(vivi_evaluation_retry_missing(runtime,&prepared,&object,1,&info) == 0 && info.kind == 1);
  texture_info.struct_size=48; texture_buffers.struct_size=40;
  texture_buffers.id.data=texture_id; texture_buffers.id.capacity=sizeof(texture_id); texture_buffers.pixels.data=pixels; texture_buffers.pixels.capacity=sizeof(pixels);
  REQUIRE(vivi_evaluation_prepared_get_texture_snapshot(prepared,0,&texture_buffers,&texture_info) == 0);
  REQUIRE(texture_info.pixel_bytes == 4 && memcmp(texture_id,"atlas:a",7) == 0);
  REQUIRE(pixels[0]==0x12 && pixels[1]==0x34 && pixels[2]==0x56 && pixels[3]==0);
  mesh_info.struct_size=96; mesh_buffers.struct_size=72;
  mesh_buffers.id.data=mesh_id; mesh_buffers.id.capacity=sizeof(mesh_id);
  mesh_buffers.vertices.data=(uint8_t *)vertices; mesh_buffers.vertices.capacity=sizeof(vertices);
  mesh_buffers.uvs.data=(uint8_t *)uvs; mesh_buffers.uvs.capacity=sizeof(uvs);
  mesh_buffers.indices.data=(uint8_t *)indices; mesh_buffers.indices.capacity=sizeof(indices);
  REQUIRE(vivi_evaluation_prepared_get_render_mesh_snapshot(prepared,0,&mesh_buffers,&mesh_info) == 0);
  REQUIRE(memcmp(mesh_id,"mesh",4)==0 && vertices[2]==0x3f800000u && indices[2]==2);
  REQUIRE(vivi_evaluation_prepared_get_draw_command_snapshot(prepared,0,&command)==0 && command.command_type==1);
  REQUIRE(vivi_evaluation_commit(runtime,&prepared,&activated)==0 && activated==1 && prepared==NULL);
  REQUIRE(vivi_evaluation_get_generations(runtime,&generations)==0 && generations.model_generation==1 && generations.topology_generation==1 && generations.dynamic_generation==0);
  REQUIRE(vivi_evaluation_set_input(runtime,parameter_id,1.0)==0);
  REQUIRE(vivi_evaluation_apply_expression_preset(runtime,preset_id)==0);
  REQUIRE(vivi_evaluation_update(runtime,0.0)==0);
  REQUIRE(vivi_evaluation_get_generations(runtime,&generations)==0 && generations.dynamic_generation==1);
  vivi_evaluation_destroy(runtime);
  puts("Evaluation C layout/link/copy-out passed");
  return 0;
failure:
  vivi_evaluation_prepared_destroy(prepared);
  vivi_evaluation_destroy(runtime);
  return 1;
}
