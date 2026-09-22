// Fixed-family data-only generator; no primitive or candidate is evaluated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function generateProjectionScope(corpus, emit) {
const manifestFile='native-c10-case-index-manifest-1.json';
const manifest=corpus.load(manifestFile,'3af093cec5c2b43bd8e711a3f4a40b3d496030c15f14870612db281404190ac1');
const manifestPin=corpus.pins.get(manifestFile),sources=new Map(),rows=[],table=[];
const at=(o,p)=>p.split('/').slice(1).reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],o);
for(const c of manifest.cases){
  if(!sources.has(c.expected.file)){const p=corpus.pins.get(c.expected.file);const data=corpus.load(c.expected.file,c.expected.sha256);sources.set(c.expected.file,{bytes:p.bytes,sha256:p.sha256,data});}
  const value=at(sources.get(c.expected.file).data,c.expected.pointer);
  const steps=Array.isArray(value)?value:value.steps??(value.construction?[value.construction,value.afterAction1]:[]);
  const flags=[];
  for(const [step,s]of steps.entries()){
    const pointer=c.expected.pointer+(Array.isArray(value)?'/'+step:value.steps?'/steps/'+step:step===0?'/construction':'/afterAction1');
    const fields=['projectionTrace','category10ProjectionTrace','projectionBeforeFailure','projection'].filter(k=>Object.hasOwn(s,k));
    assert(fields.length<=1);
    for(const field of fields){if(field.endsWith('Trace'))assert(Array.isArray(s[field]));else assert(s[field]&&typeof s[field]==='object');}
    const explicitEmpty=fields.length===1&&Array.isArray(s[fields[0]])&&s[fields[0]].length===0;
    flags.push(fields.length!==0);
    rows.push({caseIndex:c.index,step,file:c.expected.file,pointer,fields,applicability:fields.length?(explicitEmpty?'declared-empty':'declared-complete-or-prefix-plus-failure'):'unspecified-no-projection-row-claim'});
  }
  table.push(`&[${flags.join(',')}]`);
}
assert.equal(table.length,147);assert.equal(rows.length,290);
const rust='// Only projection field presence, from frozen author records. No numerical oracle.\n'+
 'pub(crate) static DECLARED: &[&[bool]] = &[\n'+table.map((row,i)=>`    ${row}, // case ${i}`).join('\n')+'\n];\n'+
 'pub(crate) fn declared(case_index:u32,step_index:u32)->bool { DECLARED[case_index as usize][step_index as usize] }\n';
const report={kind:'c10-projection-declaration-recovery-v1',manifest:{file:manifestFile,bytes:manifestPin.bytes,sha256:manifestPin.sha256},sourcePins:[...sources].map(([file,{bytes,sha256}])=>({file,bytes,sha256})),counts:{cases:147,steps:290,declared:rows.filter(r=>r.fields.length).length,explicitEmpty:rows.filter(r=>r.applicability==='declared-empty').length,unspecified:rows.filter(r=>!r.fields.length).length},rows,rule:'Declared projection rows, including explicit empty arrays, must be fully compared. Unspecified is not zero and never licenses candidate-derived expected rows. Other fixed state/arithmetic/prefix expectations remain mandatory.'};
corpus.verify();
for(const[name,text]of [['projection_scope.rs',rust],['native-c10-literal-projection-scope-ledger-1.json',JSON.stringify(report)+'\n']]){emit(name, text);}


}

