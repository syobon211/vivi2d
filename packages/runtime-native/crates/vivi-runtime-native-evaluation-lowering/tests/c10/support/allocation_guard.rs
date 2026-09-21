// Test-only allocator observation. Thread-local, fixed-capacity, no allocation
// or failure formatting inside GlobalAlloc. Unlike a denial test this records
// every unexpected call and reports only after the operation has disarmed.
use std::alloc::{GlobalAlloc,Layout,System};
use std::cell::Cell;

#[derive(Clone,Copy)]
pub(crate) struct Record { pub count:usize,pub sizes:[usize;39],pub aligns:[usize;39],pub pages_before:usize,pub pages_after:usize }
impl Record{const EMPTY:Self=Self{count:0,sizes:[0;39],aligns:[0;39],pages_before:0,pages_after:0};}
std::thread_local!{
    static ARMED:Cell<bool>=const{Cell::new(false)};
    static RECORD:Cell<Record>=const{Cell::new(Record::EMPTY)};
}
fn note(layout:Layout,new_size:usize){
    if ARMED.try_with(Cell::get).unwrap_or(false){
        let _=RECORD.try_with(|slot|{
            let mut r=slot.get();
            if r.count<39{r.sizes[r.count]=new_size;r.aligns[r.count]=layout.align();}
            r.count=r.count.saturating_add(1);slot.set(r);
        });
    }
}
struct Allocator;
#[global_allocator] static ALLOCATOR:Allocator=Allocator;
unsafe impl GlobalAlloc for Allocator{
    unsafe fn alloc(&self,l:Layout)->*mut u8{note(l,l.size());unsafe{System.alloc(l)}}
    unsafe fn alloc_zeroed(&self,l:Layout)->*mut u8{note(l,l.size());unsafe{System.alloc_zeroed(l)}}
    unsafe fn realloc(&self,p:*mut u8,l:Layout,n:usize)->*mut u8{note(l,n);unsafe{System.realloc(p,l,n)}}
    unsafe fn dealloc(&self,p:*mut u8,l:Layout){unsafe{System.dealloc(p,l)}}
}
fn pages()->usize{
    #[cfg(target_arch="wasm32")]{core::arch::wasm32::memory_size::<0>()}
    #[cfg(not(target_arch="wasm32"))]{0}
}
pub(crate) struct Guard;
impl Guard{
    pub fn arm()->Self{
        assert!(!ARMED.with(Cell::get),"nested allocation observation");
        RECORD.with(|r|r.set(Record{pages_before:pages(),..Record::EMPTY}));
        ARMED.with(|a|a.set(true));Self
    }
    pub fn finish(self)->Record{
        ARMED.with(|a|a.set(false));
        let mut record=RECORD.with(Cell::get);record.pages_after=pages();record
    }
}
impl Drop for Guard{fn drop(&mut self){ARMED.with(|a|a.set(false));}}

#[test]
fn catches_real_allocation_outside_evaluator(){
    let guard=Guard::arm();
    let value=std::hint::black_box(Box::new(42_u64));
    let result=guard.finish();
    assert_eq!(result.count,1);assert_eq!(result.sizes[0],8);
    assert_eq!(result.aligns[0],std::mem::align_of::<u64>());drop(value);
}
