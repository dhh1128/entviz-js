import { test, expect, type Page } from "@playwright/test";

/**
 * Long-label overflow (this.i k7pq2mzv) and the ⋮-menu locate entry (lc4ktz6n), in a
 * real engine. jsdom fakes the scrollWidth/clientWidth measurement these features rest
 * on; here Chromium computes it.
 */

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const CESR = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
const LONG = "rosa-iqbal-claims-adjuster-northgate-mutual";

const label = (page: Page) => page.locator(".entviz-pill__label");
const running = (page: Page) => label(page).evaluate((e) => e.getAnimations({ subtree: true }).length);
const body = (page: Page) => page.locator(".entviz-pill__body");

async function right(page: Page, sel: string): Promise<number> {
  return page.locator(sel).evaluate((el) => el.getBoundingClientRect().right);
}

test.describe("pill label overflow", () => {
  test("a long label truncates with an ellipsis inside maxWidth; kebab and role icon stay in", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=${LONG}&maxWidth=12em`);
    const el = label(page);
    await expect(el).toHaveAttribute("data-truncated", "");
    const m = await el.evaluate((e) => ({
      sw: e.scrollWidth, cw: e.clientWidth, to: getComputedStyle(e).textOverflow,
    }));
    expect(m.sw).toBeGreaterThan(m.cw);
    expect(m.to).toBe("ellipsis");
    const bodyRight = await right(page, ".entviz-pill__body");
    // The kebab (hidden by opacity until hover, but laid out) and the trailing role icon
    // both sit inside the clipped body.
    expect(await right(page, ".entviz-pill__kebab")).toBeLessThanOrEqual(bodyRight);
    const glyphRight = await page
      .locator(".entviz-pill__kebab + span")
      .evaluate((e) => e.getBoundingClientRect().right);
    expect(glyphRight).toBeLessThanOrEqual(bodyRight);
    await expect(page.getByRole("button", { name: /view visualization/i })).toHaveAttribute("title", `${LONG}\n${UUID}`);
  });

  test("hover scrolls the truncated label THROUGH intermediate positions, and leaving stops it", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=${LONG}&maxWidth=12em`);
    const el = label(page);
    const over = await el.evaluate((e) => e.scrollWidth - e.clientWidth);
    await body(page).hover();
    // A discrete animation (the Brave failure: a var()-based keyframe) jumps 0 → end with
    // nothing between. Sample the rendered text position and require several in-between values.
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const x = await el.evaluate((e) => {
        const r = document.createRange(); r.selectNodeContents(e);
        return Math.round(r.getBoundingClientRect().left - e.getBoundingClientRect().left);
      });
      if (x < -1 && x > -over + 1) seen.add(x);
      await page.waitForTimeout(100);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    await page.mouse.move(0, 0);
    await expect.poll(() => running(page)).toBe(0);
    expect(await el.evaluate((e) => getComputedStyle(e.querySelector(".entviz-pill__label-text")!).transform)).toBe("none");
  });

  test("the scroll reaches the end: the last character is shown", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=${LONG}&maxWidth=12em`);
    const el = label(page);
    await body(page).hover();
    await expect.poll(() => el.evaluate((e) => {
      const r = document.createRange(); r.selectNodeContents(e);
      return Math.abs(r.getBoundingClientRect().right - e.getBoundingClientRect().right);
    }), { timeout: 10_000 }).toBeLessThan(1.5);
  });

  test("textOverflow=clip: no ellipsis, still scrolls", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=${LONG}&maxWidth=12em&textOverflow=clip`);
    const el = label(page);
    expect(await el.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("clip");
    await body(page).hover();
    await expect.poll(() => running(page)).toBe(1);
  });

  test("keyboard focus scrolls it too", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=${LONG}&maxWidth=12em`);
    await page.getByRole("button", { name: /view visualization/i }).focus();
    await expect.poll(() => running(page)).toBe(1);
  });

  test("a label that fits does not scroll", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=rosa&maxWidth=12em`);
    const el = label(page);
    await expect(el).not.toHaveAttribute("data-truncated", "");
    await body(page).hover();
    expect(await running(page)).toBe(0);
  });

  test("reduced motion: no animation; focus wraps the label so all of it shows", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=${LONG}&maxWidth=12em`);
    const el = label(page);
    const h0 = await el.evaluate((e) => e.getBoundingClientRect().height);
    await body(page).hover();
    await page.waitForTimeout(300);
    expect(await running(page)).toBe(0);
    await page.getByRole("button", { name: /view visualization/i }).focus();
    await expect.poll(() => el.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(h0 * 1.5);
    expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    // …and it stays wrapped: re-measuring must not flip it back to one line.
    await page.waitForTimeout(300);
    expect(await el.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(h0 * 1.5);
    await expect(el).toHaveAttribute("data-truncated", "");
  });
});

test.describe("pill mnemonic fitting", () => {
  const url = (maxWidth: string) => `/e2e.html?component=pill&value=${CESR}&posture=corpus&maxWidth=${maxWidth}`;

  test("ample room: full size", async ({ page }) => {
    await page.goto(url("40em"));
    await expect(label(page)).toHaveClass(/entviz-pill__label--mnemonic/);
    expect(await label(page).evaluate((e) => e.style.fontSize)).toBe("");
  });

  test("slightly too narrow: 85%, whole", async ({ page }) => {
    await page.goto(url("40em"));
    // maxWidth bounds the body's CONTENT box, so start from its computed width.
    const full = await body(page).evaluate((e) => parseFloat(getComputedStyle(e).width));
    const labelW = await label(page).evaluate((e) => e.getBoundingClientRect().width);
    // Take away about 8% of the label's width: too tight at 100%, enough at 85%.
    await page.goto(url(`${Math.floor(full - labelW * 0.08)}px`));
    const el = label(page);
    await expect(el).toHaveClass(/entviz-pill__label--mnemonic/);
    expect(await el.evaluate((e) => e.style.fontSize)).toBe("85%");
    expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  });

  test("far too narrow: dropped, the type text takes the slot", async ({ page }) => {
    await page.goto(url("7em"));
    await expect(page.locator(".entviz-pill__label--mnemonic")).toHaveCount(0);
    await expect(page.locator(".entviz-pill__type")).toHaveText("cesr");
  });
});

test.describe("⋮ menu locate entry", () => {
  test("Find other occurrences… fires the locate event from the menu", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}&locate`);
    await body(page).hover();
    await page.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Find other occurrences…" }).click();
    expect(await page.evaluate(() => window.__evz.counts["locate"] ?? 0)).toBe(1);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
