import type { Page } from "playwright";
import { expect, test } from "../fixtures";

interface TargetViolation {
  identifier: string;
  width: number;
  height: number;
}

async function findUndersizedTargets(window: Page): Promise<TargetViolation[]> {
  return window.evaluate(() => {
    const SELECTOR = 'button, [role="button"], a[href]';
    const MIN_PX = 24;
    const violations: { identifier: string; width: number; height: number }[] = [];

    function isVisible(el: Element): boolean {
      const style = globalThis.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return false;
      // aria-hidden ancestor
      let cur: Element | null = el;
      while (cur) {
        if (cur.getAttribute("aria-hidden") === "true") return false;
        cur = cur.parentElement;
      }
      return true;
    }

    function isInlineTextContext(el: Element): boolean {
      if (el.tagName !== "A") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const inlineParents = new Set(["P", "LI", "SPAN", "H1", "H2", "H3", "H4"]);
      return inlineParents.has(parent.tagName);
    }

    function identifierFor(el: Element): string {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls =
        el.className && typeof el.className === "string"
          ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
          : "";
      const role = el.getAttribute("role");
      const roleAttr = role ? `[role=${role}]` : "";
      const ariaLabel = el.getAttribute("aria-label");
      const labelHint = ariaLabel ? `[aria-label="${ariaLabel.slice(0, 24)}"]` : "";
      return `${tag}${id}${cls}${roleAttr}${labelHint}`;
    }

    const nodes = document.querySelectorAll(SELECTOR);
    for (const el of Array.from(nodes)) {
      if (!isVisible(el)) continue;
      if (isInlineTextContext(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width < MIN_PX || rect.height < MIN_PX) {
        violations.push({
          identifier: identifierFor(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }
    return violations;
  });
}

function countByIdentifier(violations: TargetViolation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    counts[v.identifier] = (counts[v.identifier] ?? 0) + 1;
  }
  return counts;
}

const TARGET_SIZE_BASELINE = {
  initial: 4,
  workspace: 5,
};

test.describe("WCAG 2.2 SC 2.5.8 Target Size (24×24) 列挙", () => {
  test("起動直後: 24px 未満のインタラクティブ要素件数が baseline 以下", async ({
    window,
  }) => {
    await window.waitForLoadState("domcontentloaded");
    await window.waitForTimeout(500);

    const violations = await findUndersizedTargets(window);
    const counts = countByIdentifier(violations);
    if (violations.length > TARGET_SIZE_BASELINE.initial) {
      console.log("[a11y target-size] 起動直後の違反内訳:", counts);
      console.log("[a11y target-size] 件数:", violations.length);
    }
    expect(violations.length).toBeLessThanOrEqual(TARGET_SIZE_BASELINE.initial);
  });

  test("PSD 読み込み後: 24px 未満のインタラクティブ要素件数が baseline 以下", async ({
    window,
    loadTestPsd,
  }) => {
    await loadTestPsd();
    await window.waitForTimeout(500);

    const violations = await findUndersizedTargets(window);
    const counts = countByIdentifier(violations);
    if (violations.length > TARGET_SIZE_BASELINE.workspace) {
      console.log("[a11y target-size] PSD読込後の違反内訳:", counts);
      console.log("[a11y target-size] 件数:", violations.length);
    }
    expect(violations.length).toBeLessThanOrEqual(TARGET_SIZE_BASELINE.workspace);
  });
});
