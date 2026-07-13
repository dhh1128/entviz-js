/**
 * Text-signal calibration (NOT shipped). Question: can a CRUDE, no-OCR per-nucleus
 * text signal separate "same token, foreign font/size" from "different token"?
 *
 * We sample a fine ink grid inside each nucleus (only two colors there: the fill =
 * nucleusColor, and the glyph ink) and derive several PROJECTION signatures, each
 * normalized to SHAPE (unit sum) so the overall ink amount — which the earlier pass
 * showed is font-variable AND non-discriminating — is divided out:
 *   cov   : total ink coverage |Δ|            (baseline; known weak)
 *   row3  : ink per horizontal third (asc / x-body / desc), normalized, L1
 *   ad    : ascender/descender ink ratio  top/(top+bot), middle third dropped  (|Δ|)
 *   colN  : ink per vertical slice, N = our token's char count, normalized, L1
 *   grid  : soft 8×4 ink-fraction grid, normalized, L1
 * "ours" is fixed (SAME/mono/420); "reference" varies value×font×size (a simulated
 * screenshot). Same-token rows should score LOW, different-token HIGH; the winning
 * metric maximizes that gap AND holds when the reference font is not our mono.
 */
import { render, describeChannels } from "@entviz/core";

// Multiple same-shape (SAME, DIFF) pairs — confirm the winning metric generalizes
// across values AND shapes (hex-64 grids of 11 nuclei, and 6-nucleus UUIDs).
const PAIRS: [string, string, string][] = [
  ["hexA", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"],
  ["hexB", "deadbeefcafebabe00112233445566778899aabbccddeeff0f1e2d3c4b5a69788", "1234abcd5678ef900fedcba987654321aabbccdd112233445566778899aabbcc0"],
  ["hexC", "ffffffffffffffffffffffffffffffff00000000000000000000000000000000", "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5aa5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5"],
  ["uuid", "550e8400-e29b-41d4-a716-446655440000", "ffffffff-ffff-4fff-afff-ffffffffffff"],
];

type RGB = [number, number, number];
const hexRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const near = (a: RGB, b: RGB, tol: number) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
interface Ras { rgba: Uint8ClampedArray; w: number; h: number }
const px = (r: Ras, x: number, y: number): RGB => { const cx = Math.max(0, Math.min(r.w - 1, x | 0)), cy = Math.max(0, Math.min(r.h - 1, y | 0)); const i = (cy * r.w + cx) * 4; return [r.rgba[i], r.rgba[i + 1], r.rgba[i + 2]]; };
const withFont = (svg: string, font: string | null) => font === null ? svg : svg.replace(/font-family="[^"]*"/, `font-family="${font}"`);

function rasterize(svg: string, W: number): Promise<Ras> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("decode failed"));
    img.onload = () => {
      const w = W, h = Math.round(W * ((img.naturalHeight || 1) / (img.naturalWidth || 1)));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve({ rgba: ctx.getImageData(0, 0, w, h).data, w, h });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

const INK_TOL = 60, GX = 24, GY = 12;

// Fine ink grid (GY×GX, 1=ink) over the central text band of one nucleus.
function inkGrid(r: Ras, rect: { x: number; y: number; w: number; h: number }, viewW: number, fill: RGB): number[] {
  const s = r.w / viewW;
  const x0 = (rect.x + rect.w * 0.12) * s, x1 = (rect.x + rect.w * 0.88) * s;
  const y0 = (rect.y + rect.h * 0.22) * s, y1 = (rect.y + rect.h * 0.78) * s;
  const g: number[] = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const sx = x0 + ((gx + 0.5) / GX) * (x1 - x0), sy = y0 + ((gy + 0.5) / GY) * (y1 - y0);
    g.push(near(px(r, sx, sy), fill, INK_TOL) ? 0 : 1);
  }
  return g;
}
const norm = (v: number[]) => { const s = v.reduce((a, b) => a + b, 0) || 1; return v.map((x) => x / s); };
const l1 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

// Derive the projection signatures from a fine ink grid.
function signatures(g: number[], slices: number) {
  const rows: number[] = []; for (let y = 0; y < GY; y++) rows.push(mean(g.slice(y * GX, y * GX + GX)));
  const cols: number[] = []; for (let x = 0; x < GX; x++) { let s = 0; for (let y = 0; y < GY; y++) s += g[y * GX + x]; cols.push(s / GY); }
  const band = (a: number, b: number) => mean(rows.slice(Math.round(a * GY), Math.round(b * GY)));
  const row3 = norm([band(0, 1 / 3), band(1 / 3, 2 / 3), band(2 / 3, 1)]);
  const top = band(0, 1 / 3), bot = band(2 / 3, 1); const ad = top / ((top + bot) || 1);
  const colN = norm(Array.from({ length: slices }, (_, k) => mean(cols.slice(Math.round(k / slices * GX), Math.round((k + 1) / slices * GX)))));
  const grid: number[] = [];
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 8; bx++) { let s = 0, n = 0; for (let y = (by * GY / 4) | 0; y < ((by + 1) * GY / 4) | 0; y++) for (let x = (bx * GX / 8) | 0; x < ((bx + 1) * GX / 8) | 0; x++) { s += g[y * GX + x]; n++; } grid.push(n ? s / n : 0); }
  return { cov: mean(g), row3, ad, colN, grid: norm(grid) };
}

const FONTS: [string, string | null][] = [["mono", null], ["serif", "Georgia,'Times New Roman',serif"], ["sans", "Arial,Helvetica,sans-serif"]];
const SIZES = [420, 200, 840];
const GRID_MISMATCH = 0.5; // per-nucleus: grid L1 above this = this nucleus's text disagrees

// Distances (ours vs one reference config) for every metric, per nucleus.
async function distances(oursSig: ReturnType<typeof signatures>[], filled: { index: number; nucleusColor: string | null }[], slots: number[], viewW: number, V: string, font: string | null, W: number) {
  const rm = describeChannels(V, {}); const rf = rm.cells.filter((c) => !c.blank);
  const rr = await rasterize(withFont(render(V), font), W);
  const d = { cov: [] as number[], row3: [] as number[], colN: [] as number[], grid: [] as number[] };
  for (let i = 0; i < filled.length; i++) {
    const sig = signatures(inkGrid(rr, rm.geometry.cellRects[rf[i].index], viewW, hexRgb(rf[i].nucleusColor as string)), slots[i]);
    d.cov.push(Math.abs(sig.cov - oursSig[i].cov));
    d.row3.push(l1(sig.row3, oursSig[i].row3));
    d.colN.push(l1(sig.colN, oursSig[i].colN));
    d.grid.push(l1(sig.grid, oursSig[i].grid));
  }
  return d;
}

(async () => {
  const out = document.getElementById("out")!;
  try {
    const lines: string[] = [];
    // Accumulate the winning metric (grid) across all pairs to a global separation.
    const G = { sameGood: [] as number[], diffGood: [] as number[], sameAll: [] as number[], diffAll: [] as number[], sameMis: [] as number[], diffMis: [] as number[] };
    for (const [name, SAME, DIFF] of PAIRS) {
      const om = describeChannels(SAME, {});
      const [, , viewW] = om.geometry.viewBox.split(/\s+/).map(Number);
      const filled = om.cells.filter((c) => !c.blank).map((c) => ({ index: c.index, nucleusColor: c.nucleusColor }));
      const slots = filled.map((c) => { const t = om.cells[c.index].text; return t ? t.length : 4; });
      const oursR = await rasterize(render(SAME), 420);
      const oursSig = filled.map((c, i) => signatures(inkGrid(oursR, om.geometry.cellRects[c.index], viewW, hexRgb(c.nucleusColor as string)), slots[i]));
      lines.push(`\n[${name}] cells=${filled.length}  ours=SAME/mono/420`);
      lines.push(`  ${"val".padEnd(5)}${"font".padEnd(6)}${"W".padStart(4)}  ${"grid".padStart(6)}${"colN".padStart(7)}${"row3".padStart(7)}  ${"grid-mismatch-frac".padStart(18)}`);
      for (const [vName, V] of [["SAME", SAME], ["DIFF", DIFF]] as const) {
        for (const [fName, font] of FONTS) for (const W of SIZES) {
          const d = await distances(oursSig, filled, slots, viewW, V, font, W);
          const g = mean(d.grid), misFrac = d.grid.filter((x) => x > GRID_MISMATCH).length / d.grid.length;
          const isSame = vName === "SAME", good = W >= 400;
          if (isSame) { G.sameAll.push(g); G.sameMis.push(misFrac); if (good) G.sameGood.push(g); }
          else { G.diffAll.push(g); G.diffMis.push(misFrac); if (good) G.diffGood.push(g); }
          lines.push(`  ${vName.padEnd(5)}${fName.padEnd(6)}${String(W).padStart(4)}  ${g.toFixed(3).padStart(6)}${mean(d.colN).toFixed(3).padStart(7)}${mean(d.row3).toFixed(3).padStart(7)}  ${misFrac.toFixed(2).padStart(18)}`);
        }
      }
    }
    const rep = (label: string, s: number[], d: number[]) => {
      const maxS = Math.max(...s), minD = Math.min(...d);
      return `${label}: maxSAME=${maxS.toFixed(3)}  minDIFF=${minD.toFixed(3)}  gap=${(minD - maxS).toFixed(3)}${minD > maxS ? "  SEPARABLE" : "  OVERLAP"}`;
    };
    lines.push("\n=== GRID metric, pooled across all pairs ===");
    lines.push("  mean-grid  " + rep("good sizes (W>=400)", G.sameGood, G.diffGood));
    lines.push("  mean-grid  " + rep("all sizes (incl 200)", G.sameAll, G.diffAll));
    lines.push("  mismatch%  " + rep("per-nucleus frac>0.5", G.sameMis, G.diffMis));
    out.textContent = lines.join("\n");
  } catch (e) {
    out.textContent = "ERROR: " + (e instanceof Error ? (e.message + "\n" + e.stack) : String(e));
  }
  document.body.setAttribute("data-done", "1");
})();
