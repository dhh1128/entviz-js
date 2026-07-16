/**
 * Colorbar icon — @entviz/react (this.i wn3r6aex). The corpus-only, value-derived pill
 * icon that REPLACES the constant 2×2 badge under a `posture:"corpus"` TrustAssumption
 * with `icon:true`. It is a faithful MINI of the entviz's own colorbar, in the same slot
 * as the badge: a vertical bar the SAME WIDTH the colorbar has in the visualization
 * (`barWidth = 2·boxHeight = 1.25·fontSize`, i.e. 1.25em), filling the pill height, with
 * the bands stacked top→bottom at heights ∝ count⁴ (the viz's dominance function) and the
 * two gutter markers as opaque white discs + black halo (exactly as the viz draws them).
 * Because it draws the actual colorbar data (a rich fingerprint projection), it is
 * independent of the auto-color tint (a single fingerprint byte).
 *
 * SECURITY: strictly a *difference detector* (rule-out, never rule-in), and visually
 * distinct from the constant 2×2 badge (a banded vertical bar vs. a square grid), so a
 * constant badge and a derived icon are never confused. It only ever appears in corpus.
 */
import { createElement as h, type ReactNode } from "react";
import type { ChannelDescription } from "@entviz/core";

export interface IconGeometry {
  /** Bands along the bar's (vertical) main axis, normalized to [0,1]: `pos` start,
   *  `len` length, `color`. */
  bands: { color: string; pos: number; len: number }[];
  /** The two markers as slot-centered fractions in [0,1] along the same axis. */
  marks: number[];
}

/** Pure layout mirroring the entviz colorbar: band lengths ∝ count⁴ (its dominance
 *  function, so one band usually fills most of the bar), cumulative `pos`; the two
 *  gutter markers as slot-centered fractions. Degenerate input stays finite. */
export function colorbarIconGeometry(
  bands: { color: string; count: number }[],
  markers: { slots: number; left: number; right: number },
): IconGeometry {
  const weights = bands.map((b) => b.count ** 4);
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let pos = 0;
  const outBands = bands.map((b, i) => {
    const len = weights[i] / total;
    const seg = { color: b.color, pos, len };
    pos += len;
    return seg;
  });
  const mark = (i: number) => (markers.slots > 0 ? (i + 0.5) / markers.slots : 0.5);
  return { bands: outBands, marks: [mark(markers.left), mark(markers.right)] };
}

// A square viewBox stretched (preserveAspectRatio:none) to the icon's box — 1.25em wide
// × the pill's height — so the bar fills the leading cap like the badge did. The two
// markers ride near the left/right edges as opaque white+black discs.
const VB = 40;
const DISC_R = 6;
const DISC_PAD = 7; // keep marker discs off the top/bottom edges
const MARK_L = 8;
const MARK_R = VB - 8;

/** Render the colorbar icon SVG for a value's channel description. */
export function colorbarIcon(channels: ChannelDescription): ReactNode {
  const g = colorbarIconGeometry(channels.colorBarBands, channels.markers.colorBar);
  const bands = g.bands.map((b, i) =>
    h("rect", { key: `b${i}`, x: 0, y: b.pos * VB, width: VB, height: b.len * VB, fill: b.color }),
  );
  const disc = (frac: number, cx: number, key: string) =>
    h("circle", {
      key,
      cx,
      cy: DISC_PAD + frac * (VB - 2 * DISC_PAD),
      r: DISC_R,
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 2.5,
    });
  return h(
    "svg",
    {
      "aria-hidden": true,
      "data-evz-pill-icon": "colorbar",
      viewBox: `0 0 ${VB} ${VB}`,
      preserveAspectRatio: "none",
      style: {
        // Fills its (absolutely-positioned) leading-cap wrapper, which the pill sizes to
        // the viz's colorbar width (~1.25em) × the full pill height.
        width: "100%",
        height: "100%",
        display: "block",
      },
    },
    ...bands,
    disc(g.marks[0], MARK_L, "mL"),
    disc(g.marks[1], MARK_R, "mR"),
  );
}
