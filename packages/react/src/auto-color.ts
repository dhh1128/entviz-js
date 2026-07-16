/**
 * Auto-color channel — @entviz/react presentation half (this.i tgowi7go). The pure
 * value→index derivation and the 16-hue palette live in @entviz/core
 * (`autoColorIndex`, `AUTO_COLOR_PALETTE`); here we turn that into a pill background.
 *
 * The tint is a TRANSPARENT `color-mix` over the palette hue, not an opaque color:
 * the host theme's background shows through (~82%), so text contrast is barely
 * affected and the same value reads on light AND dark without a per-theme palette —
 * while the hue still pops enough to catch the eye ("the red ones"). This is a soft
 * pre-filter, never a verification cue.
 */
import { autoColorIndex, AUTO_COLOR_PALETTE } from "@entviz/core";

const TINT_PCT = 18;

/** The pill background for a value's auto-color: a transparent tint of its palette hue. */
export function autoTint(value: string): string {
  const hue = AUTO_COLOR_PALETTE[autoColorIndex(value)];
  return `color-mix(in srgb, ${hue} ${TINT_PCT}%, transparent)`;
}
