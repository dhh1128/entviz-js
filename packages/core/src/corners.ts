/**
 * Corner-shape channel (this.i gk37dm5n). The pill's corner geometry encodes the
 * value's semantic `role` — signature vs. digest vs. key vs. address vs. identifier —
 * so a scanner of a homogeneous stream (e.g. a KERI KEL) can tell CATEGORIES apart
 * at a glance. This is deliberately UN-GATED by the trust posture: the corner
 * derives from the type entviz already discloses as trusted pill text, not from the
 * value, so it leaks no identity bits and an attacker cannot forge it without
 * actually producing a value of that role.
 *
 * This module is the PURE, DOM-free half: resolve `role` (null normalized to
 * "raw") against a host-supplied {@link CornerMap} to a curated {@link CornerToken}.
 * The token -> CSS geometry mapping is the @entviz/react layer's concern (corners
 * are presentation), keeping @entviz/core isomorphic.
 */
import type { Role } from "./characterize.ts";

/**
 * The curated vocabulary of corner treatments. Deliberately small and NAMED
 * (not raw radii) so a host can't mint dozens of confusable shapes — the same
 * "small legible vocabulary" discipline the icon/color channels follow. Chosen for
 * mutual DISTINCTIVENESS at pill size (the channel's whole job is telling categories
 * apart): radius magnitude barely reads on a short pill, so the axes that carry the
 * signal are round-vs-angular and diagonal asymmetry.
 *   - `round`  — the default softly-rounded corners (today's pill look).
 *   - `sharp`  — square corners, no radius ("angular", all four corners).
 *   - `leaf`   — diagonal asymmetry, ROUNDED: the TL+BR corners rounded, TR+BL square.
 *   - `bevel`  — diagonal asymmetry, ANGULAR: the OTHER diagonal (TR+BL) chamfered
 *               ("a corner was clipped"), TL+BR square — the angular contrast to `leaf`.
 *   - `notch`  — a triangular bite cut into the middle of the LEADING edge (under the
 *               badge/icon) — a keyed/seal look.
 *   - `arrow`  — the two LEADING corners clipped to a point, so the leading edge is a
 *               leftward chevron (a tag / "points somewhere" look).
 * `round`/`sharp`/`leaf` are per-corner `border-radius` (border stays intact);
 * `bevel`/`notch`/`arrow` use a `clip-path` (the cut edges lose their hairline border,
 * which reads correctly as a deliberate cut).
 */
export const CORNER_TOKENS = ["round", "sharp", "leaf", "bevel", "notch", "arrow"] as const;

export type CornerToken = (typeof CORNER_TOKENS)[number];

/** The lookup key: the closed `role` enum, plus `"raw"` for a null role (a value
 *  entviz recognized but for which it asserts no semantic category). */
export type CornerKey = Role | "raw";

/**
 * A host's mapping from semantic category to corner treatment. Partial by design —
 * a host maps only the 2–5 categories it cares about and lets the rest fall through
 * to `default`. Kept as its own shareable object (not folded into the trust policy),
 * since one shape vocabulary may span both trusted and foreign pills.
 */
export type CornerMap = Partial<Record<CornerKey, CornerToken>> & {
  default?: CornerToken;
};

/** The built-in fallback when a CornerMap supplies neither a matching entry nor a
 *  `default`: the pill's current softly-rounded look, so an unconfigured pill is
 *  unchanged. */
export const DEFAULT_CORNER: CornerToken = "round";

/**
 * A sensible, ready-to-use `role → corner` map — a full BIJECTION: all five roles
 * plus the `raw` (null-role) bucket map to six DISTINCT shapes, so every category is
 * visually separable out of the box. Hosts can use it directly or as a starting point.
 *   identifier → round · raw → sharp · signature → leaf · key → bevel ·
 *   digest → notch · address → arrow
 */
export const DEFAULT_CORNER_MAP: CornerMap = {
  identifier: "round",
  raw: "sharp",
  signature: "leaf",
  key: "bevel",
  digest: "notch",
  address: "arrow",
  default: "round",
};

/**
 * Resolve a value's `role` (null → `"raw"`) against a {@link CornerMap} to a
 * {@link CornerToken}. Total: an explicit entry wins, else `default`, else the
 * built-in {@link DEFAULT_CORNER} — never `undefined`.
 */
export function resolveCorner(role: Role | null, map: CornerMap): CornerToken {
  const key: CornerKey = role ?? "raw";
  return map[key] ?? map.default ?? DEFAULT_CORNER;
}
