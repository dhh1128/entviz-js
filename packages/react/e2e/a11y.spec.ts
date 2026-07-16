import { test, expect } from "@playwright/test";

/**
 * P2 — real keyboard/focus in a browser engine. jsdom has no real focus model, so
 * the menu's open-on-ArrowDown, focus-into-menu, and Escape-restores-focus behaviors
 * are only truly exercised here.
 */

const UUID = "550e8400-e29b-41d4-a716-446655440000";

test.describe("keyboard a11y (real focus)", () => {
  test("Actions menu: ArrowDown opens & moves focus in; Escape closes & restores focus", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&controls=1`);
    const kebab = page.getByRole("button", { name: "Actions" });
    await kebab.focus();
    await expect(kebab).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Actions" });
    await expect(menu).toBeVisible();
    // Focus moved into the menu (onto the first item) — a real focus transition.
    await expect(menu.getByRole("menuitem").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(kebab).toBeFocused();
  });

  test("shape menu opens on ArrowDown from its trigger", async ({ page }) => {
    await page.goto(`/e2e.html?component=entviz&value=${UUID}&controls=1`);
    const shapeBtn = page.getByRole("button", { name: "shape" });
    await shapeBtn.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "shape" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
  });
});
