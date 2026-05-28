import { describe, expect, it } from "vitest";
import { migrateV4toV5 } from "../project-migration";
import { parseViviFile } from "../project-parser";
import type {
  AnimationStateMachine,
  ColliderData,
  ProjectData,
  ViviFileData,
} from "../types";


function createV5FileData(
  colliders: ColliderData[],
  stateMachines: AnimationStateMachine[],
): ViviFileData {
  return {
    version: 5,
    project: {
      name: "テスト",
      width: 200,
      height: 200,
      layers: [],
      parameters: [{ id: "p1", name: "速度", minValue: 0, maxValue: 1, defaultValue: 0 }],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
      skins: {},
      colliders,
      stateMachines,
    } as ProjectData,
    atlases: [],
  };
}

describe("v5 ラウンドトリップ: serialize → JSON → parse → verify", () => {
  it("コライダー全3形状がラウンドトリップで保持される", () => {
    const colliders: ColliderData[] = [
      {
        id: "c1",
        name: "矩形",
        shape: { type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
        tag: "head",
        enabled: true,
      },
      {
        id: "c2",
        name: "円",
        shape: { type: "circle", x: 300, y: 300, radius: 80 },
        enabled: true,
      },
      {
        id: "c3",
        name: "メッシュ",
        shape: { type: "mesh", meshId: "layer-1" },
        tag: "body",
        enabled: false,
      },
    ];

    const fileData = createV5FileData(colliders, []);
    const json = JSON.stringify(fileData);

    const parsed = parseViviFile(json);
    expect(parsed.version).toBe(5);

    const p = parsed.project as ProjectData;
    expect(p.colliders).toHaveLength(3);
    expect(p.colliders[0]).toEqual(colliders[0]);
    expect(p.colliders[1]).toEqual(colliders[1]);
    expect(p.colliders[2]).toEqual(colliders[2]);
  });

  it("ステートマシン（状態・遷移・条件）がラウンドトリップで保持される", () => {
    const machines: AnimationStateMachine[] = [
      {
        id: "sm1",
        name: "表情制御",
        states: [
          { id: "s1", name: "idle", loop: true },
          { id: "s2", name: "smile", loop: false, clipId: "clip-smile" },
          { id: "s3", name: "angry", loop: true },
        ],
        transitions: [
          {
            id: "t1",
            fromStateId: "s1",
            toStateId: "s2",
            conditions: [{ parameterId: "p1", operator: ">", threshold: 0.5 }],
            transitionDuration: 0.3,
            priority: 0,
          },
          {
            id: "t2",
            fromStateId: "*",
            toStateId: "s3",
            conditions: [{ parameterId: "p1", operator: "==", threshold: 1 }],
            transitionDuration: 0,
            priority: 10,
          },
        ],
        initialStateId: "s1",
        enabled: true,
      },
    ];

    const fileData = createV5FileData([], machines);
    const json = JSON.stringify(fileData);
    const parsed = parseViviFile(json);
    const p = parsed.project as ProjectData;

    expect(p.stateMachines).toHaveLength(1);
    const sm = p.stateMachines[0]!;
    expect(sm.name).toBe("表情制御");
    expect(sm.states).toHaveLength(3);
    expect(sm.transitions).toHaveLength(2);
    expect(sm.transitions[0]!.conditions).toHaveLength(1);
    expect(sm.transitions[0]!.conditions[0]!.operator).toBe(">");
    expect(sm.transitions[1]!.fromStateId).toBe("*");
    expect(sm.transitions[1]!.priority).toBe(10);
    expect(sm.initialStateId).toBe("s1");
    expect(sm.enabled).toBe(true);
  });

  it("v4ファイル（colliders/stateMachines未定義）が migrateV4toV5 で正しく初期化される", () => {
    const v4Data = {
      version: 4,
      project: {
        name: "旧プロジェクト",
        width: 100,
        height: 100,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
        lipsyncConfig: {
          enabled: false,
          targetParameterId: null,
          source: "microphone",
          threshold: 0.02,
          smoothing: 0.7,
          gain: 2,
        },
        skins: {},
      },
      atlases: [],
    };

    const json = JSON.stringify(v4Data);
    const parsed = parseViviFile(json);
    const project = parsed.project as ProjectData;

    expect(project.colliders).toBeUndefined();
    expect(project.stateMachines).toBeUndefined();

    const migrated = migrateV4toV5(project);
    expect(migrated.colliders).toEqual([]);
    expect(migrated.stateMachines).toEqual([]);
  });

  it("v4ファイルの既存コライダーが migrateV4toV5 で保持される", () => {
    const v4Data = {
      version: 4,
      project: {
        name: "コライダー付き",
        width: 100,
        height: 100,
        layers: [],
        parameters: [],
        clips: [],
        scenes: [],
        physicsGroups: [],
        lipsyncConfig: {
          enabled: false,
          targetParameterId: null,
          source: "microphone",
          threshold: 0.02,
          smoothing: 0.7,
          gain: 2,
        },
        skins: {},
        colliders: [
          {
            id: "c1",
            name: "頭",
            shape: { type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
            enabled: true,
          },
        ],
      },
      atlases: [],
    };

    const json = JSON.stringify(v4Data);
    const parsed = parseViviFile(json);
    const migrated = migrateV4toV5(parsed.project as ProjectData);

    expect(migrated.colliders).toHaveLength(1);
    expect(migrated.colliders[0]!.name).toBe("頭");
  });

  it("コライダー+ステートマシンの複合データがラウンドトリップで完全保持される", () => {
    const colliders: ColliderData[] = [
      {
        id: "c1",
        name: "頭",
        shape: { type: "circle", x: 100, y: 50, radius: 40 },
        tag: "head",
        enabled: true,
      },
    ];
    const machines: AnimationStateMachine[] = [
      {
        id: "sm1",
        name: "表情",
        states: [
          { id: "s1", name: "neutral", loop: true },
          { id: "s2", name: "happy", loop: false },
        ],
        transitions: [
          {
            id: "t1",
            fromStateId: "s1",
            toStateId: "s2",
            conditions: [{ parameterId: "p1", operator: ">=", threshold: 0.8 }],
            transitionDuration: 0.2,
            priority: 5,
          },
        ],
        initialStateId: "s1",
        enabled: true,
      },
    ];

    const original = createV5FileData(colliders, machines);
    const json = JSON.stringify(original);
    const parsed = parseViviFile(json);
    const p = parsed.project as ProjectData;

    expect(JSON.stringify(p.colliders)).toBe(JSON.stringify(colliders));
    expect(JSON.stringify(p.stateMachines)).toBe(JSON.stringify(machines));
  });
});
