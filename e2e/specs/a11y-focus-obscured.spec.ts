import type { Page } from "playwright";
import { expect, test } from "../fixtures";


interface FocusObscuredViolation {
  focused: string;
  covering: string;
}

async function findObscuredFocusables(window: Page): Promise<FocusObscuredViolation[]> {
  return window.evaluate(() => {
    const SELECTOR =
      'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const violations: { focused: string; covering: string }[] = [];

    function isVisible(el: Element): boolean {
      const style = globalThis.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return false;
      let cur: Element | null = el;
      while (cur) {
        if (cur.getAttribute("aria-hidden") === "true") return false;
        cur = cur.parentElement;
      }
      return true;
    }

    function isOpaque(el: Element): boolean {
      const style = globalThis.getComputedStyle(el);
      if (style.pointerEvents === "none") return false;
      const opacity = Number.parseFloat(style.opacity || "1");
      if (Number.isFinite(opacity) && opacity < 0.5) return false;
      return true;
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

    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    const nodes = document.querySelectorAll(SELECTOR);
    for (const el of Array.from(nodes)) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= vw || rect.top >= vh)
        continue;

      const cx = Math.floor(rect.left + rect.width / 2);
      const cy = Math.floor(rect.top + rect.height / 2);
      if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) continue;

      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      if (top === el) continue;
      if (el.contains(top)) continue;
      if (top.contains(el)) continue;

      if (!isOpaque(top)) continue;

      violations.push({
        focused: identifierFor(el),
        covering: identifierFor(top),
      });
    }
    return violations;
  });
}

function countByFocused(
  violations: FocusObscuredViolation[],
): Record<string, { count: number; covering: string }> {
  const counts: Record<string, { count: number; covering: string }> = {};
  for (const v of violations) {
    const cur = counts[v.focused];
    if (cur) {
      cur.count += 1;
    } else {
      counts[v.focused] = { count: 1, covering: v.covering };
    }
  }
  return counts;
}

const FOCUS_OBSCURED_BASELINE = {
  initial: 0,
  workspace: 2,
};

test.describe("WCAG 2.2 SC 2.4.11 Focus Not Obscured (中心遮蔽) 列挙", () => {
  test("起動直後: 中心が遮蔽された focusable 件数が baseline 以下", async ({
    window,
  }) => {
    await window.waitForLoadState("domcontentloaded");
    await window.waitForTimeout(500);

    const violations = await findObscuredFocusables(window);
    const counts = countByFocused(violations);
    if (violations.length > FOCUS_OBSCURED_BASELINE.initial) {
      console.log("[a11y focus-obscured] 起動直後の違反内訳:", counts);
      console.log("[a11y focus-obscured] 件数:", violations.length);
    }
    expect(violations.length).toBeLessThanOrEqual(FOCUS_OBSCURED_BASELINE.initial);
  });

  test("PSD 読み込み後: 中心が遮蔽された focusable 件数が baseline 以下", async ({
    window,
    loadTestPsd,
  }) => {
    await loadTestPsd();
    await window.waitForTimeout(500);

    const violations = await findObscuredFocusables(window);
    const counts = countByFocused(violations);
    if (violations.length > FOCUS_OBSCURED_BASELINE.workspace) {
      console.log("[a11y focus-obscured] PSD読込後の違反内訳:", counts);
      console.log("[a11y focus-obscured] 件数:", violations.length);
    }
    expect(violations.length).toBeLessThanOrEqual(FOCUS_OBSCURED_BASELINE.workspace);
  });
});
