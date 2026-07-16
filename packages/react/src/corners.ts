/**
 * Corner-shape — @entviz/react presentation half (this.i gk37dm5n). The vocabulary is in
 * @entviz/core (`CORNER_TOKENS`); here we turn a token into a CSS `border-radius` for the
 * pill body. Border-radius only, so the pill's 1px border stays intact on every edge.
 * Corners are an explicit, optional style (the `corner` prop) — no longer keyed to type.
 */
import type { CSSProperties } from "react";
import type { CornerToken } from "@entviz/core";

/** The CSS that shapes the pill body for a corner token. `round` keeps threading the
 *  themeable `--entviz-pill-radius` var so an unconfigured pill is unchanged. */
export function cornerStyle(token: CornerToken): CSSProperties {
  switch (token) {
    case "sharp":
      return { borderRadius: "0" };
    case "leaf":
      // border-radius shorthand is TL TR BR BL: round TL + BR, square TR + BL.
      return { borderRadius: "0.5em 0 0.5em 0" };
    case "round":
    default:
      // A large radius so the ends read as half-circles (a capsule), not a blunted rect.
      return { borderRadius: "var(--entviz-pill-radius, 999px)" };
  }
}
