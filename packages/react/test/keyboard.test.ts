import { afterEach, describe, expect, test, vi } from "vitest";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { onMenuKeyNav } from "../src/keyboard.ts";

// Three focusable menu items in a detached DOM; document.activeElement tracks focus.
function makeItems(n = 3): HTMLElement[] {
  return Array.from({ length: n }, () => {
    const b = document.createElement("button");
    document.body.appendChild(b);
    return b;
  });
}
afterEach(() => {
  document.body.replaceChildren();
});

const keyEvent = (key: string) => {
  const preventDefault = vi.fn();
  return { evt: { key, preventDefault } as unknown as ReactKeyboardEvent, preventDefault };
};

describe("onMenuKeyNav (shared ARIA menu roving focus)", () => {
  test("ArrowDown moves to the next item and wraps; ArrowUp moves back and wraps", () => {
    const items = makeItems(3);
    items[0].focus();
    const down = keyEvent("ArrowDown");
    onMenuKeyNav(down.evt, () => items);
    expect(document.activeElement).toBe(items[1]);
    expect(down.preventDefault).toHaveBeenCalled();

    items[2].focus();
    onMenuKeyNav(keyEvent("ArrowDown").evt, () => items); // wraps to first
    expect(document.activeElement).toBe(items[0]);

    onMenuKeyNav(keyEvent("ArrowUp").evt, () => items); // wraps to last
    expect(document.activeElement).toBe(items[2]);
  });

  test("Home focuses the first item, End the last", () => {
    const items = makeItems(3);
    items[1].focus();
    onMenuKeyNav(keyEvent("Home").evt, () => items);
    expect(document.activeElement).toBe(items[0]);
    onMenuKeyNav(keyEvent("End").evt, () => items);
    expect(document.activeElement).toBe(items[2]);
  });

  test("an unrelated key is ignored (no preventDefault, focus unchanged)", () => {
    const items = makeItems(2);
    items[0].focus();
    const other = keyEvent("a");
    onMenuKeyNav(other.evt, () => items);
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(items[0]);
  });
});
