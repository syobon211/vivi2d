// Input-only fixed payload resolution, copied from the reviewed C9 setup exporter.
// Numeric leaves are re-encoded to check identity; no arithmetic or C10 evaluation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const compact=value=>JSON.stringify(value);
const clone=value=>JSON.parse(compact(value));
const PREREQUISITE_REJECTIONS=[91,92,93,94,95];
const NONCOMPOUND_BASES=[39,41,42,43];
const TRANSPORT_ONLY_GENERATION=[140,141,142,143,144];
export function generateInputs(corpus, emit){
function pointer(root,p) {
  assert(p==='' || p.startsWith('/'),'JSON pointer');
  return p===''?root:p.slice(1).split('/').reduce((v,k)=>{
    k=k.replace(/~1/g,'/').replace(/~0/g,'~');
    assert(v!==null && typeof v==='object' && Object.hasOwn(v,k),`pointer ${p}`);
    return v[k];
  },root);
}
function numericMap(root) {
  const out={};
  function walk(v,p) {
    if(typeof v==='number') {
      assert(Number.isFinite(v),'public JSON finite leaf');
      const b=Buffer.alloc(8);b.writeDoubleBE(v);out[p]=b.toString('hex');
    } else if(v!==null && typeof v==='object') {
      for(const [k,x] of Object.entries(v)) walk(x,`${p}/${k.replace(/~/g,'~0').replace(/\//g,'~1')}`);
    }
  }
  walk(root,'');return out;
}
function validateTransport(correlation,index) {
  if(!correlation) {
    assert(TRANSPORT_ONLY_GENERATION.includes(index),'unexpected missing correlation');
    return {callerGenerationU64:'5',candidateGenerationU64:'5',
      provenance:'explicit exporter transport convention from pinned admission harness; not a payload field'};
  }
  assert.equal(correlation.callerGenerationU64,'5');
  assert.equal(correlation.candidateGenerationU64,'5');
  assert.equal(correlation.texturePlan.schema,'vivi2d.evaluationTexturePlan.v1');
  for(const t of correlation.texturePlan.textures) {
    assert.equal(t.asset.object_address_hex,'07'.repeat(32));
    assert.equal(t.asset.content_sha256_hex,'07'.repeat(32));
    assert.equal(t.asset.storage_kind,'Blob');
    assert.equal(t.asset.media_type,'image/png');assert.equal(t.asset.size_bytes_u64,'0');
    assert.equal(t.media_type,'image/png');assert.equal(t.color_space,'srgb');assert.equal(t.alpha_mode,'straight');
  }
  return {callerGenerationU64:'5',candidateGenerationU64:'5',
    provenance:'source variant/shared-setup correlation; texture dimensions/IDs crosschecked against parsed bindings'};
}
function prepareCases(manifest) {
  const cache=new Map(),pins=[];
  const cases=manifest.cases.map((c,index)=>{
    assert.equal(c.index,index);
    const pin=corpus.pins.get(c.input.file);
    assert(pin,'input source pin');assert.equal(pin.sha256,c.input.sha256);
    let source=cache.get(pin.name);
    if(!source){source=corpus.load(pin.name,pin.sha256);cache.set(pin.name,source);pins.push(pin);}
    const v=pointer(source,c.input.pointer);
    let setup,payload,map,payloadHash;
    if(v.payload) {
      payload=clone(v.payload);map=v.payloadNumericD64Bits;payloadHash=v.payloadCompactJsonSha256;
    } else {
      setup=source.sharedSetups?.find(s=>s.id===v.setup);assert(setup,'shared setup');
      payload=Object.assign(clone(setup.payload),clone(v.payloadTopLevelReplacements));
      map=v.resolvedPayloadNumericBits;payloadHash=v.resolvedPayloadCompactJsonSha256;
    }
    const payloadUtf8=compact(payload);
    assert.equal(hash(payloadUtf8),payloadHash,`payload hash case ${index}`);
    if(v.payloadCompactUtf8Bytes!==undefined) assert.equal(Buffer.byteLength(payloadUtf8),v.payloadCompactUtf8Bytes);
    if(v.resolvedPayload!==undefined) assert.deepEqual(payload,v.resolvedPayload);
    if(v.resolvedPayloadCompactJson!==undefined) assert.equal(payloadUtf8,v.resolvedPayloadCompactJson);
    assert.deepEqual(numericMap(payload),map,`complete numeric leaf map case ${index}`);
    const correlation=v.correlation??setup?.correlation??source.correlation;
    const transport=validateTransport(correlation,index);
    return {index,scenarioId:c.scenarioId,variant:c.variant,execution:c.execution,
      input:c.input,expectedReferenceOnly:c.expected,classification:c.classification,
      payloadUtf8,payloadCompactJsonSha256:payloadHash,numericBits:map,
      ...transport,declaredTexturePlan:correlation?.texturePlan??null,
      actionsReferenceOnly:v.actions,injectionsNotApplied:v.injections??[],
      setupRole:index===35?'not-materialized-reservation-denial':
        PREREQUISITE_REJECTIONS.includes(index)?'required-prerequisite-rejection':
        NONCOMPOUND_BASES.includes(index)?'base-only-not-standalone-C10-case':
        'unmutated-C9-prerequisite-for-later-case',
      c10Invoked:false,topologyIdentity:'not-applicable-C10-only',c11Generation:'not-applicable-C10-only'};
  });
  assert.equal(cases.length,147);assert.equal(cache.size,15);
  return {cases,pins};
}

const manifest=corpus.load('native-c10-case-index-manifest-1.json','3af093cec5c2b43bd8e711a3f4a40b3d496030c15f14870612db281404190ac1');
const prepared=prepareCases(manifest);
const text=compact(prepared.cases)+'\n';
assert.equal(Buffer.byteLength(text),917486);
assert.equal(hash(text),'e5a5876f0c5f70e4244df8ff7724dfa5763d163868d0cd508288c426a8217d94');
corpus.verify();
emit('resolved-case-inputs.json',text);
return prepared.cases;
}

