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

  if (isPage(target)) {
    await target.screenshot({ ...options, path: outputPath });
  } else {
    const { fullPage: _fullPage, ...locatorOptions } = options;
    await target.screenshot({ ...locatorOptions, path: outputPath });
  }

  await test.info().attach(name, {
    contentType: "image/png",
    path: outputPath,
  });
}
