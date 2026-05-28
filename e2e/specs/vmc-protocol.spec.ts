import { expect, test } from "../fixtures";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("OSC: 各型タグの往復変換が正確", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const parse = v.parseOSCMessage as any;
    const serialize = v.serializeOSCMessage as any;

    // string + float
    const buf1 = serialize({
      address: "/test/sf",
      args: [
        { type: "s", value: "hello" },
        { type: "f", value: 3.14 },
      ],
    });
    const p1 = parse(buf1);

    // int
    const buf2 = serialize({
      address: "/test/i",
      args: [{ type: "i", value: 42 }],
    });
    const p2 = parse(buf2);

    const buf3 = serialize({
      address: "/multi",
      args: [
        { type: "s", value: "name" },
        { type: "i", value: 100 },
        { type: "f", value: 0.5 },
      ],
    });
    const p3 = parse(buf3);

    return {
      sf_address: p1.address,
      sf_arg0: p1.args[0]?.value,
      sf_arg1_approx: Math.abs(Number(p1.args[1]?.value) - 3.14) < 0.01,
      i_arg0: p2.args[0]?.value,
      multi_argCount: p3.args.length,
      multi_arg0: p3.args[0]?.value,
      multi_arg1: p3.args[1]?.value,
    };
  });

  expect(result.sf_address).toBe("/test/sf");
  expect(result.sf_arg0).toBe("hello");
  expect(result.sf_arg1_approx).toBe(true);
  expect(result.i_arg0).toBe(42);
  expect(result.multi_argCount).toBe(3);
  expect(result.multi_arg0).toBe("name");
  expect(result.multi_arg1).toBe(100);
});

test("OSC: face channel message parsing", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const parse = v.parseOSCMessage as any;
    const serialize = v.serializeOSCMessage as any;
    const parseFaceChannel = v.parseVMCFaceChannel as any;

    const buf = serialize({
      address: "/VMC/Ext/Blend/Val",
      args: [
        { type: "s", value: "Blink_L" },
        { type: "f", value: 0.8 },
      ],
    });
    const parsed = parse(buf);
    const faceChannel = parseFaceChannel(parsed);

    return {
      name: faceChannel?.name,
      value_approx: faceChannel
        ? Math.abs(faceChannel.value - 0.8) < 0.01
        : false,
    };
  });

  expect(result.name).toBe("Blink_L");
  expect(result.value_approx).toBe(true);
});

test("OSC: BonePos メッセージのパース", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const parse = v.parseOSCMessage as any;
    const serialize = v.serializeOSCMessage as any;
    const parseBone = v.parseVMCBonePos as any;

    const buf = serialize({
      address: "/VMC/Ext/Bone/Pos",
      args: [
        { type: "s", value: "Head" },
        { type: "f", value: 1.0 },
        { type: "f", value: 2.0 },
        { type: "f", value: 3.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 0.0 },
        { type: "f", value: 1.0 },
      ],
    });
    const parsed = parse(buf);
    const bone = parseBone(parsed);

    return { name: bone?.name, hasPosition: bone != null };
  });

  expect(result.name).toBe("Head");
  expect(result.hasPosition).toBe(true);
});


test("VMC ストア: マッピング CRUD", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const vmcStore = v.useVMCStore as any;
    const state = vmcStore.getState();
    state.reset();

    state.addMapping({
      vmcName: "Blink_L",
      parameterId: "p-bl",
      scale: 1.5,
      offset: 0.1,
    });
    state.addMapping({ vmcName: "Blink_R", parameterId: "p-br", scale: 1.0, offset: 0 });
    const afterAdd = vmcStore.getState().mappings.length;

    state.updateMapping(0, { scale: 2.0 });
    const updatedScale = vmcStore.getState().mappings[0]?.scale;

    state.removeMapping(0);
    const afterRemove = vmcStore.getState().mappings.length;
    const remaining = vmcStore.getState().mappings[0]?.vmcName;

    return { afterAdd, updatedScale, afterRemove, remaining };
  });

  expect(result.afterAdd).toBe(2);
  expect(result.updatedScale).toBe(2.0);
  expect(result.afterRemove).toBe(1);
  expect(result.remaining).toBe("Blink_R");
});

test("VMC ストア: ポート設定", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const vmcStore = v.useVMCStore as any;
    const state = vmcStore.getState();
    state.reset();

    state.setReceivePort(12345);
    state.setSendTarget("192.168.1.100", 54321);

    const updated = vmcStore.getState();
    return {
      receivePort: updated.receivePort,
      sendHost: updated.sendHost,
      sendPort: updated.sendPort,
    };
  });

  expect(result.receivePort).toBe(12345);
  expect(result.sendHost).toBe("192.168.1.100");
  expect(result.sendPort).toBe(54321);
});

test("VMC ストア: markReceived でタイムスタンプ記録", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const vmcStore = v.useVMCStore as any;
    const state = vmcStore.getState();
    state.reset();

    const before = Date.now();
    state.markReceived();
    const after = Date.now();
    const ts = vmcStore.getState().lastReceivedAt;

    return { notNull: ts !== null, inRange: ts !== null && ts >= before && ts <= after };
  });

  expect(result.notNull).toBe(true);
  expect(result.inRange).toBe(true);
});


test("OSC: 空文字列引数の往復", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const parse = v.parseOSCMessage as any;
    const serialize = v.serializeOSCMessage as any;

    const buf = serialize({
      address: "/empty",
      args: [{ type: "s", value: "" }],
    });
    const parsed = parse(buf);
    return { address: parsed.address, arg0: parsed.args[0]?.value };
  });

  expect(result.address).toBe("/empty");
  expect(result.arg0).toBe("");
});

test("OSC: 長いアドレスパターンの往復", async ({ window }) => {
  const result = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const parse = v.parseOSCMessage as any;
    const serialize = v.serializeOSCMessage as any;

    const longAddr = "/VMC/Ext/Blend/Val/Extra/Deep/Path";
    const buf = serialize({
      address: longAddr,
      args: [{ type: "f", value: 1.0 }],
    });
    const parsed = parse(buf);
    return { address: parsed.address };
  });

  expect(result.address).toBe("/VMC/Ext/Blend/Val/Extra/Deep/Path");
});
