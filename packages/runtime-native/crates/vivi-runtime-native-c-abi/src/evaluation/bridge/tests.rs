use super::*;
use std::alloc::{GlobalAlloc, System};
use std::cell::Cell;

struct CountAlloc;
thread_local! { static ALLOCATIONS:Cell<Option<usize>>=const { Cell::new(None) }; }
unsafe impl GlobalAlloc for CountAlloc {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        ALLOCATIONS.with(|n| {
            if let Some(v) = n.get() {
                n.set(Some(v + 1));
            }
        });
        unsafe { System.alloc(l) }
    }
    unsafe fn alloc_zeroed(&self, l: Layout) -> *mut u8 {
        ALLOCATIONS.with(|n| {
            if let Some(v) = n.get() {
                n.set(Some(v + 1));
            }
        });
        unsafe { System.alloc_zeroed(l) }
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        ALLOCATIONS.with(|c| {
            if let Some(v) = c.get() {
                c.set(Some(v + 1));
            }
        });
        unsafe { System.realloc(p, l, n) }
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        unsafe { System.dealloc(p, l) }
    }
}
#[global_allocator]
static ALLOCATOR: CountAlloc = CountAlloc;

const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99, 0, 0, 1, 149,
    0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];
const HASH: &str = "76f430c66cac7eb823fa3a8ca44209c9584693dfbcc15d9b1d5ea30daa4dd3d2";
struct Fixture {
    payload: Vec<u8>,
    texture: [u8; 112],
    object: [u8; 56],
}
fn write<T: Copy>(a: &mut [u8], offset: usize, value: T) {
    assert!(offset + size_of::<T>() <= a.len());
    unsafe { ptr::write_unaligned(a.as_mut_ptr().add(offset).cast(), value) };
}
fn get<T: Copy>(a: &[u8], offset: usize) -> T {
    assert!(offset + size_of::<T>() <= a.len());
    unsafe { ptr::read_unaligned(a.as_ptr().add(offset).cast()) }
}
impl Fixture {
    fn new() -> Self {
        let mesh = serde_json::json!({"id":"mesh","name":"mesh","kind":"viviMesh","visible":true,"opacity":1,"x":0,"y":0,"width":1,"height":1,"blendMode":"normal","expanded":true,"children":[],"mesh":{"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}});
        let payload=serde_json::to_vec(&serde_json::json!({"schema":"vivi2d.evaluationPayload.v1","canvas":{"width":32,"height":32},"layers":[mesh],"parameters":[{"id":"p","name":"p","minValue":0,"maxValue":1,"defaultValue":0}],"parameterBindings":[],"skins":{},"ikControllers":[],"physicsGroups":[],"colliders":[],"expressionPresets":[{"id":"zero","name":"zero","values":{"p":0}}],"clips":[],"stateMachines":[],"atlases":[{"id":"a","width":1,"height":1,"entries":[{"layerId":"mesh","x":0,"y":0,"width":1,"height":1}]}]})).unwrap();
        let mut texture = [0; 112];
        write(&mut texture, 0, 112_u32);
        write(&mut texture, 4, 1_u32);
        write(&mut texture, 8, 1_u32);
        write(&mut texture, 12, 1_u32);
        write(&mut texture, 16, b"atlas:a".as_ptr() as usize);
        write(&mut texture, 24, 7_u64);
        write(&mut texture, 32, PNG.len() as u64);
        let digest = Digest::from_hex(HASH).unwrap();
        texture[40..72].copy_from_slice(digest.as_bytes());
        texture[72..104].copy_from_slice(digest.as_bytes());
        let mut object = [0; 56];
        write(&mut object, 0, 56_u32);
        object[8..40].copy_from_slice(digest.as_bytes());
        write(&mut object, 40, PNG.as_ptr() as usize);
        write(&mut object, 48, PNG.len() as u64);
        Self {
            payload,
            texture,
            object,
        }
    }
    fn load(&self, generation: u64, present: bool) -> [u8; 64] {
        let mut d = [0; 64];
        write(&mut d, 0, 64_u32);
        write(&mut d, 8, generation);
        write(&mut d, 16, self.payload.as_ptr() as usize);
        write(&mut d, 24, self.payload.len() as u64);
        write(&mut d, 32, self.texture.as_ptr() as usize);
        write(&mut d, 40, 1_u64);
        if present {
            write(&mut d, 48, self.object.as_ptr() as usize);
            write(&mut d, 56, 1_u64);
        }
        d
    }
}
unsafe fn owner() -> *mut Runtime {
    let mut h = 0usize;
    unsafe { create((&mut h as *mut usize) as usize).unwrap() };
    h as *mut Runtime
}
unsafe fn observe_one(p: *mut Runtime, generation: u64) {
    let mut d = [0; 24];
    write(&mut d, 0, 24_u32);
    write(&mut d, 8, generation);
    unsafe { observe(p, d.as_ptr() as usize).unwrap() };
}
unsafe fn prepare_one(
    p: *mut Runtime,
    f: &Fixture,
    g: u64,
    present: bool,
) -> (*mut Prepared, [u32; 4]) {
    let d = f.load(g, present);
    let mut h = 0usize;
    let mut info = [16, 0, 0, 0];
    unsafe {
        prepare(
            p,
            d.as_ptr() as usize,
            (&mut h as *mut usize) as usize,
            info.as_mut_ptr() as usize,
        )
        .unwrap()
    };
    (h as *mut Prepared, info)
}

#[test]
fn actual_missing_retry_copy_out_commit_and_mutation_use_one_seal() {
    unsafe {
        let f = Fixture::new();
        let p = owner();
        observe_one(p, 1);
        let (mut h, info) = prepare_one(p, &f, 1, false);
        assert_eq!(info, [16, 2, 1, 0]);
        let identity = prepared(h).unwrap().value.as_ref().unwrap();
        let seal: *const SealedEvaluationCandidateV1 = match identity {
            PrepareLoweredEvaluationV1::Missing(v) => v.candidate() as *const _,
            _ => panic!(),
        };
        let mut info = [16, 0, 0, 0];
        retry(
            p,
            (&mut h as *mut *mut Prepared) as usize,
            f.object.as_ptr() as usize,
            1,
            info.as_mut_ptr() as usize,
        )
        .unwrap();
        assert_eq!(info, [16, 1, 0, 0]);
        // The move changes struct location; generation/topology/dynamic remain the same seal, not an update.
        assert!(!seal.is_null());
        assert_eq!(view(h as usize, true).unwrap().0.dynamic_generation(), 0);
        let mut pixels = [0_u8; 4];
        let mut id = [0_u8; 7];
        let mut buffers = [0_u8; 40];
        write(&mut buffers, 0, 40_u32);
        write(&mut buffers, 8, id.as_mut_ptr() as usize);
        write(&mut buffers, 16, 7_u64);
        write(&mut buffers, 24, pixels.as_mut_ptr() as usize);
        write(&mut buffers, 32, 4_u64);
        let mut metadata = [0_u8; 48];
        write(&mut metadata, 0, 48_u32);
        texture(
            h as usize,
            true,
            0,
            buffers.as_ptr() as usize,
            metadata.as_mut_ptr() as usize,
        )
        .unwrap();
        assert_eq!(pixels, [0x12, 0x34, 0x56, 0]);
        assert_eq!(&id, b"atlas:a");
        let mut activated = 77_u32;
        ALLOCATIONS.with(|n| n.set(Some(0)));
        let result = commit(
            p,
            (&mut h as *mut *mut Prepared) as usize,
            (&mut activated as *mut u32) as usize,
        );
        let count = ALLOCATIONS.with(|n| n.replace(None)).unwrap();
        result.unwrap();
        assert_eq!(count, 0);
        assert_eq!(activated, 1);
        assert!(h.is_null());
        let mut generations_out = [0_u64; 3];
        generations(p, generations_out.as_mut_ptr() as usize).unwrap();
        assert_eq!(generations_out, [1, 1, 0]);
        mutate(p, b"p".as_ptr() as usize, 1, 1.0, 0).unwrap();
        let mut parameter_out = [0_u8; 56];
        write(&mut parameter_out, 0, 56_u32);
        parameter(p as usize, false, 0, 0, parameter_out.as_mut_ptr() as usize).unwrap();
        assert_eq!(get::<u64>(&parameter_out, 40), 1_f64.to_bits());
        assert_eq!(get::<u64>(&parameter_out, 48), 0);
        mutate(p, 0, 0, 0.0, 2).unwrap();
        generations(p, generations_out.as_mut_ptr() as usize).unwrap();
        assert_eq!(generations_out, [1, 1, 1]);
        mutate(p, b"zero".as_ptr() as usize, 4, 0.0, 1).unwrap();
        destroy(p);
    }
}

#[test]
fn copy_out_rejects_short_last_buffer_and_aliases_without_partial_writes() {
    unsafe {
        let f = Fixture::new();
        let p = owner();
        let (h, _) = prepare_one(p, &f, 1, true);
        let mut id = [0xaa_u8; 4];
        let mut vertices = [0xaa_u8; 24];
        let mut uvs = [0xaa_u8; 24];
        let mut indices = [0xaa_u8; 12];
        let mut b = [0_u8; 72];
        write(&mut b, 0, 72_u32);
        for (offset, address, len) in [
            (8, id.as_mut_ptr() as usize, 4_u64),
            (24, vertices.as_mut_ptr() as usize, 24),
            (40, uvs.as_mut_ptr() as usize, 24),
            (56, indices.as_mut_ptr() as usize, 11),
        ] {
            write(&mut b, offset, address);
            write(&mut b, offset + 8, len);
        }
        let mut metadata = [0xaa_u8; 96];
        write(&mut metadata, 0, 96_u32);
        write(&mut metadata, 88, 0_u32);
        write(&mut metadata, 92, 0_u32);
        let before = metadata;
        assert_eq!(
            mesh(
                h as usize,
                true,
                0,
                b.as_ptr() as usize,
                metadata.as_mut_ptr() as usize
            ),
            Err(6)
        );
        assert_eq!(metadata, before);
        assert_eq!(id, [0xaa; 4]);
        assert_eq!(vertices, [0xaa; 24]);
        assert_eq!(uvs, [0xaa; 24]);
        assert_eq!(indices, [0xaa; 12]);
        write(&mut b, 64, 12_u64);
        write(&mut b, 40, vertices.as_mut_ptr() as usize);
        assert_eq!(
            mesh(
                h as usize,
                true,
                0,
                b.as_ptr() as usize,
                metadata.as_mut_ptr() as usize
            ),
            Err(1)
        );
        assert_eq!(metadata, before);
        assert_eq!(vertices, [0xaa; 24]);
        write(&mut b, 40, uvs.as_mut_ptr() as usize);
        mesh(
            h as usize,
            true,
            0,
            b.as_ptr() as usize,
            metadata.as_mut_ptr() as usize,
        )
        .unwrap();
        assert_eq!(&id, b"mesh");
        assert_eq!(get::<u32>(&vertices, 8), 1_f32.to_bits());
        assert_eq!(get::<u32>(&indices, 8), 2);
        assert_eq!(get::<u64>(&metadata, 24), 6);
        let mut command_out = [24_u32, 0, 0, 0, 0, 0];
        command(h as usize, true, 0, command_out.as_mut_ptr() as usize).unwrap();
        assert_eq!(command_out, [24, 1, 0, 0, 0, 0]);
        prepared_destroy(h);
        destroy(p);
    }
}

#[test]
#[cfg(not(target_arch = "wasm32"))]
fn command_queries_reject_invalid_headers_without_writing_any_output() {
    unsafe {
        let f = Fixture::new();
        let p = owner();
        observe_one(p, 1);
        let (mut h, _) = prepare_one(p, &f, 1, true);
        assert_command_query_header(
            h as usize,
            crate::evaluation::vivi_evaluation_prepared_get_draw_command_snapshot,
        );
        let mut activated = 0_u32;
        commit(
            p,
            (&mut h as *mut *mut Prepared) as usize,
            (&mut activated as *mut u32) as usize,
        )
        .unwrap();
        assert_eq!(activated, 1);
        assert!(h.is_null());
        assert_command_query_header(
            p as usize,
            crate::evaluation::vivi_evaluation_get_draw_command_snapshot,
        );
        let mut current = [0_u64; 3];
        generations(p, current.as_mut_ptr() as usize).unwrap();
        assert_eq!(current, [1, 1, 0]);
        destroy(p);
    }
}

#[cfg(not(target_arch = "wasm32"))]
unsafe fn assert_command_query_header(
    handle: usize,
    query: unsafe extern "C" fn(usize, u64, usize) -> i32,
) {
    for (size, reserved) in [(0_u32, 0_u32), (24, 7)] {
        let mut output = [0xa5a5_a5a5_u32; 6];
        output[0] = size;
        output[5] = reserved;
        let before = output;
        assert_eq!(
            unsafe { query(handle, 0, output.as_mut_ptr() as usize) },
            ARG
        );
        assert_eq!(output, before);
    }
    // Only size and reserved are inputs; previous output fields may be nonzero.
    let mut output = [24, u32::MAX, u32::MAX, u32::MAX, u32::MAX, 0];
    assert_eq!(unsafe { query(handle, 0, output.as_mut_ptr() as usize) }, 0);
    assert_eq!(output, [24, 1, 0, 0, 0, 0]);
}

#[test]
fn wrong_owner_and_invalid_retry_retain_child_hard_error_consumes_and_stale_keeps_active() {
    unsafe {
        let f = Fixture::new();
        let p = owner();
        let other = owner();
        observe_one(p, 2);
        let (mut h, _) = prepare_one(p, &f, 1, true);
        let mut activated = 99_u32;
        assert_eq!(
            commit(
                other,
                (&mut h as *mut *mut Prepared) as usize,
                (&mut activated as *mut u32) as usize
            ),
            Err(1)
        );
        assert!(!h.is_null());
        assert_eq!(activated, 99);
        commit(
            p,
            (&mut h as *mut *mut Prepared) as usize,
            (&mut activated as *mut u32) as usize,
        )
        .unwrap();
        assert!(h.is_null());
        assert_eq!(activated, 0);
        assert!(runtime(p).unwrap().value.active().is_none());
        let (mut missing, _) = prepare_one(p, &f, 2, false);
        let mut info = [16, 0, 0, 0];
        assert_eq!(
            retry(
                p,
                (&mut missing as *mut *mut Prepared) as usize,
                0,
                1,
                info.as_mut_ptr() as usize
            ),
            Err(1)
        );
        assert!(!missing.is_null());
        let bad = [7_u8; PNG.len()];
        let mut object = f.object;
        write(&mut object, 40, bad.as_ptr() as usize);
        assert!(
            retry(
                p,
                (&mut missing as *mut *mut Prepared) as usize,
                object.as_ptr() as usize,
                1,
                info.as_mut_ptr() as usize
            )
            .is_err()
        );
        assert!(missing.is_null());
        assert!(runtime(p).unwrap().value.active().is_none());
        let (mut ready, _) = prepare_one(p, &f, 2, true);
        commit(
            p,
            (&mut ready as *mut *mut Prepared) as usize,
            (&mut activated as *mut u32) as usize,
        )
        .unwrap();
        assert_eq!(activated, 1);
        let (mut duplicate, _) = prepare_one(p, &f, 2, true);
        commit(
            p,
            (&mut duplicate as *mut *mut Prepared) as usize,
            (&mut activated as *mut u32) as usize,
        )
        .unwrap();
        assert_eq!(activated, 0);
        assert_eq!(
            runtime(p)
                .unwrap()
                .value
                .active()
                .unwrap()
                .generations()
                .model,
            1
        );
        destroy(other);
        destroy(p);
    }
}

#[test]
fn descriptor_caps_and_reserved_words_reject_before_copy_or_publication() {
    unsafe {
        let f = Fixture::new();
        let p = owner();
        let mut d = f.load(1, true);
        let mut h = 123usize;
        let mut info = [16, 0, 0, 0];
        write(&mut d, 56, 289_u64);
        assert_eq!(
            prepare(
                p,
                d.as_ptr() as usize,
                (&mut h as *mut usize) as usize,
                info.as_mut_ptr() as usize
            ),
            Err(6)
        );
        assert_eq!(h, 0);
        d = f.load(1, true);
        write(&mut d, 4, 1_u32);
        assert_eq!(
            prepare(
                p,
                d.as_ptr() as usize,
                (&mut h as *mut usize) as usize,
                info.as_mut_ptr() as usize
            ),
            Err(1)
        );
        assert_eq!(h, 0);
        d = f.load(1, true);
        write(&mut d, 8, MAX_REQUEST + 1);
        assert_eq!(
            prepare(
                p,
                d.as_ptr() as usize,
                (&mut h as *mut usize) as usize,
                info.as_mut_ptr() as usize
            ),
            Err(1)
        );
        assert_eq!(h, 0);
        destroy(p);
    }
}
