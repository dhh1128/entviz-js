/**
 * Shared text-size scale for the component chrome.
 *
 * Text is `body` (= the inherited host font size) BY DEFAULT — most strings should
 * simply match the host's running text and set no `fontSize` at all. Deviate ONLY
 * for genuine hierarchy, and when you do, use one of these named steps rather than an
 * ad-hoc per-element magic number, so sizes stay consistent across components.
 *
 *   body   — the default; the host's running-text size. Prose, instructions, buttons.
 *   small  — secondary chrome: panel labels, control text, captions.
 *   fine   — fine print: provenance, hints, footnotes.
 */
export const TEXT = {
  body: "1em",
  small: "0.85em",
  fine: "0.72em",
} as const;
