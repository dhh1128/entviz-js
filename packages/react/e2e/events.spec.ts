import { test, expect, type Page } from "@playwright/test";

/**
 * P0/P1 — real toolbar interactions drive the event firehose, and copy writes the
 * REAL clipboard. jsdom fakes clipboard/getBoundingClientRect, so none of this is
 * exercised there. The fixture records every event on window.__evz.
 */

const UUID = "550e8400-e29b-41d4-a716-446655440000";

function lastEvent(page: Page, type: string) {
  return page.evaluate((t) => {
    const evz = (window as unknown as { __evz: { events: Array<Record<string, unknown>> } }).__evz;
    const es = evz.events.filter((e) => e.type === t);
    return es[es.length - 1] ?? null;
  }, type);
}

test.describe("toolbar events (real interactions)", () => {
  test("size ladder emits display.resize with a larger fontSizePt", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&fontSizePt=12&controls=1`);
    await page.getByRole("button", { name: "larger" }).click();
    const e = await lastEvent(page, "display.resize");
    expect(e).not.toBeNull();
    expect(e!.fontSizePt as number).toBeGreaterThan(12);
  });

  test("shape picker emits display.reshape with real cols/rows", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&controls=1`);
    await page.getByRole("button", { name: "shape" }).click();
    const menu = page.getByRole("menu", { name: "shape" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem").first().click();
    const e = await lastEvent(page, "display.reshape");
    expect(e).not.toBeNull();
    expect(e!.cols as number).toBeGreaterThan(0);
    expect(e!.rows as number).toBeGreaterThan(0);
  });

  test("copy value writes the real clipboard and emits copy{ok:true}", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&controls=1`);
    await page.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Copy value" }).click();
    const e = await lastEvent(page, "copy");
    expect(e).not.toBeNull();
    expect(e!.ok).toBe(true);
    // The real system clipboard now holds the value (jsdom's writeText is a no-op stub).
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(UUID);
  });
});
