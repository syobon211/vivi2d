import type { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "playwright";

type VisualTarget = Locator | Page;

type VisualSnapshotOptions = {
  animations?: "allow" | "disabled";
  caret?: "hide" | "initial";
  fullPage?: boolean;
  mask?: Locator[];
  maskColor?: string;
  omitBackground?: boolean;
  scale?: "css" | "device";
  timeout?: number;
};

const COMPARE_BASELINES = process.env.VIVI2D_COMPARE_VISUAL_BASELINES === "1";

function isPage(target: VisualTarget): target is Page {
  return "viewportSize" in target;
}

export async function expectVisualSnapshot(
  target: VisualTarget,
  name: string,
  options: VisualSnapshotOptions = {},
): Promise<void> {
  if (COMPARE_BASELINES) {
    if (isPage(target)) {
      await expect(target).toHaveScreenshot(name, options);
    } else {
      await expect(target).toHaveScreenshot(name, options);
    }
    return;
  }

  const outputPath = test.info().outputPath("visual-captures", name);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const captureOptions = {
    animations: "disabled" as const,
    caret: "hide" as const,
    ...options,
  };

  if (isPage(target)) {
    await target.screenshot({ ...captureOptions, path: outputPath });
  } else {
    const { fullPage: _fullPage, ...locatorOptions } = captureOptions;
    await target.screenshot({ ...locatorOptions, path: outputPath });
  }

  await test.info().attach(name, {
    contentType: "image/png",
    path: outputPath,
  });
}

export async function expectVisualBufferSnapshot(
  image: Buffer,
  name: string,
): Promise<void> {
  if (COMPARE_BASELINES) {
    expect(image).toMatchSnapshot(name);
    return;
  }

  const outputPath = test.info().outputPath("visual-captures", name);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, image);
  await test.info().attach(name, {
    body: image,
    contentType: "image/png",
  });
}
