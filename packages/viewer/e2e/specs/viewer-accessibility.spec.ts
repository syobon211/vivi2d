import axe from "axe-core";
import { expect, test, type Page } from "@playwright/test";
import {
  loadFixtureModel,
  openSideSheet,
  setViewerLocale,
  withViewer,
} from "../support/viewer-page";

test("no-model viewer shell has no serious accessibility violations", async () => {
  for (const locale of ["ja", "en"] as const) {
    await withViewer(async ({ page }) => {
      await setViewerLocale(page, locale);
      await openSideSheet(page, "session");
      await expectNoSeriousA11yViolations(page, `no-model/${locale}`);
    });
  }
});

test("loaded model viewer shell has no serious accessibility violations", async () => {
  for (const locale of ["ja", "en"] as const) {
    await withViewer(async ({ page }) => {
      await setViewerLocale(page, locale);
      await loadFixtureModel(page);
      await openSideSheet(page, "input-effects");
      await expectNoSeriousA11yViolations(page, `loaded/${locale}`);
    });
  }
});

async function expectNoSeriousA11yViolations(
  page: Page,
  label: string,
): Promise<void> {
  await page.evaluate(axe.source);
  const results = await page.evaluate(async () => {
    return await (window as unknown as { axe: { run: typeof axe.run } }).axe.run(
      document,
      {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      },
    );
  });
  const violations = results.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious"
  );
  expect(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
    `${label} accessibility violations`,
  ).toEqual([]);
}
