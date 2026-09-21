// Shared fixed-word assertion adapter. No arithmetic expectations are computed.
use crate::expected_types::{ProjectionExpected, ProjectionResultExpected, ProjectionErrorExpected, TraceExpected};
use crate::observation::{Operation, OwnerTuple, ProjectionRecord, TraceRecord};

pub(crate) type Failure = [u32; 8];
pub(crate) type Check = Result<(), Failure>;

pub(crate) struct Context { pub case: u32, pub step: u32 }
impl Context {
    pub fn word(&self, selector:u32, index:usize, expected:u64, actual:u64)->Check {
        if expected == actual { return Ok(()); }
        Err([self.case, self.step, selector, u32::try_from(index).expect("fixed index"),
            expected as u32, (expected>>32) as u32, actual as u32, (actual>>32) as u32])
    }
    pub fn words(&self, selector:u32, expected:&[u64], actual:impl ExactSizeIterator<Item=u64>)->Check {
        self.word(selector, u32::MAX as usize, expected.len() as u64,actual.len() as u64)?;
        for (i,(e,a)) in expected.iter().copied().zip(actual).enumerate(){self.word(selector,i,e,a)?;}
        Ok(())
    }
}

fn operation(operation: Operation) -> (u32,[u64;2],usize) {
    match operation {
        Operation::Add(a,b)=>(1,[a,b],2), Operation::Sub(a,b)=>(2,[a,b],2),
        Operation::Mul(a,b)=>(3,[a,b],2), Operation::Div(a,b)=>(4,[a,b],2),
        Operation::CFmod(a,b)=>(5,[a,b],2), Operation::Sin(a)=>(8,[a,0],1),
        Operation::Cos(a)=>(9,[a,0],1), Operation::Atan2(y,x)=>(10,[y,x],2),
        Operation::Acos(a)=>(11,[a,0],1), Operation::Sqrt(a)=>(12,[a,0],1),
    }
}

pub(crate) fn owners(owners:OwnerTuple)->([u64;4],usize){
    use OwnerTuple::*;
    match owners {
        Target(a)|PhysicsGroup(a)|Controller(a)=>([a,0,0,0],1),
        BindingPoint([a,b])|BindingTarget([a,b])|PhysicsInput([a,b])|
        PhysicsSubstep([a,b])|PhysicsOutput([a,b])|PhysicsDestination([a,b])|
        WorldBone([a,b])|ControllerChain([a,b])|ControllerIteration([a,b])|
        MeshVertex([a,b])|MeshEdge([a,b])=>([a,b,0,0],2),
        PhysicsInputAxis([a,b,c])|PhysicsPendulum([a,b,c])|WorldCell([a,b,c])|
        ControllerSweep([a,b,c])|SkinWeight([a,b,c])=>([a,b,c,0],3),
        ControllerEnd(values)|ControllerPosition(values)|SkinCell(values)=>(values,4),
    }
}

pub(crate) fn trace(context:&Context, expected:&[TraceExpected],actual:&[TraceRecord])->Check{
    context.word(1,0,expected.len() as u64,actual.len() as u64)?;
    for (row,(expected,actual)) in expected.iter().zip(actual).enumerate(){
        // Checkpoint strings are names, not numerical hashes or a new registry.
        if expected.checkpoint != actual.checkpoint{return context.word(2,row,1,0);}
        let (op,operands,count)=operation(actual.operation);
        context.word(3,row,expected.opcode as u64,op as u64)?;
        context.word(4,row,expected.operands.len() as u64,count as u64)?;
        for (i,(e,a)) in expected.operands.iter().zip(&operands[..count]).enumerate(){context.word(5,row*2+i,*e,*a)?;}
        context.word(6,row,expected.result,actual.result)?;
        let (values,count)=owners(actual.owners);
        context.word(7,row,expected.owners.len() as u64,count as u64)?;
        for(i,(e,a))in expected.owners.iter().zip(&values[..count]).enumerate(){context.word(8,row*4+i,*e,*a)?;}
    }
    Ok(())
}

pub(crate) fn projections(context:&Context,expected:&[ProjectionExpected],actual:&[ProjectionRecord])->Check{
    context.word(10,0,expected.len() as u64,actual.len() as u64)?;
    for(i,(e,a))in expected.iter().zip(actual).enumerate(){
        context.word(11,i,e.mesh_slot as u64,a.mesh_slot as u64)?;
        context.word(12,i,e.vertex_index as u64,a.vertex_index as u64)?;
        context.word(13,i,e.axis as u64,a.axis as u64)?;
        context.word(14,i,e.source_bits,a.source)?;
        match (e.result,a.result){
            (ProjectionResultExpected::Ok(e),Ok(a))=>context.word(15,i,e as u64,a as u64)?,
            (ProjectionResultExpected::Err(e),Err(a))=>{
                let e=match e {ProjectionErrorExpected::NumericNonFinite=>1,ProjectionErrorExpected::NumericOverflow=>2,ProjectionErrorExpected::NumericUnderflow=>3,ProjectionErrorExpected::NumericSubnormal=>4};
                let a=match a {crate::EvaluationLoweringErrorKind::NumericNonFinite=>1,crate::EvaluationLoweringErrorKind::NumericOverflow=>2,crate::EvaluationLoweringErrorKind::NumericUnderflow=>3,crate::EvaluationLoweringErrorKind::NumericSubnormal=>4,_=>u64::MAX};
                context.word(16,i,e,a)?;
            },
            (ProjectionResultExpected::Ok(_),Err(_))=>context.word(17,i,0,1)?,
            (ProjectionResultExpected::Err(_),Ok(_))=>context.word(17,i,1,0)?,
        }
    }
    Ok(())
}

pub(crate) fn primitive(op:u32,a:u64,b:u64)->u64{
    use vivi_runtime_native_evaluation_math::raw::{D64 as DetF64,Class as DetF64Class};
    let a=DetF64::from_bits(a);let b=DetF64::from_bits(b);
    match op {
        0=>a.to_bits(),1=>a.add(b).to_bits(),2=>a.sub(b).to_bits(),3=>a.mul(b).to_bits(),4=>a.div(b).to_bits(),5=>a.c_fmod(b).to_bits(),
        6=>a.neg().to_bits(),7=>a.abs().to_bits(),8=>a.sin().to_bits(),9=>a.cos().to_bits(),10=>a.atan2(b).to_bits(),11=>a.acos().to_bits(),12=>a.sqrt().to_bits(),
        13=>u64::from(a.eq(b)),14=>u64::from(a.lt(b)),15=>u64::from(a.le(b)),16=>u64::from(a.gt(b)),17=>u64::from(a.ge(b)),
        18=>match a.classify(){DetF64Class::Zero=>0,DetF64Class::Subnormal=>1,DetF64Class::Normal=>2,DetF64Class::Infinite=>3,DetF64Class::Nan=>4},
        19=>u64::from(a.is_finite()),_=>panic!("invalid fixed primitive opcode"),
    }
}
