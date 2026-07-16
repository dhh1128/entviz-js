/**
 * Corner-shape channel — @entviz/react presentation half (this.i gk37dm5n). The
 * pure `role -> CornerToken` resolution lives in @entviz/core (`resolveCorner`);
 * here we turn a token into the CSS that shapes the pill body.
 *
 * `round`/`sharp`/`leaf` are per-corner `border-radius`, so the pill's 1px border
 * stays intact on every edge. `bevel` is a `clip-path` chamfer — the two cut edges
 * lose their hairline border, which reads correctly as "a corner was clipped" and
 * is the deliberate ANGULAR contrast to `leaf`'s rounded diagonal.
 */
import type { CSSProperties } from "react";
import type { CornerToken } from "@entviz/core";

// A chamfer that cuts the TR and BL corners (the diagonal OPPOSITE the one `leaf`
// rounds), leaving TL and BR square. clip-path point order, clockwise from TL:
// TL, (top edge before TR), (right edge after TR) → cuts TR, BR, (bottom before BL),
// (left above BL) → cuts BL.
const BEVEL_TR_BL =
  "polygon(0 0, calc(100% - 0.5em) 0, 100% 0.5em, 100% 100%, 0.5em 100%, 0 calc(100% - 0.5em))";

// A triangular bite into the middle of the LEADING (left) edge — a keyed/seal look.
// Clockwise: full top+right+bottom, then up the left edge, in to the point, back out.
const NOTCH_LEFT =
  "polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 calc(50% + 0.35em), 0.5em 50%, 0 calc(50% - 0.35em))";

// The two LEADING corners clipped to a point, so the left edge is a leftward chevron
// (a tag / "points somewhere" look). TL and BL pull in to 0.5em; the left-mid is the tip.
const ARROW_LEFT = "polygon(0.5em 0, 100% 0, 100% 100%, 0.5em 100%, 0 50%)";

/** The CSS that shapes the pill body for a corner token. `round` keeps threading the
 *  themeable `--entviz-pill-radius` var so an unconfigured pill is unchanged. */
export function cornerStyle(token: CornerToken): CSSProperties {
  switch (token) {
    case "sharp":
      return { borderRadius: "0" };
    case "leaf":
      // border-radius shorthand is TL TR BR BL: round TL + BR, square TR + BL.
      return { borderRadius: "0.5em 0 0.5em 0" };
    case "bevel":
      return { borderRadius: "0", clipPath: BEVEL_TR_BL };
    case "notch":
      return { borderRadius: "0", clipPath: NOTCH_LEFT };
    case "arrow":
      return { borderRadius: "0", clipPath: ARROW_LEFT };
    case "round":
    default:
      return { borderRadius: "var(--entviz-pill-radius, 0.5em)" };
  }
}
