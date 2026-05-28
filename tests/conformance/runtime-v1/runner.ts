import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimeConformanceFileData = Record<string, unknown>;

export interface RuntimeConformanceTolerances {
  readonly vertexPosition: number;
}

export type RuntimeConformanceAction =
  | { type: "setInput"; id: string; value: number }
  | { type: "applyExpressionPreset"; id: string }
  | { type: "update"; deltaSeconds: number };

export interface RuntimeConformanceFixture {
  name: string;
  description?: string;
  fileData: RuntimeConformanceFileData;
  runtimeOptions?: unknown;
  actions?: RuntimeConformanceAction[];
  expectError?: string;
  expect?: {
    parameters: Record<string, number>;
    textures: unknown[];
    renderList: Array<{
      id: string;
      textureId: string;
      visible: boolean;
      culled: boolean;
      blendMode: string;
      drawOrder: number;
      vertices: number[];
      uvs: number[];
      indices: number[];
      x?: number;
      y?: number;
    }>;
    hitTests: Array<{
      x: number;
      y: number;
      hit: {
        colliderId: string;
        layerId: string | null;
        meshId: string | null;
      } | null;
    }>;
  };
}

export interface RuntimeConformanceManifestEntry {
  readonly file: string;
  readonly category: string;
  readonly expected: string;
}

export interface RuntimeConformanceManifest {
  readonly schemaVersion: 1;
  readonly specVersion: "runtime-v1";
  readonly fixtures: readonly RuntimeConformanceManifestEntry[];
}

export interface RuntimeConformanceMeshSnapshot {
  id: string;
  textureId: string;
  visible: boolean;
  culled: boolean;
  blendMode: string;
  drawOrder: number;
  x: number;
  y: number;
  vertices: ArrayLike<number>;
  uvs: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface RuntimeConformanceAdapter<TModel> {
  load(fileData: RuntimeConformanceFileData, runtimeOptions?: unknown): TModel;
  setInput(model: TModel, id: string, value: number): void;
  applyExpressionPreset(model: TModel, id: string): void;
  update(model: TModel, deltaSeconds: number): void;
  getParameterValue(model: TModel, id: string): number | null;
  getTextures(model: TModel): unknown[];
  getRenderList(model: TModel): RuntimeConformanceMeshSnapshot[];
  hitTest(
    model: TModel,
    x: number,
    y: number,
  ): {
    colliderId: string;
    layerId: string | null;
    meshId: string | null;
  } | null;
}

export type RuntimeConformanceExpect = {
  toEqual(actual: unknown, expected: unknown): void;
  toHaveLength(actual: { length: number }, expected: number): void;
  toMatchObject(actual: unknown, expected: unknown): void;
  toBeNull(actual: unknown): void;
  toBeWithinTolerance(actual: number, expected: number, tolerance: number): void;
};

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));

export function readRuntimeConformanceManifest(): RuntimeConformanceManifest {
  const filePath = join(fixtureDirectory, "manifest.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as RuntimeConformanceManifest;
}

export function readRuntimeConformanceFixture(
  name: string,
): RuntimeConformanceFixture {
  const filePath = join(fixtureDirectory, `${name}.fixture.json`);
  return JSON.parse(readFileSync(filePath, "utf8")) as RuntimeConformanceFixture;
}

export function readRuntimeConformanceFixtures(): RuntimeConformanceFixture[] {
  const manifest = readRuntimeConformanceManifest();
  const fixtureFiles = new Set(
    readdirSync(fixtureDirectory).filter((name) => name.endsWith(".fixture.json")),
  );
  const declaredFiles = new Set<string>();

  for (const entry of manifest.fixtures) {
    if (!entry.file.endsWith(".fixture.json")) {
      throw new Error(`manifest entry ${entry.file} must end with .fixture.json`);
    }
    if (declaredFiles.has(entry.file)) {
      throw new Error(`manifest entry ${entry.file} is duplicated`);
    }
    if (!fixtureFiles.has(entry.file)) {
      throw new Error(`manifest entry ${entry.file} does not exist`);
    }
    declaredFiles.add(entry.file);
  }

  const unlistedFiles = [...fixtureFiles].filter((file) => !declaredFiles.has(file));
  if (unlistedFiles.length > 0) {
    throw new Error(`fixture files missing from manifest: ${unlistedFiles.join(", ")}`);
  }

  return manifest.fixtures.map((entry) =>
    readRuntimeConformanceFixture(entry.file.replace(/\.fixture\.json$/, "")),
  );
}

export function runRuntimeConformanceErrorFixture<TModel>(
  adapter: RuntimeConformanceAdapter<TModel>,
  fixture: RuntimeConformanceFixture,
  expect: RuntimeConformanceExpect,
): void {
  if (!fixture.expectError) {
    throw new Error(`fixture ${fixture.name} is missing expected error`);
  }

  let caught: unknown;
  try {
    adapter.load(fixture.fileData, fixture.runtimeOptions);
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) {
    throw new Error(`expected fixture ${fixture.name} load to fail`);
  }
  expect.toMatchObject(caught, { code: fixture.expectError });
}

export function runRuntimeConformanceFixture<TModel>(
  adapter: RuntimeConformanceAdapter<TModel>,
  fixture: RuntimeConformanceFixture,
  expect: RuntimeConformanceExpect,
  tolerances: RuntimeConformanceTolerances,
): void {
  const model = adapter.load(fixture.fileData, fixture.runtimeOptions);

  for (const action of fixture.actions ?? []) {
    if (action.type === "setInput") {
      adapter.setInput(model, action.id, action.value);
    } else if (action.type === "applyExpressionPreset") {
      adapter.applyExpressionPreset(model, action.id);
    } else {
      adapter.update(model, action.deltaSeconds);
    }
  }

  if (!fixture.expect) {
    throw new Error(`fixture ${fixture.name} is missing expected output`);
  }
  const expectedOutput = fixture.expect;

  for (const [id, expected] of Object.entries(expectedOutput.parameters)) {
    expect.toEqual(adapter.getParameterValue(model, id), expected);
  }

  expect.toEqual(adapter.getTextures(model), expectedOutput.textures);

  const renderList = adapter.getRenderList(model);
  expect.toHaveLength(renderList, expectedOutput.renderList.length);
  for (let index = 0; index < expectedOutput.renderList.length; index += 1) {
    const actual = renderList[index]!;
    const expected = expectedOutput.renderList[index]!;
    expect.toMatchObject(actual, {
      id: expected.id,
      textureId: expected.textureId,
      visible: expected.visible,
      culled: expected.culled,
      blendMode: expected.blendMode,
      drawOrder: expected.drawOrder,
    });
    if (expected.x !== undefined) {
      expect.toEqual(actual.x, expected.x);
    }
    if (expected.y !== undefined) {
      expect.toEqual(actual.y, expected.y);
    }
    expectNumberArrayCloseTo(
      actual.vertices,
      expected.vertices,
      tolerances.vertexPosition,
      expect,
    );
    expectNumberArrayCloseTo(
      actual.uvs,
      expected.uvs,
      tolerances.vertexPosition,
      expect,
    );
    expect.toEqual(Array.from(actual.indices), expected.indices);
  }

  for (const hitTest of expectedOutput.hitTests) {
    const actual = adapter.hitTest(model, hitTest.x, hitTest.y);
    if (hitTest.hit === null) {
      expect.toBeNull(actual);
    } else {
      expect.toMatchObject(actual, hitTest.hit);
    }
  }
}

function expectNumberArrayCloseTo(
  actual: ArrayLike<number>,
  expected: readonly number[],
  tolerance: number,
  expect: RuntimeConformanceExpect,
): void {
  expect.toHaveLength(Array.from(actual), expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect.toBeWithinTolerance(actual[index]!, expected[index]!, tolerance);
  }
}
