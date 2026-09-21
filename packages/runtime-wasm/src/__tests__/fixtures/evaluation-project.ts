import {
  createReadOnlyAuthoringHost,
  type VerifiedAtlasAssetV1,
} from "@vivi2d/editor-host";

// Existing frozen-palette PNG witness: two opaque pixels (red, green).
export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAMAAADD/I+4AAAABlBMVEX/AAAA/wDSh+9xAAAAC0lEQVR4nGNgYAQAAAQAAr96P0oAAAAASUVORK5CYII=";
export const PNG_HASH =
  "36bface51473c12ccf669e14991783a1f05a4d7b8a297b71bcf611c18b6b8a8c";
export const pngBytes = () => Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
export const verifiedTexture = (): VerifiedAtlasAssetV1 => ({
  asset: {
    objectAddress: PNG_HASH,
    contentSha256: PNG_HASH,
    storageKind: "blob",
    mediaType: "image/png",
    sizeBytes: pngBytes().length,
  },
  png: { profile: "vivi2d.png.rgba8.v1", width: 2, height: 1 },
});
export async function fixtureHash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export function evaluationProject(nested = false) {
  const mesh = (id: string, left: number, right: number, visible: boolean) => ({
    id,
    name: id,
    kind: "viviMesh",
    visible,
    opacity: 1,
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    blendMode: "normal",
    expanded: true,
    children: [],
    mesh: {
      vertices: [left, 8, right, 8, left, 56, right, 56],
      uvs: [0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25, 0.5],
      indices: [0, 1, 2, 2, 1, 3],
      divisionsX: 1,
      divisionsY: 1,
    },
  });
  const layers = nested
    ? [
        mesh("parent", 8, 56, false),
        mesh("child", 24, 40, false),
        {
          ...mesh("target", 0, 64, true),
          clipMasks: [
            { layerId: "parent", invert: false },
            { layerId: "child", invert: true },
          ],
        },
      ]
    : [mesh("target", 0, 64, true)];
  return {
    version: 11,
    assetMode: "referenced",
    project: {
      name: "Evaluation browser witness",
      width: 64,
      height: 64,
      layers,
      parameters: [{ id: "p", name: "P", minValue: -1, maxValue: 1, defaultValue: 0 }],
      clips: [],
      scenes: [],
      physicsGroups: [],
      skins: {},
      parameterBindings: [],
      sceneBlends: [],
      ikControllers: [],
      offscreenTargets: [],
      expressionPresets: [{ id: "one", name: "One", values: { p: 1 } }],
      colliders: [],
      stateMachines: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
    },
    atlases: [
      {
        id: "atlas",
        image: verifiedTexture().asset,
        width: 2,
        height: 1,
        entries: layers.map((layer) => ({
          layerId: layer.id,
          x: 0,
          y: 0,
          width: 2,
          height: 1,
        })),
      },
    ],
    requires: [
      { id: "vivi.cap.referencedAssets", minVersion: 1, requiredFor: ["render"] },
      ...(nested
        ? [{ id: "vivi.cap.maskInvert", minVersion: 1, requiredFor: ["render"] }]
        : []),
    ],
  };
}
export function fixtureHost() {
  return createReadOnlyAuthoringHost({
    registry: new Map(),
    supportedCapabilities: new Map([
      ["vivi.cap.referencedAssets", 1],
      ["vivi.cap.maskInvert", 1],
    ]),
    sha256: fixtureHash,
    materializeEmbeddedAtlas: () => verifiedTexture(),
    resolveReferencedAtlas: () => ({ status: "ready", verified: verifiedTexture() }),
  });
}
