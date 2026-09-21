// Fixed-family data-only generator; no primitive or candidate is evaluated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function generateScopes(corpus, emit) {
const manifest=corpus.load('native-c10-case-index-manifest-1.json','3af093cec5c2b43bd8e711a3f4a40b3d496030c15f14870612db281404190ac1');
const pins=[],ledger=[],q=JSON.stringify;
function load(file,hash){const value=corpus.load(file,hash);const p=corpus.pins.get(file);pins.push({file,bytes:p.bytes,sha256:p.sha256});return value;}
function word(v){assert.match(v,/^[0-9a-f]{16}$/);return '0x'+v+'u64';}
const ptr=(f,p)=>`SourceRef { file: ${q(f)},pointer: ${q(p)} }`;
const uf=manifest.cases[96].expected.file,u=load(uf,manifest.cases[96].expected.sha256);
let rust='// Additional fixed case-scope literals. No numerical evaluation.\nuse super::literal_types::*;\n';
rust+='#[derive(Clone,Copy,Debug)] pub struct CaseScopeExpected { pub case_index:u32,pub source:SourceRef,pub request_generation:u64,pub source_dynamic_generation:u64,pub bone_dfs_ids:&\'static [&\'static str],pub mesh_dfs_ids:&\'static [&\'static str] }\n';
rust+='pub static CASE_SCOPES: &[CaseScopeExpected] = &[\n';
for(const [i,c]of u.cases.entries()){assert.match(c.requestGenerationU64,/^\d+$/);assert.match(c.sourceStateDynamicGenerationU64,/^\d+$/);rust+=`CaseScopeExpected { case_index:${96+i},source:${ptr(uf,'/cases/'+i)},request_generation:${c.requestGenerationU64},source_dynamic_generation:${c.sourceStateDynamicGenerationU64},bone_dfs_ids:&[${c.boneDfsOrder.map(q).join(',')}],mesh_dfs_ids:&[${c.meshDfsOrder.map(q).join(',')}] },\n`;for(const key of ['requestGenerationU64','sourceStateDynamicGenerationU64','boneDfsOrder','meshDfsOrder'])ledger.push({caseIndex:96+i,file:uf,pointer:'/cases/'+i+'/'+key,disposition:'asserted-case-scope-literal',supersedes:'ledger1 case-provenance-or-redundant-trace-state-explanation classification for this exact field only'});}
rust+='];\n';
const af=manifest.cases[0].expected.file,a=load(af,manifest.cases[0].expected.sha256);
rust+='#[derive(Clone,Copy,Debug)] pub struct PresetStorageExpected { pub case_index:u32,pub source:SourceRef,pub parameter_slots:&\'static [u32],pub value_bits:&\'static [u64] }\n';
rust+='pub static PRESET_STORAGE: &[PresetStorageExpected] = &[\n';
for(const [i,c]of a.cases.entries())if(c.presetTypedParameterSlotsU32){assert.equal(c.presetTypedParameterSlotsU32.length,c.presetTypedValueD64Bits.length);for(const v of c.presetTypedParameterSlotsU32)assert.match(v,/^\d+$/);rust+=`PresetStorageExpected { case_index:${i},source:${ptr(af,'/cases/'+i)},parameter_slots:&[${c.presetTypedParameterSlotsU32.join(',')}],value_bits:&[${c.presetTypedValueD64Bits.map(word).join(',')}] },\n`;for(const key of ['presetTypedParameterSlotsU32','presetTypedValueD64Bits'])ledger.push({caseIndex:i,file:af,pointer:'/cases/'+i+'/'+key,disposition:'asserted-preset-storage-literal',supersedes:'ledger1 case-provenance-or-redundant-trace-state-explanation classification for this exact field only'});}
rust+='];\n';
const pf=manifest.cases[44].expected.file,p=load(pf,manifest.cases[44].expected.sha256);
rust+='#[derive(Clone,Copy,Debug)] pub struct BeforeActionStateExpected { pub case_index:u32,pub action_index:u32,pub state:StateExpected }\n';
rust+='pub static BEFORE_ACTION_STATES: &[BeforeActionStateExpected] = &[\n';
for(const[i,c]of p.cases.entries())if(c.expectedBeforeAction1CommittedPhysics){const v=c.expectedBeforeAction1CommittedPhysics;assert.deepEqual(Object.keys(v),['pendulums','accumulator']);const pendulums=v.pendulums.map(x=>{assert.deepEqual(Object.keys(x),['angle','velocity']);return `PendulumExpected { angle:${word(x.angle)},velocity:${word(x.velocity)} }`;});rust+=`BeforeActionStateExpected { case_index:${44+i},action_index:1,state:StateExpected { source:${ptr(pf,'/cases/'+i+'/expectedBeforeAction1CommittedPhysics')},domain:Domain::PreActionInjected,physics_pendulums:Some(&[${pendulums.join(',')}]),physics_accumulator:Some(${word(v.accumulator)}),..EMPTY_STATE } },\n`;ledger.push({caseIndex:44+i,file:pf,pointer:'/cases/'+i+'/expectedBeforeAction1CommittedPhysics',disposition:'asserted-pre-action-committed-physics-literal',supersedes:'ledger1 pre-action-injection-corroboration category; now explicit typed expected fields'});}
rust+='];\n';
const report={kind:'c10-literal-case-scope-binding-v1',sourcePins:pins,ledger,limits:['Scope literals are additional assertions; original numerical author files and first emitted cases are unchanged.','Do not treat source_dynamic_generation as the generation after every update. It applies to the original supplied source state.','No hard-coded default generation substituted.','PhaseCounts remain redundant arithmetic/projection counts bound by full exact traces; they are not a different numerical oracle.']};
corpus.verify();
for(const[name,text]of [['native-c10-literal-scopes-1.rs',rust],['native-c10-literal-scopes-ledger-1.json',JSON.stringify(report)+'\n']]){emit(name, text);}

}

