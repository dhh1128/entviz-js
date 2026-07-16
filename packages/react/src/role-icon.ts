/**
 * Role glyph — @entviz/react. A small monochrome icon for the value's semantic `role`
 * (key / signature / digest / address / identifier, and `raw` for an unknown role),
 * shown on the pill's TRAILING edge (after the kebab). It encodes the TYPE the pill
 * already discloses as text — so it's un-gated (no value-identity bits) and appears in
 * every posture. `stroke="currentColor"`, so it adapts to the host theme like the rest
 * of the chrome (no fonts, no palette — the library's ethos).
 *
 * Icons are Lucide (ISC license — see NOTICE), vendored as their inner path data so
 * there is no runtime dependency.
 */
import { createElement as h, type ReactNode } from "react";
import type { Role } from "@entviz/core";

type SvgChild = [tag: string, attrs: Record<string, string | number>];

// Vendored Lucide inner geometry, 24×24 viewBox. key · signature · hash · link ·
// at-sign (handle/mention) · binary (ones & zeros).
const ROLE_ICON: Record<Role | "raw", SvgChild[]> = {
  key: [
    ["path", { d: "m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" }],
    ["path", { d: "m21 2-9.6 9.6" }],
    ["circle", { cx: 7.5, cy: 15.5, r: 5.5 }],
  ],
  signature: [
    ["path", { d: "m21 17-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284" }],
    ["path", { d: "M3 21h18" }],
  ],
  digest: [
    ["line", { x1: 4, x2: 20, y1: 9, y2: 9 }],
    ["line", { x1: 4, x2: 20, y1: 15, y2: 15 }],
    ["line", { x1: 10, x2: 8, y1: 3, y2: 21 }],
    ["line", { x1: 16, x2: 14, y1: 3, y2: 21 }],
  ],
  address: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
  ],
  identifier: [
    ["circle", { cx: 12, cy: 12, r: 4 }],
    ["path", { d: "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" }],
  ],
  raw: [
    ["rect", { x: 14, y: 14, width: 4, height: 6, rx: 2 }],
    ["rect", { x: 6, y: 4, width: 4, height: 6, rx: 2 }],
    ["path", { d: "M6 20h4" }],
    ["path", { d: "M14 10h4" }],
    ["path", { d: "M6 14h2v6" }],
    ["path", { d: "M14 4h2v6" }],
  ],
};

/** The role bucket a glyph is keyed by: the closed `role` enum, `null` → `"raw"`. */
export function roleIconKey(role: Role | null): Role | "raw" {
  return role ?? "raw";
}

/** The trailing role glyph. Monochrome `currentColor`, sized in `em` so it tracks the
 *  pill's text; `aria-hidden` (the role is already in the accessible name). */
export function RoleGlyph({ role, size = "1.05em" }: { role: Role | null; size?: string }): ReactNode {
  const key = roleIconKey(role);
  return h(
    "svg",
    {
      "aria-hidden": true,
      "data-evz-role-icon": key,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { flex: "0 0 auto", display: "block" },
    },
    ...ROLE_ICON[key].map(([tag, attrs], i) => h(tag, { key: i, ...attrs })),
  );
}
