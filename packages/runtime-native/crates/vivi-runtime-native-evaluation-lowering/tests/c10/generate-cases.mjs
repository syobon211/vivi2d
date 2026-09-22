// Fixed-family data-only generator; no primitive or candidate is evaluated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function generateCases(corpus, emit) {
const { load, pins } = corpus;
const manifest = load('native-c10-case-index-manifest-1.json');
const binding = load('native-c10-freeze-assertion-binding-2.json');
const esc = k => String(k).replaceAll('~', '~0').replaceAll('/', '~1');
function at(v, p) { for (const k of p.split('/').slice(1)) { const key = k.replaceAll('~1', '/').replaceAll('~0', '~'); assert(v && Object.hasOwn(v, key), p); v = v[key]; } return v; }
const q = s => JSON.stringify(s).replaceAll('\\u2028', '\\u{2028}').replaceAll('\\u2029', '\\u{2029}');
const src = (f, p) => `SourceRef { file: ${q(f)}, pointer: ${q(p)} }`;
const bits = (s, n = 64) => { assert.equal(typeof s, 'string'); assert.match(s, n === 64 ? /^[0-9a-f]{16}$/ : /^[0-9a-f]{8}$/); return `0x${s}${n === 64 ? 'u64' : 'u32'}`; };
const uint = (v, n = 32) => { const s = String(v); assert.match(s, /^(0|[1-9][0-9]*)$/); assert(BigInt(s) < (1n << BigInt(n))); return s + (n === 64 ? 'u64' : 'u32'); };
const bool = v => { assert.equal(typeof v, 'boolean'); return String(v); };
const list = (v, cv) => { assert(Array.isArray(v)); return `&[${v.map(cv).join(',')}]`; };
const words = (v, n = 64) => list(v, x => bits(x, n));
const decimals = (v, n = 32) => list(v, x => uint(x, n));
const strings = v => list(v, q);
const some = s => `Some(${s})`;
const ledger = new Map();
const definitions = [];
const caseLiterals = [];
const deferred = new Set(binding.topologyAssertionOverrides.map(o => o.file + o.pointer));
const deferredSeen = new Set();
let currentCase = -1;
function claim(v, f, p, category, target) {
  const leaves = [];
  function walk(x, path) {
    if (x && typeof x === 'object' && Object.keys(x).length) for (const [k, child] of Object.entries(x)) walk(child, path + '/' + esc(k));
    else leaves.push(path);
  }
  walk(v, p);
  for (const path of leaves) {
    const key = f + path;
    if (!ledger.has(key)) ledger.set(key, { file: f, pointer: path, category, targets: [], cases: [] });
    const row = ledger.get(key);
    assert.equal(row.category, category, key);
    if (!row.targets.includes(target)) row.targets.push(target);
    if (!row.cases.includes(currentCase)) row.cases.push(currentCase);
  }
}
function known(obj, keys, where) { for (const key of Object.keys(obj)) assert(keys.includes(key), `UNHANDLED ${where}/${key}`); }
function leafMap(obj, f, p, mapping, target) {
  const fields = [];
  for (const [k, v] of Object.entries(obj)) {
    assert(mapping[k], `UNHANDLED ${f}${p}/${k}`);
    const [field, convert] = mapping[k];
    fields.push(`${field}: ${convert(v)}`);
    claim(v, f, p + '/' + esc(k), 'asserted-literal', target + '.' + field);
  }
  return fields;
}
function nullable(obj, key, cv) { return !Object.hasOwn(obj, key) ? 'Presence::Unspecified' : obj[key] === null ? 'Presence::Absent' : `Presence::Value(${cv(obj[key])})`; }
function bone(v, f, p) {
  known(v, ['boneSlot', 'boneId', 'presenceMaskU32', 'presenceU32', 'presentProperties', 'paddingU32', 'x', 'y', 'angle', 'scaleX', 'scaleY', 'xD64Bits', 'yD64Bits', 'angleD64Bits', 'scaleXD64Bits', 'scaleYD64Bits', 'otherStoredPropertiesD64Bits'], f + p);
  const storage = Number(p.split('/').at(-1));
  const fields = { locator: v.boneSlot !== undefined ? `BoneLocator::Slot(${uint(v.boneSlot)})` : v.boneId !== undefined ? `BoneLocator::Id(${q(v.boneId)})` : `BoneLocator::StorageIndex(${uint(storage)})`, presence_mask: 'None', properties: 'None', padding: 'None', x: 'None', y: 'None', angle: 'None', scale_x: 'None', scale_y: 'None' };
  const props = { x: 'X', y: 'Y', angle: 'Angle', scaleX: 'ScaleX', scaleY: 'ScaleY', scale_x: 'ScaleX', scale_y: 'ScaleY' };
  for (const [k, x] of Object.entries(v)) {
    let field;
    if (k === 'boneSlot' || k === 'boneId') field = 'locator';
    else if (k === 'presenceMaskU32' || k === 'presenceU32') { field = 'presence_mask'; const next = some(uint(x)); assert(fields[field] === 'None' || fields[field] === next); fields[field] = next; }
    else if (k === 'presentProperties') { field = 'properties'; fields[field] = some(list(x, z => { assert(props[z]); return 'BoneProperty::' + props[z]; })); }
    else if (k === 'paddingU32') { field = 'padding'; fields[field] = some(uint(x)); }
    else if (k === 'otherStoredPropertiesD64Bits') {
      known(x, ['x', 'y', 'scale_x', 'scale_y'], f + p + '/' + k);
      for (const [z, b] of Object.entries(x)) { const next = some(bits(b)); assert(fields[z] === 'None' || fields[z] === next); fields[z] = next; }
      field = 'stored_properties';
    } else {
      field = ({ xD64Bits: 'x', yD64Bits: 'y', angleD64Bits: 'angle', scaleXD64Bits: 'scale_x', scaleYD64Bits: 'scale_y', scaleX: 'scale_x', scaleY: 'scale_y' })[k] ?? k;
      const next = some(bits(x)); assert(fields[field] === 'None' || fields[field] === next); fields[field] = next;
    }
    claim(x, f, p + '/' + k, 'asserted-literal', 'BoneExpected.' + field);
  }
  return `BoneExpected { ${Object.entries(fields).map(([k,x]) => k + ': ' + x).join(',')} }`;
}
function mesh(v, f, p) {
  const map = { meshSlot: ['slot', uint], snapshotValid: ['snapshot_valid', x => some(bool(x))], visible: ['visible', x => some(bool(x))], effectiveVisible: ['effective_visible', x => some(bool(x))], culled: ['culled', x => some(bool(x))], xD32Bits: ['x', x => some(bits(x, 32))], yD32Bits: ['y', x => some(bits(x, 32))], vertexD32Bits: ['vertices', x => some(words(x, 32))] };
  const fields = { slot: uint(Number(p.split('/').at(-1))), snapshot_valid: 'None', visible: 'None', effective_visible: 'None', culled: 'None', x: 'None', y: 'None', vertices: 'None' };
  for (const text of leafMap(v, f, p, map, 'MeshExpected')) { const i = text.indexOf(':'); fields[text.slice(0,i)] = text.slice(i+2); }
  return `MeshExpected { ${Object.entries(fields).map(([k,x]) => k + ': ' + x).join(',')} }`;
}
function state(v, f, p, domain) {
  assert(v && !Array.isArray(v));
  const fields = [`source: ${src(f,p)}`, `domain: Domain::${domain}`];
  const out = new Map();
  function set(k, val) { assert(!out.has(k) || out.get(k) === val, 'conflicting state alias ' + f + p + ':' + k); out.set(k,val); }
  const bitArrays = { parameterCurrentD64Bits: 'parameter_current', currentParameterD64Bits: 'parameter_current', callerCurrentD64Bits: 'parameter_current', parameterPreviousD64Bits: 'parameter_previous', previousParameterD64Bits: 'parameter_previous', parameterUpdateD64Bits: 'parameter_update', parameterUpdate: 'parameter_update', skinnedD64Bits: 'skinned', skinnedScratchD64Bits: 'skinned', skinnedScratchBeforeProjectionD64Bits: 'skinned', bindingAccumulatorsD64Bits: 'binding_accumulators', currentLocalReadD64Bits: 'current_local_read' };
  const d32Arrays = { derivedD32Bits: 'derived', derivedCoordinateD32Bits: 'derived', directVertexD32Bits: 'direct_vertices', directUvD32Bits: 'direct_uv', directXYD32Bits: 'direct_xy', derivedUpdateD32Bits: 'derived_update', projectedPrefixD32Bits: 'projected_prefix', projectionAcceptedPrefixD32Bits: 'projected_prefix', acceptedProjectionPrefixD32Bits: 'projected_prefix', preUpdateCommittedPrefixD32Bits: 'projected_prefix' };
  const u32Arrays = { meshCommittedFlagsU32: 'mesh_flags', directIndicesU32: 'direct_indices' };
  const bitFields = { physicsAccumulatorD64Bits: 'physics_accumulator', committedPhysicsAccumulatorD64Bits: 'physics_accumulator', accumulator: 'physics_update_accumulator', physicsUpdateAccumulatorD64Bits: 'physics_update_accumulator' };
  const flags = { physicsPresent: 'physics_present', physicsSnapshotValid: 'physics_snapshot_valid', physicsUpdateSnapshotValid: 'physics_update_valid', absentPhysicsCanonicalNoOp: 'absent_physics_noop' };
  for (const [k,x] of Object.entries(v)) {
    const path = p + '/' + k;
    if (k === 'topologyGenerationU64') { assert(deferred.has(f+path)); assert.equal(x,'1'); deferredSeen.add(f+path); claim(x,f,path,'deferred-C11-exact-selector','binding2'); continue; }
    if (['phase','validity','noNewValidityFields'].includes(k)) { assert.equal(typeof x,'string'); claim(x,f,path,'phase-or-scope-explanation','Domain::'+domain); continue; }
    if (k === 'unchangedTables') { known(x,['payloadSha256','source'],f+path); claim(x,f,path,'immutable-input-identity-obligation','case input pin / no candidate mutation'); continue; }
    let target;
    if (bitArrays[k]) { target = bitArrays[k]; set(target,some(words(x))); }
    else if (d32Arrays[k]) { target = d32Arrays[k]; set(target,some(words(x,32))); }
    else if (u32Arrays[k]) { target = u32Arrays[k]; set(target,some(decimals(x))); }
    else if (bitFields[k]) { target = bitFields[k]; set(target,some(bits(x))); }
    else if (flags[k]) { target = flags[k]; set(target,some(bool(x))); }
    else if (['requestGenerationU64','dynamicGenerationU64'].includes(k)) { target = k === 'requestGenerationU64' ? 'request_generation' : 'dynamic_generation'; set(target,some(uint(x,64))); }
    else if (k === 'physicsOriginalGroupIndexU32') { target='physics_original_group'; set(target,some(uint(x))); }
    else if (k === 'parameterSlotIds') { target='parameter_ids'; set(target,some(strings(x))); }
    else if (['boneOverrides','committedBoneOverrides','boneUpdateOverrides'].includes(k)) { target=k==='boneUpdateOverrides'?'bone_update':'bone_overrides'; set(target,some(list(x,(z,i)=>bone(z,f,path+'/'+i)))); }
    else if (['physicsPendulums','committedPhysicsPendulums','physicsUpdatePendulums'].includes(k)) { target=k==='physicsUpdatePendulums'?'physics_update_pendulums':'physics_pendulums'; set(target,some(list(x,(z)=>{known(z,['angle','velocity'],f+path);return `PendulumExpected { angle: ${bits(z.angle)}, velocity: ${bits(z.velocity)} }`;}))); }
    else if (['meshes','meshUpdateFlags'].includes(k)) { target=k==='meshes'?'meshes':'mesh_update'; set(target,some(list(x,(z,i)=>mesh(z,f,path+'/'+i)))); }
    else if (['worldPre','worldPost'].includes(k)) { target=k==='worldPre'?'world_pre':'world_post'; set(target,some(list(x,z=>{assert.equal(z.length,6);return `[${z.map(b=>bits(b)).join(',')}]`;}))); }
    else if (k === 'ikScratch') { assert.deepEqual(x,[]); target='ik_scratch_len'; set(target,'Some(0)'); }
    else if (k === 'immutableCorrelation') { known(x,['callerGenerationU64','candidateGenerationU64'],f+path);target='correlation';set(target,`Some(CorrelationExpected { caller_generation: ${x.callerGenerationU64===undefined?'None':some(uint(x.callerGenerationU64,64))}, candidate_generation: ${x.candidateGenerationU64===undefined?'None':some(uint(x.candidateGenerationU64,64))} })`); }
    else throw Error('UNHANDLED state '+f+path);
    // Nested record converters already ledger their exact leaves consistently.
    if (!['boneOverrides','committedBoneOverrides','boneUpdateOverrides','meshes','meshUpdateFlags'].includes(k)) claim(x,f,path,'asserted-literal','StateExpected.'+target);
    else if (x.length===0) claim(x,f,path,'asserted-literal','StateExpected.'+target);
  }
  fields.push(...[...out].map(([k,x])=>k+': '+x));
  return `StateExpected { ${fields.join(',')}, ..EMPTY_STATE }`;
}
function action(v,f,p) {
  const name=v.operation??v.kind;
  const allowed={ 'construct-initial':['operation','kind','requestGenerationU64'],set_input:['operation','kind','parameterId','valueD64Bits'],update:['operation','kind','deltaD64Bits'],apply_preset:['operation','kind','presetId'],'validate-payload-before-c9':['operation','kind'] };
  assert(allowed[name], 'unknown action '+name); known(v,allowed[name],f+p);
  let result;
  if(name==='construct-initial')result=`ActionExpected::Construct { request_generation: ${v.requestGenerationU64===undefined?'None':some(uint(v.requestGenerationU64,64))} }`;
  else if(name==='set_input')result=`ActionExpected::SetInput { id: ${q(v.parameterId)}, bits: ${bits(v.valueD64Bits)} }`;
  else if(name==='update')result=`ActionExpected::Update { delta_bits: ${bits(v.deltaD64Bits)} }`;
  else if(name==='apply_preset') result=`ActionExpected::ApplyPreset { id: ${q(v.presetId)} }`;
  else result='ActionExpected::NativeValidatePayloadBeforeC9';
  claim(v,f,p,'setup-action-literal','ActionExpected');return result;
}
function program(doc,id,file) { let ps=doc.programs??[],f=file; let p=ps.find(x=>x.id===id);if(!p){const pin=doc.baseExpectedPin;assert(pin);f=pin.path??pin.name;ps=load(f,pin.sha256).programs;p=ps.find(x=>x.id===id);}assert(p);return {value:p,file:f,pointer:'/programs/'+ps.indexOf(p)}; }
function expandTrace(doc,s,file,path) {
  if(s.expectedTrace){const r=s.expectedTrace; const prog=program(doc,r.programRef,file);let rows=prog.value.rows;
    if(r.literalRepeat){const z=r.literalRepeat;rows=rows.slice(...z.prefixRows);for(let i=0;i<z.repetitions;i++)for(const row of prog.value.rows.slice(...z.blockRows)){const next=structuredClone(row);next.owners[z.iterationOwnerIndex]=i;rows.push(next);}rows.push(...prog.value.rows.slice(...z.suffixRows));}
    assert.equal(rows.length,r.checkpointCount);assert.equal(sha(JSON.stringify(rows)),r.expandedCompactJsonSha256);claim(r,file,path+'/expectedTrace','literal-reference-verified','TraceExpected');return rows;
  }
  const t=s.checkpointTrace;assert(t);
  if(Array.isArray(t))return t;
  assert.equal(t.kind,'fixed-literal-trace-base-and-row-replacements');const d=load(t.base.file,doc.baseExpectedPin.sha256);const original=at(d,t.base.pointer);assert.equal(sha(JSON.stringify(original)),t.base.compactSha256);const rows=structuredClone(original);for(const r of t.rowReplacements){assert.deepEqual(rows[r.index],r.before);rows[r.index]=r.after;}assert.equal(rows.length,t.expandedCount);assert.equal(sha(JSON.stringify(rows)),t.expandedCompactSha256);claim(t,file,path+'/checkpointTrace','literal-reference-verified','TraceExpected');return rows;
}
function traceRow(r) {known(r,['checkpoint','opcode','owners','operands','result'],'trace row');return `TraceExpected { checkpoint: ${q(r.checkpoint)}, opcode: ${uint(r.opcode)}, owners: ${decimals(r.owners,64)}, operands: ${words(r.operands)}, result: ${bits(r.result)} }`;}
function failure(v,f,p,privateError) {
  if(v===null){claim(v,f,p,'asserted-absence','FailureExpected');return 'Presence::Absent';}if(v===undefined)return 'Presence::Unspecified';
  const out=[];
  const map={checkpoint:['checkpoint',x=>x===false?'None':some(q(x))],owners:['owners',x=>some(decimals(x,64))],occurrenceZeroBased:['arithmetic_row',x=>some(uint(x))],reason:['reason',x=>some(q(x))],kind:['reason',x=>some(q(x))],classification:['reason',x=>some(q(x))],result:['result_bits',x=>some(bits(x))],meshSlot:['mesh_slot',x=>some(uint(x))],meshIndex:['mesh_slot',x=>some(uint(x))],vertexIndex:['vertex_index',x=>some(uint(x))],axis:['axis',x=>some(uint(x))],projectionOccurrenceZeroBased:['projection_attempt',x=>some(uint(x))],sourceD64Bits:['source_bits',x=>some(bits(x))],valueD64Bits:['source_bits',x=>some(bits(x))],status:['status',x=>some(uint(x))],outerStatus:['status',x=>some(uint(x))],afterPrimitiveRows:['after_primitive_rows',x=>some(uint(x))]};
  for(const[k,x]of Object.entries(v)){if(['phase','notArithmeticCheckpoint','componentIndex','roundedD32Bits'].includes(k)){claim(x,f,p+'/'+k,k==='roundedD32Bits'?'explanatory-projection-intermediate':'failure-location-explanation','FailureExpected / actual projection result');continue;}assert(map[k],'UNHANDLED failure '+f+p+'/'+k);const[target,cv]=map[k];out.push(target+': '+cv(x));claim(x,f,p+'/'+k,'asserted-literal','FailureExpected.'+target);}
  if(privateError&&!v.reason&&!v.kind&&!v.classification)out.push('reason: '+some(q(privateError)));
  return `Presence::Value(FailureExpected { source: ${src(f,p)}, ${out.join(',')}${out.length?',':''} ..EMPTY_FAILURE })`;
}
function projectionResult(v) {
  if(v.resultD32Bits!==undefined)return `ProjectionResultExpected::Ok(${bits(v.resultD32Bits,32)})`;
  if(v.outputD32Bits!==undefined)return `ProjectionResultExpected::Ok(${bits(v.outputD32Bits,32)})`;
  const reason=v.reason??v.classification??v.kind;
  const type=({'finite-binary32-overflow':'NumericOverflow','rejected-finite-binary32-overflow':'NumericOverflow','finite-binary32-underflow':'NumericUnderflow','rejected-overflow':'NumericOverflow','rejected-underflow':'NumericUnderflow',NumericOverflow:'NumericOverflow',NumericUnderflow:'NumericUnderflow',NumericNonFinite:'NumericNonFinite',NumericSubnormal:'NumericSubnormal'})[reason];
  assert(type,'unknown projection error '+reason);return 'ProjectionResultExpected::Err(ProjectionErrorExpected::'+type+')';
}
function projections(s,f,p) {
  const rows=[];const diagnostics=[];
  const add=(v,source)=>{const i=rows.length;rows.push(`ProjectionExpected { source: ${src(f,source)}, mesh_slot: ${uint(v.meshSlot??v.meshIndex)}, vertex_index: ${uint(v.vertexIndex)}, axis: ${uint(v.axis)}, source_bits: ${bits(v.sourceD64Bits??v.inputD64Bits??v.valueD64Bits)}, result: ${projectionResult(v)} }`);for(const key of ['rejectedD32Bits','roundedD32Bits'])if(v[key]!==undefined)diagnostics.push(`ProjectionDiagnostic { source: ${src(f,source+'/'+key)}, attempt: ${uint(i)}, rounded_or_rejected_bits: ${bits(v[key],32)} }`);};
  if(s.projectionTrace||s.category10ProjectionTrace){const key=s.projectionTrace?'projectionTrace':'category10ProjectionTrace';s[key].forEach((v,i)=>{known(v,['meshSlot','vertexIndex','axis','sourceD64Bits','inputD64Bits','classification','resultD32Bits','outputD32Bits','projectionProofIndex','published','rejectedD32Bits','roundedD32Bits','status'],f+p+'/'+key);add(v,p+'/'+key+'/'+i);for(const[k,x]of Object.entries(v))claim(x,f,p+'/'+key+'/'+i+'/'+k,['rejectedD32Bits','roundedD32Bits','projectionProofIndex'].includes(k)?'explanatory-projection-intermediate':'asserted-literal','ProjectionExpected');});if(s[key].length===0)claim([],f,p+'/'+key,'asserted-literal','ProjectionExpected empty');}
  else if(s.projectionBeforeFailure){const v=s.projectionBeforeFailure;known(v,['acceptedD64Bits','acceptedD32Bits','preUpdateCommittedPrefixD32Bits','unreached'],f+p);assert.equal(v.acceptedD64Bits.length,v.acceptedD32Bits.length);v.acceptedD64Bits.forEach((b,i)=>add({meshSlot:s.firstFailure.meshSlot??s.firstFailure.meshIndex,vertexIndex:Math.floor(i/2),axis:i%2,sourceD64Bits:b,resultD32Bits:v.acceptedD32Bits[i]},p+'/projectionBeforeFailure'));add(s.firstFailure,p+'/firstFailure');for(const[k,x]of Object.entries(v))claim(x,f,p+'/projectionBeforeFailure/'+k,k==='unreached'?'redundant-exact-trace-or-projection-absence':'asserted-literal','ProjectionExpected / committed prefix');}
  else if(s.projection){const v=s.projection;known(v,['acceptedD32Prefix','lastPairD32','firstFailure'],f+p+'/projection');const accepted=[...v.acceptedD32Prefix,...(v.lastPairD32??[])];const words=s.skinnedScratchD64Bits;assert(Array.isArray(words));accepted.forEach((b,i)=>add({meshSlot:0,vertexIndex:Math.floor(i/2),axis:i%2,sourceD64Bits:words[i],resultD32Bits:b},p+'/projection'));if(v.firstFailure)add(v.firstFailure,p+'/projection/firstFailure');claim(v.acceptedD32Prefix,f,p+'/projection/acceptedD32Prefix','asserted-literal','ProjectionExpected');claim(v.lastPairD32,f,p+'/projection/lastPairD32','asserted-literal','ProjectionExpected');claim(v.firstFailure,f,p+'/projection/firstFailure','asserted-literal','ProjectionExpected');}
  assert(rows.length<=6);return{rows,diagnostics};
}
const stateDomains={committedState:'Committed',preActionInjectedState:'PreActionInjected',evaluationScratchAfterSuccess:'AfterSuccessScratch',evaluationScratchBeforeCommit:'BeforeCommitScratch',reusableNonSwappedScratchAfterSuccess:'ReusableNonSwappedScratch',retainedSwappedStorageAfterSuccess:'RetainedSwappedStorage',failedEvaluationScratch:'FailedScratch',evaluationScratchAtFailure:'FailedScratch',stagedOnly:'StagedOnly'};
const stepNotes=['semantics','scratch','omitted','traceScope','physicsBranch','rollback','unreached','branch','requiredAbsence','rollbackDiscriminator','rollbackDiscriminators','retrySemantics','topologyIdentity','noConstructorOrCommit','numericEvaluation','physicsPhase'];
function stepLiteral(s,i,c,doc,actionExpr) {
  const selected=at(doc,c.expected.pointer);
  const f=c.expected.file,p=c.expected.pointer+(Array.isArray(selected)?'/'+i:selected.steps?'/steps/'+i:i===0?'/construction':'/afterAction1');
  const states=[],refs=[];const extra={};let absent=false;
  const trace=expandTrace(doc,s,f,p);const tn=`TRACE_${c.index}_${i}`;definitions.push(`pub static ${tn}: &[TraceExpected] = &[${trace.map(traceRow).join(',\n')}];`);if(Array.isArray(s.checkpointTrace))claim(s.checkpointTrace,f,p+'/checkpointTrace','asserted-literal',tn);
  const proj=projections(s,f,p);
  for(const[k,x]of Object.entries(s)){
    const path=p+'/'+k;
    if(stateDomains[k]){if(x===null){assert.equal(k,'committedState');absent=true;claim(x,f,path,'asserted-absence','StepExpected.committed_absent');}else states.push(state(x,f,path,stateDomains[k]));continue;}
    if(stepNotes.includes(k)){claim(x,f,path,k==='topologyIdentity'?'immutable-input-identity-obligation':'redundant-exact-trace-state-or-scope-explanation',k);continue;}
    if(['projectionTrace','category10ProjectionTrace','projectionBeforeFailure','projection'].includes(k))continue;
    if(['checkpointTrace','expectedTrace'].includes(k))continue;
    if(['operation','deltaD64Bits','parameterId','valueD64Bits','actionIndex','programId'].includes(k)){claim(x,f,path,k==='programId'?'literal-reference-verified':'setup-action-literal','ActionExpected / trace');continue;}
    if(['status','dynamicGenerationU64','requestGenerationU64','derivedTokenReturned','derivedTokenProduced','sealedOrDerivedResult','noCommittedSnapshotPublished'].includes(k)){claim(x,f,path,'asserted-literal','StepExpected outcome');continue;}
    if(['firstFailure','privateError'].includes(k))continue;
    if(k==='stateRef'){assert.equal(x,'common');states.push(state(doc.common,f,'/common','CommonImmutable'));claim(x,f,path,'literal-reference-verified','StateExpected common');continue;}
    if(['committedDerivedStateRef','committedStateRef','callerInputRef'].includes(k)){assert.match(x,/^after-action-\d+$/);const n=Number(x.slice(13));assert(n<i);const domain=k==='callerInputRef'?'CallerCurrent':'Committed';refs.push(`StateReference { source: ${src(f,path)}, domain: Domain::${domain}, earlier_step: ${uint(n)} }`);claim(x,f,path,'asserted-domain-reference','StateReference');continue;}
    if(['currentParameterD64Bits','parameterCurrentD64Bits','callerCurrentD64Bits','parameterPreviousD64Bits'].includes(k)){states.push(state({[k]:x},f,p,k==='parameterPreviousD64Bits'?'Committed':'CallerCurrent'));continue;}
    if(['bindingAccumulatorsD64Bits','skinnedScratchD64Bits','skinnedScratchBeforeProjectionD64Bits'].includes(k)){states.push(state({[k]:x},f,p,s.status===0?'AfterSuccessScratch':'FailedScratch'));continue;}
    if(k==='effectiveInfluenceD64Bits'){extra.influence=bits(x);claim(x,f,path,'asserted-literal','ControllerExpected.influence');continue;}
    if(k==='effectiveController'){if(x===null)extra.controller='Presence::Absent';else{const fields={target_x:'None',target_y:'None',pole_x:'None',pole_y:'None',influence:'None',pole_presence:'None'};const map={targetX:'target_x',targetY:'target_y',poleX:'pole_x',poleY:'pole_y',influence:'influence',polePresenceU32:'pole_presence'};for(const[z,b]of Object.entries(x)){assert(map[z]);fields[map[z]]=some(z==='polePresenceU32'?uint(b):bits(b));}extra.controller=`Presence::Value(ControllerExpected { ${Object.entries(fields).map(([z,b])=>z+': '+b).join(',')} })`;}claim(x,f,path,'asserted-literal','ControllerExpected');continue;}
    if(k==='dependencyTraversalStorageSlots'){extra.traversal=some(decimals(x));claim(x,f,path,'asserted-literal','StepExpected.traversal_storage_slots');continue;}
    if(k==='privateHelperResultD64Bits'){extra.helper=some(words(x));claim(x,f,path,'asserted-literal','StepExpected.helper_result');continue;}
    if(k==='accumulatorBeforeBranchSelectionD64Bits'){extra.accumulator=some(bits(x));claim(x,f,path,'asserted-literal','StepExpected.accumulator_before_branch');continue;}
    if(k==='parameterDestinationOrder'||k==='boneDestinationOrder'){extra[k]=some(strings(x));claim(x,f,path,'asserted-literal','StepExpected destination order');continue;}
    if(k==='category10ProjectionPosition'){extra.position=x===null?'Presence::Absent':`Presence::Value(ProjectionPositionExpected { after_checkpoint_count: ${uint(x.afterCheckpointCount)}, before_checkpoint_ordinal: ${uint(x.beforeCheckpointOrdinal)} })`;if(x)known(x,['afterCheckpointCount','beforeCheckpointOrdinal'],f+path);claim(x,f,path,'asserted-literal','StepExpected.projection_position');continue;}
    if(k==='cullingObservation'){extra.culling=x===null?'Presence::Absent':`Presence::Value(CullingExpected { mesh_slot: ${uint(x.meshSlot)}, final_accumulator: ${bits(x.finalAccumulatorD64Bits)} })`;if(x)known(x,['meshSlot','finalAccumulatorD64Bits'],f+path);claim(x,f,path,'asserted-literal','StepExpected.culling');continue;}
    if(k==='reservationDenial'){claim(x,f,path,'native-prerequisite-only','InjectionValue::ReservationDenial');continue;}
    throw Error('UNHANDLED step '+f+path);
  }
  if(extra.influence){assert(!extra.controller);extra.controller=`Presence::Value(ControllerExpected { target_x: None,target_y: None,pole_x: None,pole_y: None,influence: Some(${extra.influence}),pole_presence: None })`;}
  const fail=failure(s.firstFailure,f,p+'/firstFailure',s.privateError);if(s.privateError)claim(s.privateError,f,p+'/privateError','asserted-literal','FailureExpected.reason');
  const token=s.derivedTokenReturned??s.derivedTokenProduced??s.sealedOrDerivedResult;
  return `StepExpected { source: ${src(f,p)}, action_index: ${i}, action: ${actionExpr?some(actionExpr):'None'}, status: ${uint(s.status)}, dynamic_generation: ${nullable(s,'dynamicGenerationU64',x=>uint(x,64))}, request_generation: ${s.requestGenerationU64===undefined?'None':some(uint(s.requestGenerationU64,64))}, derived_token: ${token===undefined?'None':some(bool(token))}, no_committed_snapshot: ${s.noCommittedSnapshotPublished===undefined?'None':some(bool(s.noCommittedSnapshotPublished))}, trace: ${tn}, projections: &[${proj.rows.join(',')}], projection_diagnostics: &[${proj.diagnostics.join(',')}], states: &[${states.join(',\n')}], committed_absent: ${absent}, state_references: &[${refs.join(',')}], controller: ${extra.controller??'Presence::Unspecified'}, first_failure: ${fail}, projection_position: ${extra.position??'Presence::Unspecified'}, culling: ${extra.culling??'Presence::Unspecified'}, helper_result: ${extra.helper??'None'}, traversal_storage_slots: ${extra.traversal??'None'}, accumulator_before_branch: ${extra.accumulator??'None'}, parameter_destination_ids: ${extra.parameterDestinationOrder??'None'}, bone_destination_ids: ${extra.boneDestinationOrder??'None'} }`;
}
const classNames={'public-input-or-raw-api':'PublicInputOrRawApi','typed-or-trusted-injection':'TypedOrTrustedInjection','public-control-required-branch-inapplicable':'PublicControlBranchInapplicable','native-prerequisite-reservation-denial':'NativeReservationDenial','test-only-helper':'TestOnlyHelper','raw-primitive-witness':'RawPrimitiveWitness','allocation-and-callable-closure-reuse':'AllocationReuse','native-prerequisite-only':'NativePrerequisiteOnly'};
function injection(v,f,p){
  const phase=v.when==='after-c9-before-initial-c10'?'InjectionPhase::BeforeInitialC10':v.when==='existing-c9-pre-allocation-denial-seam'?'InjectionPhase::NativeC9Reservation':(()=>{assert.match(v.when,/^after-action-\d+-before-action-\d+$/);const m=v.when.match(/\d+/g).map(Number);assert.equal(m[1],m[0]+1);return `InjectionPhase::BeforeAction(${m[1]})`;})();
  let value;
  if(v.siteTemplateId){known(v,['when','root','siteTemplateId','ownerSlot','attemptOrdinalU32','additionalCountU32'],f+p);value=`InjectionValue::ReservationDenial { site: ${q(v.siteTemplateId)},owner: ${v.ownerSlot===null?'None':some(uint(v.ownerSlot))},ordinal: ${uint(v.attemptOrdinalU32)},additional: ${uint(v.additionalCountU32)} }`;}
  else{known(v,['when','root','field','type','value'],f+p);const simple={dynamic_generation:['DynamicGeneration',x=>uint(x,64)],'inline_ik_controller.influence.bits':['ControllerInfluence',bits],'inline_ik_controller.influence':['ControllerInfluence',bits],'inline_ik_controller.target_y':['ControllerTargetY',bits],'inline_physics_group.committed_accumulator':['PhysicsAccumulator',bits],world_post:['WorldPostLogicalLength',uint]};if(simple[v.field]){const[n,cv]=simple[v.field];value=`InjectionValue::${n}(${cv(v.value)})`;}else{const specs=[[/^parameter_preset_values\[(\d+)\]\.parameter_slot$/,'PresetParameterSlot','value',uint],[/^parameter_preset_values\[(\d+)\]\.value.bits$/,'PresetValue','bits',bits],[/^binding_points\[(\d+)\]\.target.bits$/,'BindingPointTarget','bits',bits],[/^binding_accumulators\[(\d+)\]\.bits$/,'BindingAccumulator','bits',bits],[/^binding_specs\[(\d+)\]\.target_slot$/,'BindingTargetSlot','value',uint],[/^physics_committed_pendulums\[(\d+)\]\.angle$/,'PendulumAngle','bits',bits],[/^physics_committed_pendulums\[(\d+)\]\.velocity$/,'PendulumVelocity','bits',bits],[/^parameter_current\[(\d+)\]$/,'ParameterCurrent','bits',bits],[/^parameter_previous\[(\d+)\]$/,'ParameterPrevious','bits',bits],[/^bone_committed_overrides\[(\d+)\]\.presence_mask$/,'BonePresence','value',uint],[/^bone_committed_overrides\[(\d+)\]\.angle$/,'BoneAngle','bits',bits],[/^bone_committed_overrides\[(\d+)\]\.y$/,'BoneY','bits',bits],[/^skin_weights\[(\d+)\]\.bone_slot$/,'SkinBoneSlot','value',uint],[/^bone_specs\[(\d+)\]\.angle$/,'BoneSpecAngle','bits',bits]];const row=specs.find(([r])=>r.test(v.field));assert(row,'unknown injection '+v.field);const[r,n,key,cv]=row;value=`InjectionValue::${n} { index: ${uint(v.field.match(r)[1])},${key}: ${cv(v.value)} }`;}}
  claim(v,f,p,'setup-injection-literal','InjectionExpected');return `InjectionExpected { source: ${src(f,p)},phase: ${phase},value: ${value} }`;
}
const caseNotes=['scenarioId','variant','inputPayloadSha256','applicability','classification','group','inputClassification','notes','requiredAbsence','applicabilityDisposition','inputSource','inputVariantPointer','inputVariantIndex','baseCase','reuseInputVariant','fieldIds','fieldLineage','requestGenerationU64','sourceStateDynamicGenerationU64','boneDfsOrder','meshDfsOrder','phaseCounts','noNodeAndReachabilityRulings','rawSet','branchSelection','program','scratchExpectation','presetTypedParameterSlotsU32','presetTypedValueD64Bits','expectedBeforeAction1CommittedPhysics'];
for(const c of manifest.cases){
  currentCase=c.index;const doc=load(c.expected.file,c.expected.sha256),value=at(doc,c.expected.pointer),input=at(load(c.input.file,c.input.sha256),c.input.pointer);
  let actionSource={file:c.input.file,pointer:c.input.pointer+'/actions'};let acts=input.actions;
  if(c.input.actions){actionSource=c.input.actions;acts=at(load(actionSource.file),actionSource.pointer);}
  const actionExpr=acts.map((v,i)=>action(v,actionSource.file,actionSource.pointer+'/'+i));
  const injections=(input.injections??[]).map((v,i)=>injection(v,c.input.file,c.input.pointer+'/injections/'+i));
  const ss=Array.isArray(value)?value:value.steps??(value.construction?[value.construction,value.afterAction1]:[]);
  const stepExpr=ss.map((s,i)=>stepLiteral(s,i,c,doc,actionExpr[i]));
  for(const[k,x]of Object.entries(Array.isArray(value)?{}:value)){
    if(['steps','construction','afterAction1'].includes(k))continue;
    if(['actions','injections','typedInjections'].includes(k)){const direct=k==='actions'&&actionSource.file===c.expected.file&&actionSource.pointer===c.expected.pointer+'/actions';claim(x,c.expected.file,c.expected.pointer+'/'+k,direct?'setup-action-literal':'setup-reference-source','pinned selected input actions/injections');continue;}
    if(caseNotes.includes(k)){claim(x,c.expected.file,c.expected.pointer+'/'+k,k==='expectedBeforeAction1CommittedPhysics'?'pre-action-injection-corroboration':'case-provenance-or-redundant-trace-state-explanation','CaseExpected / exact traces / pinned setup');continue;}
    if(c.index>=41&&c.index<=43){const keys=['primitiveRows','expectedSeparateResult','exactOneRoundingControl','derivation','expectedLeftResult','expectedAlternativeResult','existingRawPrimitiveFixture','reuseC10Cases','trapBoundary','expected','closure','numericExpectationsRef','evidencePending'];assert(keys.includes(k),'UNHANDLED F control '+k);claim(x,c.expected.file,c.expected.pointer+'/'+k,'separate-raw-or-allocation-control','F41/F42/F43 + binding2');continue;}
    throw Error('UNHANDLED case '+c.expected.file+c.expected.pointer+'/'+k);
  }
  assert(classNames[c.execution.kind]);
  caseLiterals.push(`CaseExpected { index: ${c.index},scenario: ${q(c.scenarioId)},variant: ${q(c.variant)},class: CaseClass::${classNames[c.execution.kind]},wasm_eligible: ${c.execution.wasmRunCaseEligible},source: ${src(c.expected.file,c.expected.pointer)},input_source: ${src(c.input.file,c.input.pointer)},action_source: ${src(actionSource.file,actionSource.pointer)},actions: &[${actionExpr.join(',')}],injections: &[${injections.join(',')}],steps: &[${stepExpr.join(',\n')}] }`);
}
assert.equal(deferredSeen.size,6);
// Assert every leaf of every selected expected case and used common object has
// a deliberate disposition. A new unhandled field is a build failure.
let expectedLeafVisits=0;
function checkLeaves(v,f,p){if(v&&typeof v==='object'&&Object.keys(v).length)for(const[k,x]of Object.entries(v))checkLeaves(x,f,p+'/'+esc(k));else{expectedLeafVisits++;assert(ledger.has(f+p),'UNHANDLED LEAF '+f+p);}}
for(const c of manifest.cases){const d=load(c.expected.file);checkLeaves(at(d,c.expected.pointer),c.expected.file,c.expected.pointer);if(c.index<18)checkLeaves(d.common,c.expected.file,'/common');}
corpus.verify();
const rust='// GENERATED OFFLINE from immutable independent expectations. No evaluator.\nuse super::literal_types::*;\n'+definitions.join('\n')+'\npub static CASES: &[CaseExpected] = &[\n'+caseLiterals.join(',\n')+'\n];\n';
const outputs=[['native-c10-literal-cases-1.rs',rust],['native-c10-literal-ledger-1.json',JSON.stringify({kind:'c10-literal-source-field-ledger-v1',status:'generated-data-requires-runner-bindings-not-execution-proof',sourcePins:[...pins.values()],caseCount:147,stepCount:definitions.length,priorAuditCorrection:'Index 144 selector is the S8 steps array, not a case object: two additional emitted steps; original selectors and numerical expectations unchanged.',expectedLeafVisits,deferredSelectors:[...deferredSeen],rows:[...ledger.values()],limitations:['No candidate was imported or executed.','Explanation rows are not independent runtime assertions; their exact typed/trace bindings require runner review.','Projection diagnostic bits are explanatory, never inferred from Result::Err.']})+'\n']];
for (const [name, text] of outputs) emit(name, text);

}

