import { test, expect } from "@playwright/test";

/**
 * P0 — real layout geometry. The Vitest/jsdom suite fakes getBoundingClientRect to a
 * constant 100x20, so nothing there exercises measured layout. These specs assert the
 * component reacts to real, engine-computed geometry.
 */

const UUID = "550e8400-e29b-41d4-a716-446655440000";

async function widthOf(locator: import("@playwright/test").Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  return box.width;
}

test.describe("geometry", () => {
  test("pill mounts with real, non-zero measured layout", async ({ page }) => {
    await page.goto(`/e2e.html?component=pill&value=${UUID}`);
    const fixture = page.getByTestId("evz-fixture");
    await expect(fixture).toBeVisible();
    const pill = fixture.getByRole("button").first();
    await expect(pill).toBeVisible();
    const w = await widthOf(pill);
    // jsdom's fake would report the constant 100; a real pill for this value is a
    // different, content-driven width. We only assert it is a sane, non-degenerate box.
    expect(w).toBeGreaterThan(0);
  });

  test("collapsed pill width is content-driven — a longer label widens it (real layout)", async ({ page }) => {
    // The collapsed pill is compact chrome sized by its label text + inherited host
    // font (fontSizePt drives the EXPANDED render, not this — see the SVG specs below).
    // A real engine widens the pill for a longer label; jsdom's constant fake would not.
    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=x`);
    const short = await widthOf(page.getByTestId("evz-fixture").getByRole("button").first());

    await page.goto(`/e2e.html?component=pill&value=${UUID}&label=signing-key-2026`);
    const long = await widthOf(page.getByTestId("evz-fixture").getByRole("button").first());

    expect(long).toBeGreaterThan(short);
  });

  test("full <Entviz> renders a real SVG with non-zero dimensions", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&fontSizePt=16`);
    await expect(page.getByTestId("evz-fixture")).toBeVisible();
    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("the entviz SVG grows with fontSizePt", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&fontSizePt=8`);
    const small = await widthOf(page.locator("svg").first());
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&fontSizePt=24`);
    const large = await widthOf(page.locator("svg").first());
    expect(large).toBeGreaterThan(small);
  });
});
