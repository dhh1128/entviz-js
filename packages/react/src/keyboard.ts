import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * The WAI-ARIA menu roving-focus key handler, shared by every component with a
 * `role="menu"` dropdown (the `<Entviz>` size/shape/copy toolbar and the
 * `<EntvizPill>` kebab). Each caller supplies `getItems` — how to locate its
 * `[role="menuitem"]` elements — because the pill's menu is PORTALED out of the
 * key event's `currentTarget` while the inline toolbar menus are not. ArrowDown/Up
 * move focus with wraparound; Home/End jump to the first/last item; other keys are
 * left alone so typeahead and Escape still work.
 */
export function onMenuKeyNav(e: ReactKeyboardEvent, getItems: () => HTMLElement[]): void {
  const items = getItems();
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
  else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
}
