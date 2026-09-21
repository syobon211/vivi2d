// Input-only IDs from the same fixed selected payloads; no expected-ID synthesis.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function generateIdentities(input,emit){
const file='c10-c9-materialized-setup-export-1/resolved-case-inputs.json';
const bytes=Buffer.from(JSON.stringify(input)+'\n');
assert.equal(bytes.length,917486);
assert.equal(sha(bytes),'e5a5876f0c5f70e4244df8ff7724dfa5763d163868d0cd508288c426a8217d94');
assert.equal(input.length,147);
const ledger=[];const rows=[];
for(const [index,entry]of input.entries()){
  assert.equal(entry.index,index);assert.equal(typeof entry.payloadUtf8,'string');
  assert.equal(sha(entry.payloadUtf8),entry.payloadCompactJsonSha256);
  const payload=JSON.parse(entry.payloadUtf8);const bones=[],meshes=[];
  function visit(layers,depth=0){assert(Array.isArray(layers));assert(depth<=64);for(const layer of layers){
    assert.equal(typeof layer.id,'string');assert.equal(typeof layer.kind,'string');
    if(layer.kind==='bone')bones.push(layer.id);
    if(layer.kind==='viviMesh')meshes.push(layer.id);
    visit(layer.children,depth+1);
  }}
  visit(payload.layers);
  assert(bones.length<=10000&&meshes.length<=10000);
  rows.push(`IdentityView { bone_ids:&${JSON.stringify(bones)},mesh_ids:&${JSON.stringify(meshes)} }`);
  ledger.push({index,input:entry.input,payloadCompactJsonSha256:entry.payloadCompactJsonSha256,boneDfsIds:bones,meshDfsIds:meshes});
}
const outputs=[['identity_setup.rs','// Input-only DFS identity literals. Generated offline, no numerical oracle.\nuse crate::state_checks::IdentityView;\npub(crate) static IDENTITIES: &[IdentityView] = &[\n'+rows.join(',\n')+'\n];\n'],['native-c10-literal-identities-ledger-1.json',JSON.stringify({source:{file,bytes:bytes.length,sha256:sha(bytes)},rule:'payload layer pre-order DFS, declared child order; select kind bone or viviMesh independently, identical C9 slot traversal rule',cases:ledger})+'\n']];
for(const[name,text]of outputs){emit(name,text);}

}

