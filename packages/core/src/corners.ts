/**
 * Corner-shape vocabulary (this.i gk37dm5n). A pill's corners can be set to one of a
 * small set of named treatments via the `<EntvizPill>` `corner` prop. Corners are NO
 * LONGER derived from the value's type — the role ICON carries the type cue now — so
 * this is just an explicit, optional style choice. Presentation only; the token → CSS
 * mapping lives in @entviz/react.
 *
 *   - `round` — the default softly-rounded corners.
 *   - `sharp` — square corners.
 *   - `leaf`  — diagonal asymmetry: TL+BR rounded, TR+BL square.
 *
 * All three are per-corner `border-radius`, so the pill's 1px border stays intact.
 */
export const CORNER_TOKENS = ["round", "sharp", "leaf"] as const;

export type CornerToken = (typeof CORNER_TOKENS)[number];
