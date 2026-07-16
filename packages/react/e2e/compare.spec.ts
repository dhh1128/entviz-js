import { test, expect, type Page } from "@playwright/test";

/**
 * P0 — the compare flow reaches a real verdict in a browser. Order-independent
 * (no seeded rng needed): a reference equal to the value must resolve to a positive
 * verdict via the real comparison engine.
 */

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER = "ffffffff-ffff-4fff-afff-ffffffffffff"; // same 6-cell shape, different content

function count(page: Page, type: string) {
  return page.evaluate((t) => {
    const evz = (window as unknown as { __evz: { counts: Record<string, number> } }).__evz;
    return evz.counts[t] ?? 0;
  }, type);
}
function lastEvent(page: Page, type: string) {
  return page.evaluate((t) => {
    const evz = (window as unknown as { __evz: { events: Array<Record<string, unknown>> } }).__evz;
    const es = evz.events.filter((e) => e.type === t);
    return es[es.length - 1] ?? null;
  }, type);
}

test.describe("compare verdicts (real engine)", () => {
  test("a matching text reference resolves to a positive verdict", async ({ page }) => {
    await page.goto(`/e2e.html?component=compare&value=${UUID}&reference=${UUID}`);
    await expect.poll(() => count(page, "verdict.change")).toBeGreaterThan(0);
    const e = await lastEvent(page, "verdict.change");
    expect(["identical", "no-difference"]).toContain(e!.verdict);
  });

  test("a different reference does not report a positive verdict", async ({ page }) => {
    await page.goto(`/e2e.html?component=compare&value=${UUID}&reference=${OTHER}`);
    await expect.poll(() => count(page, "verdict.change")).toBeGreaterThan(0);
    const e = await lastEvent(page, "verdict.change");
    expect(["identical", "no-difference"]).not.toContain(e!.verdict);
  });
});
