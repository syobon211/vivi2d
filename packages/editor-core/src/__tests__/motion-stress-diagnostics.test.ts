import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOTION_STRESS_THRESHOLD_POLICY,
  DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
  assertNoMotionStressPreviewResult,
  computeDuplicateContourSummary,
  computeHiddenRevealSummary,
  createEditorSessionTargetToken,
  createMotionCleanupComparisonOptions,
  createMotionCleanupRecommendations,
  createMotionStressPolicyHash,
  createMotionStressPolicyV2Hash,
  createMotionStressPreviewResult,
  createPersistedMotionBudgetAdjustment,
  deriveMotionStressCheckSeverities,
  deriveMotionStressRoleBucket,
  isMotionStressPreviewResult,
  projectMotionStressChecksForPublicSurface,
  projectMotionStressCheckId,
  sanitizeMotionStressErrorForPublicSurface,
  validateMotionStressAlphaView,
  validateMotionStressImageView,
} from "../motion-stress-diagnostics";
import { getMotionSemanticPolicy } from "../motion-template-policy";
import { createMotionStressFixture } from "./motion-stress-fixtures";

function rgba(
  width: number,
  height: number,
  values?: Record<number, [number, number, number, number]>,
) {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const pixel = values?.[index] ?? [0, 0, 0, 255];
    bytes.set(pixel, index * 4);
  }
  return {
    width,
    height,
    rgba: bytes,
    colorSpace: "srgb" as const,
    alphaMode: "straight" as const,
    normalizationVersion: 1 as const,
  };
}

function alpha(width: number, height: number, values?: Record<number, number>) {
  const bytes = new Uint8ClampedArray(width * height);
  for (let index = 0; index < width * height; index += 1) {
    bytes[index] = values?.[index] ?? 0;
  }
  return {
    width,
    height,
    alpha: bytes,
    normalizationVersion: 1 as const,
  };
}

describe("motion stress diagnostics", () => {
  it("creates preview-only diagnostics without mutating source images", () => {
    const source = rgba(2, 2);
    const preview = rgba(2, 2, { 0: [255, 0, 0, 255] });
    const sourceBefore = new Uint8ClampedArray(source.rgba);

    const result = createMotionStressPreviewResult({
      regionId: "hair-front",
      sourceComposite: source,
      previewComposite: preview,
      protectedCrops: [{ id: "face", bounds: { x: 0, y: 0, width: 1, height: 1 } }],
      duplicateContourMask: new Uint8ClampedArray([255, 0, 0, 0]),
      hiddenRevealMask: new Uint8ClampedArray([0, 255, 0, 0]),
    });

    expect(source.rgba).toEqual(sourceBefore);
    expect(result.previewOnly).toBe(true);
    expect(result.scores.protectedCropDelta).toBeGreaterThan(0);
    expect(result.scores.duplicateContour).toBe(0.25);
    expect(result.scores.hiddenReveal).toBe(0.25);
    expect(result.details.protectedCropDelta?.p95).toBeGreaterThan(0);
    expect(result.thresholdPolicyHash).toBe(
      DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2.policyHash,
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "protectedCropDelta",
        "duplicateContour",
        "hiddenReveal",
      ]),
    );
  });

  it("validates RGBA image views as editor-owned snapshots", () => {
    const source = rgba(1, 1, { 0: [1, 2, 3, 4] });
    const owned = validateMotionStressImageView(source, 1, 1, "source");
    source.rgba[0] = 255;

    expect(owned.editorOwned).toBe(true);
    expect(owned.rgba[0]).toBe(1);
    expect(() =>
      validateMotionStressImageView(
        { ...source, rgba: new Uint8Array(4) },
        1,
        1,
        "source",
      ),
    ).toThrow(/Uint8ClampedArray/);
    expect(() =>
      validateMotionStressImageView(
        { ...source, normalizationVersion: 2 },
        1,
        1,
        "source",
      ),
    ).toThrow(/normalization/);
  });

  it("rejects accessor-backed stress image views without invoking getters", () => {
    let getterInvoked = false;
    const hostile = {
      width: 1,
      height: 1,
      colorSpace: "srgb",
      alphaMode: "straight",
      normalizationVersion: 1,
      get rgba() {
        getterInvoked = true;
        return new Uint8ClampedArray(4);
      },
    };

    expect(() =>
      validateMotionStressImageView(hostile, 1, 1, "source"),
    ).toThrow(/data property/);
    expect(getterInvoked).toBe(false);
  });

  it("validates alpha views as editor-owned snapshots", () => {
    const moving = alpha(2, 1, { 0: 255, 1: 0 });
    const owned = validateMotionStressAlphaView(moving, 2, 1, "moving");
    moving.alpha[0] = 0;

    expect(owned.editorOwned).toBe(true);
    expect(owned.alpha[0]).toBe(255);
    expect(() =>
      validateMotionStressAlphaView(
        { ...moving, alpha: new Uint16Array(2) },
        2,
        1,
        "moving",
      ),
    ).toThrow(/Uint8/);
    expect(() =>
      validateMotionStressAlphaView(alpha(1, 1), 2, 1, "moving"),
    ).toThrow(/dimensions/);
    expect(() =>
      validateMotionStressAlphaView(
        { ...alpha(2, 1), alpha: new Uint8Array(1) },
        2,
        1,
        "moving",
      ),
    ).toThrow(/width \* height/);
  });

  it("rejects accessor-backed alpha views without invoking getters", () => {
    let getterInvoked = false;
    const hostile = {
      width: 1,
      height: 1,
      normalizationVersion: 1,
      get alpha() {
        getterInvoked = true;
        return new Uint8Array(1);
      },
    };

    expect(() =>
      validateMotionStressAlphaView(hostile, 1, 1, "moving"),
    ).toThrow(/data property/);
    expect(getterInvoked).toBe(false);
  });

  it("rejects shared-buffer backed stress image and alpha views", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    expect(() =>
      validateMotionStressImageView(
        {
          ...rgba(1, 1),
          rgba: new Uint8ClampedArray(new SharedArrayBuffer(4)),
        },
        1,
        1,
        "source",
      ),
    ).toThrow(/SharedArrayBuffer/);
    expect(() =>
      validateMotionStressAlphaView(
        { ...alpha(1, 1), alpha: new Uint8Array(new SharedArrayBuffer(1)) },
        1,
        1,
        "moving",
      ),
    ).toThrow(/SharedArrayBuffer/);
  });

  it("rejects resizable ArrayBuffer-backed alpha when supported", () => {
    const ArrayBufferCtor = ArrayBuffer as unknown as {
      new (length: number, options?: { maxByteLength: number }): ArrayBuffer;
    };
    let resizable: ArrayBuffer | undefined;
    try {
      resizable = new ArrayBufferCtor(1, { maxByteLength: 2 });
    } catch {
      return;
    }

    expect(() =>
      validateMotionStressAlphaView(
        { ...alpha(1, 1), alpha: new Uint8Array(resizable) },
        1,
        1,
        "moving",
      ),
    ).toThrow(/resizable/);
  });

  it("uses owned alpha snapshots for duplicate outline and hidden reveal scores", () => {
    const moving = alpha(3, 1, { 0: 0, 1: 255, 2: 0 });
    const lower = alpha(3, 1, { 0: 0, 1: 255, 2: 0 });
    const duplicate = computeDuplicateContourSummary({
      movingAlpha: moving,
      lowerAlpha: lower,
      sourceComposite: rgba(3, 1),
      previewComposite: rgba(3, 1),
      width: 3,
      height: 1,
      searchRadiusPx: 1,
      minEdgeAlphaDelta: 64,
    });
    moving.alpha.fill(0);
    lower.alpha.fill(0);
    const duplicateAfterMutation = computeDuplicateContourSummary({
      movingAlpha: alpha(3, 1, { 0: 0, 1: 255, 2: 0 }),
      lowerAlpha: alpha(3, 1, { 0: 0, 1: 255, 2: 0 }),
      sourceComposite: rgba(3, 1),
      previewComposite: rgba(3, 1),
      width: 3,
      height: 1,
      searchRadiusPx: 1,
      minEdgeAlphaDelta: 64,
    });

    expect(duplicate.affectedPixelRatio).toBeGreaterThan(0);
    expect(duplicate).toEqual(duplicateAfterMutation);

    const hiddenReveal = computeHiddenRevealSummary({
      movingAlphaBefore: alpha(2, 1, { 0: 255, 1: 0 }),
      movingAlphaAfter: alpha(2, 1, { 0: 0, 1: 0 }),
      lowerAlpha: alpha(2, 1, { 0: 0, 1: 255 }),
      width: 2,
      height: 1,
      minRevealAlphaDrop: 64,
    });
    expect(hiddenReveal.affectedPixelRatio).toBe(0.5);
  });

  it("version-hashes threshold policies and rejects stale hashes", () => {
    const { policyHash: _hash, ...base } = DEFAULT_MOTION_STRESS_THRESHOLD_POLICY;
    const stricter = {
      ...base,
      protectedCropMean: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY.protectedCropMean / 2,
    };
    const policyHash = createMotionStressPolicyHash(stricter);

    expect(policyHash).not.toBe(DEFAULT_MOTION_STRESS_THRESHOLD_POLICY.policyHash);
    expect(() =>
      createMotionStressPreviewResult({
        regionId: "hair",
        sourceComposite: rgba(1, 1),
        previewComposite: rgba(1, 1),
        thresholdPolicy: {
          ...stricter,
          policyHash: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY.policyHash,
        },
      }),
    ).toThrow(/policy hash/);
  });

  it("version-hashes V2 role thresholds in a stable bucket order", () => {
    const { policyHash: _hash, ...base } = DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2;
    const shuffled = {
      ...base,
      roleThresholds: [...base.roleThresholds].reverse(),
    };
    expect(createMotionStressPolicyV2Hash(shuffled)).toBe(
      DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2.policyHash,
    );
    const changed = {
      ...base,
      roleThresholds: base.roleThresholds.map((threshold) =>
        threshold.roleBucket === "hair"
          ? {
              ...threshold,
              duplicateContourWarning: threshold.duplicateContourWarning / 2,
            }
          : threshold,
      ),
    };
    expect(createMotionStressPolicyV2Hash(changed)).not.toBe(
      DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2.policyHash,
    );
  });

  it("rejects V2 policies with fail thresholds below warnings", () => {
    const { policyHash: _hash, ...base } = DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2;
    const invalid = {
      ...base,
      roleThresholds: base.roleThresholds.map((threshold) =>
        threshold.roleBucket === "hair"
          ? {
              ...threshold,
              duplicateContourWarning: 0.5,
              duplicateContourFail: 0.2,
            }
          : threshold,
      ),
    };
    expect(() =>
      createMotionStressPreviewResult({
        regionId: "hair",
        sourceComposite: rgba(1, 1),
        previewComposite: rgba(1, 1),
        thresholdPolicy: {
          ...invalid,
          policyHash: createMotionStressPolicyV2Hash(invalid),
        },
      }),
    ).toThrow(/fail threshold/);
  });

  it("uses role-tuned stress thresholds for hair, body, tail, and protected regions", () => {
    const result = {
      kind: "motionStressPreview" as const,
      previewOnly: true as const,
      regionId: "fixture",
      scores: {
        protectedCropDelta: 0.019,
        duplicateContour: 0.018,
        hiddenReveal: 0.009,
        edgeContamination: 0,
        restRecompositionDelta: 0,
      },
      details: {
        protectedCropDelta: {
          mean: 0.019,
          p95: 0.061,
          max: 0.061,
          affectedPixelRatio: 0.1,
        },
      },
      thresholdPolicyHash: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2.policyHash,
      warnings: [] as const,
      severities: {
        protectedCropDelta: "pass",
        duplicateContour: "pass",
        hiddenReveal: "pass",
        edgeContamination: "pass",
        restRecompositionDelta: "pass",
      },
    };

    expect(
      deriveMotionStressCheckSeverities(
        result,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        "hair",
      ).duplicateContour,
    ).toBe("warning");
    expect(
      deriveMotionStressCheckSeverities(
        result,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        "body",
      ).duplicateContour,
    ).toBe("pass");
    expect(
      deriveMotionStressCheckSeverities(
        result,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        "tail",
      ).hiddenReveal,
    ).toBe("warning");
    expect(
      deriveMotionStressCheckSeverities(
        result,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        "generic",
      ).hiddenReveal,
    ).toBe("pass");
    expect(
      deriveMotionStressCheckSeverities(
        result,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        "protected",
      ).protectedCropDelta,
    ).toBe("warning");
  });

  it("calibrates duplicate outline fixtures with positive and negative cases", () => {
    const positiveFixture = createMotionStressFixture("hairOverFaceDuplicateLine");
    const negativeFixture = createMotionStressFixture("lowerOutlineFarFromMotion");
    const positive = createMotionStressPreviewResult(positiveFixture.input);
    const negative = createMotionStressPreviewResult(negativeFixture.input);

    expect(positive.scores.duplicateContour).toBeGreaterThan(
      negative.scores.duplicateContour,
    );
    expect(
      deriveMotionStressCheckSeverities(
        positive,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        positiveFixture.roleBucket,
      ).duplicateContour,
    ).not.toBe("pass");
    expect(
      deriveMotionStressCheckSeverities(
        negative,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        negativeFixture.roleBucket,
      ).duplicateContour,
    ).toBe("pass");
  });

  it("calibrates hidden reveal fixtures against opaque and accepted underpaint coverage", () => {
    const transparentFixture = createMotionStressFixture("tailOverTransparentBackground");
    const opaqueFixture = createMotionStressFixture("opaqueBackgroundReveal");
    const weakUnderpaintFixture = createMotionStressFixture("underpaintAlphaBelowThreshold");
    const acceptedUnderpaintFixture = createMotionStressFixture("acceptedUnderpaintCoversReveal");
    const transparent = createMotionStressPreviewResult(transparentFixture.input);
    const opaque = createMotionStressPreviewResult(opaqueFixture.input);
    const weakUnderpaint = createMotionStressPreviewResult(weakUnderpaintFixture.input);
    const acceptedUnderpaint = createMotionStressPreviewResult(
      acceptedUnderpaintFixture.input,
    );

    expect(transparent.scores.hiddenReveal).toBeGreaterThan(0);
    expect(weakUnderpaint.scores.hiddenReveal).toBeGreaterThan(0);
    expect(opaque.scores.hiddenReveal).toBe(0);
    expect(acceptedUnderpaint.scores.hiddenReveal).toBe(0);
    expect(
      deriveMotionStressCheckSeverities(
        transparent,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        transparentFixture.roleBucket,
      ).hiddenReveal,
    ).not.toBe("pass");
    expect(
      deriveMotionStressCheckSeverities(
        opaque,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        opaqueFixture.roleBucket,
      ).hiddenReveal,
    ).toBe("pass");
  });

  it("calibrates protected crop fixtures without warning on nearby unchanged pixels", () => {
    const nearFixture = createMotionStressFixture("frontHairNearEye");
    const changedFixture = createMotionStressFixture("frontHairNearEyeChanged");
    const cleanFixture = createMotionStressFixture("noMotionRest");
    const near = createMotionStressPreviewResult(nearFixture.input);
    const changed = createMotionStressPreviewResult(changedFixture.input);
    const clean = createMotionStressPreviewResult(cleanFixture.input);

    expect(near.scores.protectedCropDelta).toBe(0);
    expect(changed.scores.protectedCropDelta).toBeGreaterThan(0);
    expect(clean.scores.restRecompositionDelta).toBe(0);
    expect(
      deriveMotionStressCheckSeverities(
        changed,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        changedFixture.roleBucket,
      ).protectedCropDelta,
    ).not.toBe("pass");
    expect(
      deriveMotionStressCheckSeverities(
        near,
        DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        nearFixture.roleBucket,
      ).protectedCropDelta,
    ).toBe("pass");
  });

  it("derives role buckets from semantic policy", () => {
    expect(
      deriveMotionStressRoleBucket({
        role: "hairFront",
        policy: getMotionSemanticPolicy("hairFront"),
      }),
    ).toBe("hair");
    expect(
      deriveMotionStressRoleBucket({
        role: "tail",
        policy: getMotionSemanticPolicy("tail"),
      }),
    ).toBe("tail");
    expect(
      deriveMotionStressRoleBucket({
        role: "face",
        policy: getMotionSemanticPolicy("face"),
      }),
    ).toBe("protected");
  });

  it("derives severities and public-safe stress check IDs", () => {
    const result = createMotionStressPreviewResult({
      regionId: "hair",
      sourceComposite: rgba(2, 2),
      previewComposite: rgba(2, 2, { 0: [255, 0, 0, 255] }),
      duplicateContourMask: new Uint8ClampedArray([255, 0, 0, 0]),
      hiddenRevealMask: new Uint8ClampedArray([255, 0, 0, 0]),
      protectedCrops: [{ id: "face", bounds: { x: 0, y: 0, width: 1, height: 1 } }],
    });
    const severities = deriveMotionStressCheckSeverities(
      result,
      DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      "hair",
    );
    const projection = projectMotionStressChecksForPublicSurface(
      severities,
      result.details,
    );

    expect(projectMotionStressCheckId("edgeContamination")).toBe(
      "motionStress.protectedArea",
    );
    expect(projection["motionStress.protectedArea"]).not.toBe("pass");
    expect(JSON.stringify(projection)).not.toMatch(/edgeContamination|protectedCropDelta/);
  });

  it("does not create cleanup recommendations from reduced coverage checks", () => {
    const result = {
      kind: "motionStressPreview" as const,
      previewOnly: true as const,
      regionId: "hair",
      scores: {
        protectedCropDelta: 0,
        duplicateContour: 1,
        hiddenReveal: 0,
        edgeContamination: 0,
        restRecompositionDelta: 0,
      },
      details: {
        duplicateContour: {
          mean: 1,
          p95: 1,
          max: 1,
          affectedPixelRatio: 1,
          coverageReduced: true as const,
        },
      },
      thresholdPolicyHash: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2.policyHash,
      warnings: ["duplicateContour"] as const,
      severities: {
        protectedCropDelta: "pass",
        duplicateContour: "warning",
        hiddenReveal: "pass",
        edgeContamination: "pass",
        restRecompositionDelta: "pass",
      },
    };
    const recommendations = createMotionCleanupRecommendations({
      result,
      policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      roleBucket: "hair",
      derivedFromPreviewGeneration: 1,
      editorSessionTargetToken: createEditorSessionTargetToken(
        () => "123e4567-e89b-42d3-a456-426614174000",
      ),
    });

    expect(recommendations).toEqual([]);
  });

  it("creates editor-session cleanup recommendations with private target tokens", () => {
    const result = createMotionStressPreviewResult({
      regionId: "hair",
      sourceComposite: rgba(2, 2),
      previewComposite: rgba(2, 2),
      duplicateContourMask: new Uint8ClampedArray([255, 0, 0, 0]),
    });
    const recommendations = createMotionCleanupRecommendations({
      result,
      policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      roleBucket: "hair",
      derivedFromPreviewGeneration: 2,
      editorSessionTargetToken: createEditorSessionTargetToken(
        () => "123e4567-e89b-42d3-a456-426614174000",
      ),
    });

    expect(recommendations[0]).toMatchObject({
      kind: "reviewDuplicateContourSuppression",
      policyHash: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2.policyHash,
      editorSessionTargetToken:
        "motion-warning-target:123e4567-e89b-42d3-a456-426614174000",
    });
    expect(() =>
      createMotionCleanupRecommendations({
        result,
        policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
        roleBucket: "hair",
        derivedFromPreviewGeneration: 2,
        editorSessionTargetToken: "motion-warning-target:region-hair",
      }),
    ).toThrow(/UUIDv4/);
  });

  it("adds holdout review when duplicate outline fail is near protected regions", () => {
    const result = createMotionStressPreviewResult({
      regionId: "frontHair",
      sourceComposite: rgba(2, 2),
      previewComposite: rgba(2, 2),
      duplicateContourMask: new Uint8ClampedArray([255, 255, 255, 255]),
    });
    const recommendations = createMotionCleanupRecommendations({
      result,
      policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      roleBucket: "hair",
      derivedFromPreviewGeneration: 3,
      editorSessionTargetToken: createEditorSessionTargetToken(
        () => "123e4567-e89b-42d3-a456-426614174000",
      ),
      protectedAreaNearby: true,
    });

    expect(recommendations.map((recommendation) => recommendation.kind)).toEqual(
      expect.arrayContaining(["reduceMotionBudget", "reviewHoldout"]),
    );
  });

  it("creates cleanup comparison options for duplicate outlines", () => {
    const result = createMotionStressPreviewResult({
      regionId: "frontHair",
      sourceComposite: rgba(2, 2),
      previewComposite: rgba(2, 2),
      duplicateContourMask: new Uint8ClampedArray([255, 255, 255, 255]),
    });
    const options = createMotionCleanupComparisonOptions({
      result,
      policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      roleBucket: "hair",
      derivedFromPreviewGeneration: 4,
      editorSessionTargetToken: createEditorSessionTargetToken(
        () => "123e4567-e89b-42d3-a456-426614174000",
      ),
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "none", status: "blocked" }),
        expect.objectContaining({
          kind: "reviewDuplicateContourSuppression",
          status: "preferred",
          reason: "duplicateOutlineLikely",
        }),
        expect.objectContaining({
          kind: "reviewHoldout",
          status: "available",
        }),
      ]),
    );
    expect(JSON.stringify(options)).not.toMatch(/threshold|affectedRegionIds|diagnosticHash/);
  });

  it("compares accepted underpaint and feather holdout for hidden reveal", () => {
    const result = createMotionStressPreviewResult({
      regionId: "tail",
      sourceComposite: rgba(2, 2),
      previewComposite: rgba(2, 2),
      hiddenRevealMask: new Uint8ClampedArray([255, 255, 0, 0]),
    });
    const options = createMotionCleanupComparisonOptions({
      result,
      policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      roleBucket: "tail",
      derivedFromPreviewGeneration: 5,
      editorSessionTargetToken: createEditorSessionTargetToken(
        () => "123e4567-e89b-42d3-a456-426614174000",
      ),
      acceptedUnderpaintAvailable: true,
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "acceptUnderpaintReveal",
          status: "preferred",
          reason: "acceptedUnderpaintAvailable",
        }),
        expect.objectContaining({
          kind: "reviewFeatherHoldout",
          status: "available",
        }),
      ]),
    );
  });

  it("marks no-cleanup as preferred when stress checks are clean", () => {
    const result = createMotionStressPreviewResult({
      regionId: "body",
      sourceComposite: rgba(2, 2),
      previewComposite: rgba(2, 2),
    });
    const options = createMotionCleanupComparisonOptions({
      result,
      policy: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
      roleBucket: "body",
      derivedFromPreviewGeneration: 6,
      editorSessionTargetToken: createEditorSessionTargetToken(
        () => "123e4567-e89b-42d3-a456-426614174000",
      ),
    });

    expect(options).toEqual([
      {
        kind: "none",
        status: "preferred",
        reason: "noStressWarnings",
        severity: undefined,
        regionRoleBucket: "body",
      },
    ]);
  });

  it("rejects registered and structural preview-only data before persistence", () => {
    const result = createMotionStressPreviewResult({
      regionId: "tail",
      sourceComposite: rgba(1, 1),
      previewComposite: rgba(1, 1),
    });

    expect(isMotionStressPreviewResult(result)).toBe(true);
    expect(() => assertNoMotionStressPreviewResult(result)).toThrow(
      /preview-only motion stress/,
    );
    expect(() =>
      assertNoMotionStressPreviewResult({
        kind: "motionStressPreview",
        regionId: "tail",
      }),
    ).toThrow(/preview-only motion stress/);
    expect(() =>
      assertNoMotionStressPreviewResult({ nested: { previewOnly: true } }),
    ).toThrow(/preview-only motion stress/);
    expect(() =>
      assertNoMotionStressPreviewResult({ diagnosticHash: "sha256:v1:test" }),
    ).toThrow(/preview-only motion stress/);
  });

  it("walks error causes and non-enumerable stacks without invoking accessors", () => {
    const result = createMotionStressPreviewResult({
      regionId: "tail",
      sourceComposite: rgba(1, 1),
      previewComposite: rgba(1, 1),
    });
    const error = new Error("failed");
    Object.defineProperty(error, "stack", {
      value: "Error at C:\\Users\\secret\\trace.ts",
      enumerable: false,
    });
    Object.defineProperty(error, "danger", {
      get() {
        throw new Error("accessor should not run");
      },
      enumerable: true,
    });
    (error as Error & { cause?: unknown }).cause = { result };

    expect(() => assertNoMotionStressPreviewResult(error)).toThrow(
      /preview-only motion stress/,
    );

    const sanitized = sanitizeMotionStressErrorForPublicSurface(error);
    expect(sanitized).toEqual({
      name: "Error",
      message: "failed",
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/Users|trace|motionStressPreview/);
  });

  it("terminates on circular error cause chains", () => {
    const error = new Error("cycle");
    (error as Error & { cause?: unknown }).cause = error;

    expect(() => assertNoMotionStressPreviewResult(error)).not.toThrow();
    expect(sanitizeMotionStressErrorForPublicSurface(error).message).toBe("cycle");
  });

  it("persists only user-accepted scalar motion budgets", () => {
    const adjustment = createPersistedMotionBudgetAdjustment({
      regionId: "hair-side",
      acceptedAt: "2026-05-18T00:00:00.000Z",
      randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
      budget: {
        maxRotationDeg: 8.24,
        maxDisplacementPxRatio: 0.124,
        physicsStrength: 0.37,
      },
    });

    expect(adjustment).toEqual({
      id: "123e4567-e89b-42d3-a456-426614174000",
      regionId: "hair-side",
      acceptedAt: "2026-05-18T00:00:00.000Z",
      budget: {
        maxRotationDeg: 8,
        maxDisplacementPxRatio: 0.12,
        physicsStrength: 0.35,
      },
    });
    expect(JSON.stringify(adjustment)).not.toMatch(/diagnosticHash|sha256|preview/i);
  });

  it("requires UUIDv4 ids, normalized UTC timestamps, and finite budgets", () => {
    const base = {
      regionId: "hair-side",
      acceptedAt: "2026-05-18T00:00:00.000Z",
      randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
      budget: {
        maxRotationDeg: 8,
        maxDisplacementPxRatio: 0.12,
        physicsStrength: 0.35,
      },
    };

    expect(() =>
      createPersistedMotionBudgetAdjustment({
        ...base,
        randomUUID: () => "not-a-uuid",
      }),
    ).toThrow(/UUIDv4/);
    expect(() =>
      createPersistedMotionBudgetAdjustment({
        ...base,
        acceptedAt: "2026-05-18",
      }),
    ).toThrow(/normalized UTC ISO/);
    expect(() =>
      createPersistedMotionBudgetAdjustment({
        ...base,
        budget: { ...base.budget, physicsStrength: Number.NaN },
      }),
    ).toThrow(/finite/);
    expect(() =>
      createPersistedMotionBudgetAdjustment({
        ...base,
        regionId: "",
      }),
    ).toThrow(/region identifier/);
  });
});
