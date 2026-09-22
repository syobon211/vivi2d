// Primitive evidence against previously frozen literals, never a C10 oracle.
use crate::{compare::{self, Context, Check}, literal_controls as fixed};

pub(crate) fn run()->Check {
    for (group, rows) in [fixed::RAW_BASE,fixed::RAW_EDGES,fixed::F41_RAW,fixed::F42_RAW].into_iter().enumerate(){
        for (index,row) in rows.iter().enumerate(){
            let context=Context{case:0xffff_ff00+group as u32,step:index as u32};
            context.word(60,0,row.result,compare::primitive(row.opcode,row.operands[0],row.operands.get(1).copied().unwrap_or(0)))?;
        }
    }
    let context=Context{case:0xffff_ff04,step:0};
    let product=compare::primitive(3,0x3ff0000002000000,0x3feffffffc000000);
    context.word(61,0,fixed::F41_SEPARATE_RESULT,compare::primitive(1,product,0xbff0000000000000))?;
    let left=compare::primitive(1,compare::primitive(1,0x4340000000000000,0x3ff0000000000000),0xc340000000000000);
    let alternative=compare::primitive(1,0x4340000000000000,compare::primitive(1,0x3ff0000000000000,0xc340000000000000));
    context.word(62,0,fixed::F42_LEFT_RESULT,left)?;
    context.word(63,0,fixed::F42_ALTERNATIVE_PRIMITIVE_CONTROL_RESULT,alternative)?;
    Ok(())
}

#[test]
fn frozen_primitive_rows_and_order_controls(){
    assert_eq!(fixed::RAW_BASE.len(),108);
    assert_eq!(fixed::RAW_EDGES.len(),460);
    run().unwrap();
}

#[test]
fn diagnostic_rejects_a_changed_expected_word(){
    let row=&fixed::RAW_BASE[0];
    let actual=compare::primitive(row.opcode,row.operands[0],row.operands[1]);
    assert_eq!(Context{case:77,step:3}.word(60,0,row.result^1,actual),Err([77,3,60,0,1,0x40080000,0,0x40080000]));
}
