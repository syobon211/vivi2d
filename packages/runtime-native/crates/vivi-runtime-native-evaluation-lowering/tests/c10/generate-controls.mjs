// Fixed-family data-only generator; no primitive or candidate is evaluated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function generateControls(corpus, emit) {
const pins=[];
const load=(name,expected)=>{const value=corpus.load(name,expected);pins.push(corpus.pins.get(name));return value;};
const binding=load('native-c10-freeze-assertion-binding-2.json','0bac949d56bc041899ce7bdbdd5a6949cc94171fbc8855c7e7f9aa3ab369ed0e');
const manifest=load('native-c10-case-index-manifest-1.json','3af093cec5c2b43bd8e711a3f4a40b3d496030c15f14870612db281404190ac1');
const f=load('native-c10-f-expectations-1.json',manifest.cases[41].expected.sha256);
const edges=load('raw-transcendental-edge-matrix-1-expectations.json','6c1122d2e1aa27299e96ed71adc4825a2069dfee16a2b941c21d0d897ebcf88c');
const edgeInputs=load('raw-transcendental-edge-matrix-1-inputs.json','bb7cfca12a27fdad8fe7339e0c0cf0e17be29c155b77f697ae39f75d9b40e25e');
const ops={from_bits_to_bits:0,add:1,sub:2,mul:3,div:4,c_fmod:5,neg:6,abs:7,sin:8,cos:9,atan2:10,acos:11,sqrt:12,eq:13,lt:14,le:15,gt:16,ge:17,classify:18,is_finite:19};
const classes={zero:0,subnormal:1,normal:2,infinite:3,nan:4};
const q=JSON.stringify;
const word=s=>{assert.match(s,/^[0-9a-f]{16}$/);return '0x'+s+'u64';};
const ptr=(file,pointer)=>`SourceRef { file: ${q(file)},pointer: ${q(pointer)} }`;
const rows=[];const ledger=[];
function raw(row,source,opcode,result){assert(Number.isInteger(opcode)&&opcode>=0&&opcode<20);assert(row.inputBits.length>=1&&row.inputBits.length<=2);return `RawPrimitiveExpected { source: ${ptr(source.file,source.pointer)},opcode: ${opcode},operands: &[${row.inputBits.map(word).join(',')}],result: ${result} }`;}
const rawBase=[];
for(const collection of binding.allocationReuse.rawCollections){assert.equal(collection.rows.length,collection.count);for(const [i,row]of collection.rows.entries()){assert.equal(row.pointer,collection.pointer+'/'+i);assert(Object.hasOwn(ops,row.op));const keys=['pointer','id','op','inputBits','expectedBits','expectedBoolean','expectedClass'];for(const k of Object.keys(row))assert(keys.includes(k));const results=['expectedBits','expectedBoolean','expectedClass'].filter(k=>Object.hasOwn(row,k));assert.equal(results.length,1);let result;if(results[0]==='expectedBits')result=word(row.expectedBits);else if(results[0]==='expectedBoolean'){assert.equal(typeof row.expectedBoolean,'boolean');result=row.expectedBoolean?'1u64':'0u64';}else{assert(Object.hasOwn(classes,row.expectedClass));result=classes[row.expectedClass]+'u64';}rawBase.push(raw(row,{file:collection.file,pointer:row.pointer},ops[row.op],result));ledger.push({table:'RAW_BASE',index:rawBase.length-1,source:{file:collection.file,pointer:row.pointer,sha256:collection.sha256},bindingPointer:'/allocationReuse/rawCollections/'+binding.allocationReuse.rawCollections.indexOf(collection)+'/rows/'+i,encoding:results[0]});}}
assert.equal(rawBase.length,108);
const rawEdges=edges.rows.map((r,i)=>{assert.equal(r.id,edgeInputs.rows[i].id);assert.deepEqual(r.inputBits,edgeInputs.rows[i].inputBits);assert.equal(r.opcode,ops[r.op]);assert.equal(r.opcode,edgeInputs.rows[i].opcode);ledger.push({table:'RAW_EDGES',index:i,source:{file:'raw-transcendental-edge-matrix-1-expectations.json',pointer:'/rows/'+i},input:{file:'raw-transcendental-edge-matrix-1-inputs.json',pointer:'/rows/'+i},encoding:'expectedBits'});return raw(r,{file:'raw-transcendental-edge-matrix-1-expectations.json',pointer:'/rows/'+i},r.opcode,word(r.expectedBits));});
assert.equal(rawEdges.length,460);
const controls=f.cases.slice(0,2).map((c,ci)=>c.primitiveRows.map((r,ri)=>{assert.deepEqual(Object.keys(r),['name','opcode','operands','result']);ledger.push({table:ci===0?'F41_RAW':'F42_RAW',index:ri,source:{file:'native-c10-f-expectations-1.json',pointer:'/cases/'+ci+'/primitiveRows/'+ri},encoding:'result'});return raw({inputBits:r.operands},{file:'native-c10-f-expectations-1.json',pointer:'/cases/'+ci+'/primitiveRows/'+ri},r.opcode,word(r.result));}));
const reused=binding.allocationReuse.reusedCases.map(r=>{const c=manifest.cases[r.index];assert.equal(c.scenarioId,r.scenarioId);assert.equal(c.variant,r.variant);assert.deepEqual(c.input,r.input);assert.deepEqual(c.expected,r.expected);return r.index;});
assert.deepEqual(reused,[19,33,34,54,58,71,111,130]);
assert.equal(f.cases[0].expectedSeparateResult,f.cases[0].primitiveRows[1].result);
assert.equal(f.cases[1].expectedLeftResult,f.cases[1].primitiveRows[1].result);
assert.equal(f.cases[1].expectedAlternativeResult,f.cases[1].primitiveRows[3].result);
let rust='// GENERATED DATA ONLY. No primitive or candidate executed by this builder.\nuse super::literal_types::*;\n';
for(const[name,list]of [['RAW_BASE',rawBase],['RAW_EDGES',rawEdges],['F41_RAW',controls[0]],['F42_RAW',controls[1]]])rust+=`pub static ${name}: &[RawPrimitiveExpected] = &[\n${list.join(',\n')}\n];\n`;
rust+=`pub static F43_REUSED_CASE_INDICES: &[u32] = &[${reused.join(',')}];\n`;
rust+=`pub const F41_SEPARATE_RESULT: u64 = ${word(f.cases[0].expectedSeparateResult)};\n`;
rust+=`pub const F41_SINGLE_ROUNDING_COUNTERFACTUAL_NOT_EXECUTED: u64 = ${word(f.cases[0].exactOneRoundingControl)};\n`;
rust+=`pub const F42_LEFT_RESULT: u64 = ${word(f.cases[1].expectedLeftResult)};\npub const F42_ALTERNATIVE_PRIMITIVE_CONTROL_RESULT: u64 = ${word(f.cases[1].expectedAlternativeResult)};\n`;
const report={kind:'fixed-c10-raw-and-allocation-control-literals-v1',sourcePins:pins,counts:{existingRaw:108,expandedEdgeRaw:460,antiFmaRaw:2,reassociationRaw:4,allocationReusedCases:8},mapping:ops,classTags:classes,ledger,limits:['All numerical results copied from immutable independent tables.','Boolean/class tags copied from unchanged raw test adapter contract, not recalculated from operands.','F41 single-rounding counterfactual is retained separately and must not invoke a nonexistent FMA.','F43 allocation/growth/import/observer-drop checks require actual harness execution; this file is not proof of any of them.','No candidate, raw kernel, wasm, or numerical implementation executed.']};
corpus.verify();
for(const[name,text]of [['native-c10-literal-controls-1.rs',rust],['native-c10-literal-controls-ledger-1.json',JSON.stringify(report)+'\n']]){emit(name, text);}

}

