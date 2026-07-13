import { test } from "node:test";
import assert from "node:assert/strict";
import { render, BAND_LETTER, type RenderOptions } from "../../src/entviz.ts";
import { comparisonText, describeChannels } from "../../src/describe.ts";

// The describe helpers re-derive the render model from the same stage functions
// render() uses; this suite renders the SVG and proves, field by field, that
// describeChannels()/comparisonText() agree with it — so they can never drift.

// Per-cell readout pulled straight from the rendered SVG. Cell groups are
// emitted in cell-index order; each chunk is bounded before the color-bar /
// label channels so a blank LAST cell is not mis-read as a later <text>.
function svgCells(svg: string) {
  const chunks = svg.split('<g data-channel="cell"');
  return chunks.slice(1).map((chunk) => {
    const body = chunk.split("data-channel=")[0];
    const tag = body.slice(0, body.indexOf(">"));
    const index = Number(tag.match(/data-cell-index="(\d+)"/)![1]);
    const blank = /data-cell-blank="true"/.test(tag);
    const fingerprint = /data-cell-fingerprint="true"/.test(tag);
    const quartile = tag.match(/data-cell-quartile="(\d+)"/);
    const surround = tag.match(/data-surround-bits="0x([0-9a-f]+)"/);
    const textM = body.match(/<text[^>]*dominant-baseline="central"[^>]*>([^<]*)<\/text>/);
    // The nucleus is the first <rect> in the cell group (a filled cell's fill is
    // its nucleus color; for a blank cell the first rect is the blank pill).
    const nucleusM = body.match(/<rect\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/);
    return {
      index,
      blank,
      fingerprint,
      quartileRank: quartile ? Number(quartile[1]) : null,
      surroundBits: surround ? parseInt(surround[1], 16) : 0,
      text: textM ? textM[1] : null,
      nucleusFill: nucleusM ? nucleusM[1].toLowerCase() : null,
    };
  });
}

const attr = (svg: string, name: string) =>
  svg.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

const CASES: [string, string, RenderOptions][] = [
  ["uuid (no blanks)", "550e8400-e29b-41d4-a716-446655440000", {}],
  ["hex with blanks + map", "012345", {}],
  ["eth checksummed", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", {}],
  [">512-bit truncated", "0123456789abcdef".repeat(16), {}],
  ["uuid with note + ar", "550e8400-e29b-41d4-a716-446655440000", { note: "git", targetAr: 2.0 }],
];

for (const [name, value, opts] of CASES) {
  test(`consistency: ${name}`, () => {
    const svg = render(value, opts);
    const d = describeChannels(value, opts);
    const cells = svgCells(svg);

    // grid shape
    assert.equal(d.cols, Number(attr(svg, "data-cols")));
    assert.equal(d.rows, Number(attr(svg, "data-rows")));
    assert.equal(d.cells.length, cells.length);

    // per-cell text / blank / fingerprint flags / surround bits / nucleus color
    for (const sc of cells) {
      const dc = d.cells[sc.index];
      assert.equal(dc.blank, sc.blank, `cell ${sc.index} blank`);
      assert.equal(dc.fingerprint, sc.fingerprint, `cell ${sc.index} fingerprint`);
      assert.equal(dc.text, sc.text, `cell ${sc.index} text`);
      assert.equal(dc.surroundBits, sc.surroundBits, `cell ${sc.index} surround bits`);
      if (sc.blank) assert.equal(dc.nucleusColor, null, `cell ${sc.index} blank nucleus`);
      else assert.equal(dc.nucleusColor, sc.nucleusFill, `cell ${sc.index} nucleus color`);
    }

    // grid background color = the grid channel's bg rect fill
    const gridChannel = svg.split('data-channel="grid"')[1] ?? "";
    const bgFill = gridChannel.match(/<rect\b[^>]*\bfill="(#[0-9a-fA-F]{6})"/)?.[1].toLowerCase();
    assert.equal(d.bgColor.toLowerCase(), bgFill, "grid bg color");

    // color-bar bands: color↔letter matches the rendered glyphs; counts are positive
    assert.deepEqual(
      d.colorBarBands.map((b) => BAND_LETTER[b.color].toLowerCase()),
      d.colorBarLetters,
      "band colors map to the rendered letters",
    );
    for (const b of d.colorBarBands) assert.ok(b.count > 0, `band ${b.color} count > 0`);

    // comparisonText = filled text in order, blanks as ·
    const expectedCmp = cells.map((c) => (c.blank ? "·" : (c.text as string))).join(" ");
    assert.equal(comparisonText(value, opts), expectedCmp);

    // color-bar band letters (top→bottom), lowercased to the rendered glyph
    const bands = [...svg.matchAll(/data-color-bar-band="([WGRBK])"/g)].map((m) =>
      m[1].toLowerCase(),
    );
    assert.deepEqual(d.colorBarLetters, bands);

    // color-bar gutter markers
    assert.equal(d.markers.colorBar.slots, Number(attr(svg, "data-bar-slots")));
    assert.equal(d.markers.colorBar.left, Number(attr(svg, "data-bar-marker-left")));
    assert.equal(d.markers.colorBar.right, Number(attr(svg, "data-bar-marker-right")));

    // blank-cell map min/max (present only when there are blank cells)
    const minRC = attr(svg, "data-blank-map-min");
    const maxRC = attr(svg, "data-blank-map-max");
    if (d.markers.blankMap) {
      const rc = (ci: number) => `${Math.floor(ci / d.cols)},${ci % d.cols}`;
      assert.equal(rc(d.markers.blankMap.minCell), minRC);
      assert.equal(rc(d.markers.blankMap.maxCell), maxRC);
    } else {
      assert.equal(minRC, null);
    }

    // quartile marks: each non-null quartile sits on the cell the SVG flags
    const svgQuartiles = new Map(
      cells.filter((c) => c.quartileRank !== null).map((c) => [c.quartileRank, c.index]),
    );
    for (const q of d.quartiles) {
      if (q.cellIndex === null) {
        assert.ok(!svgQuartiles.has(q.rank), `quartile ${q.rank} should be absent`);
      } else {
        assert.equal(svgQuartiles.get(q.rank), q.cellIndex, `quartile ${q.rank} cell`);
      }
    }
  });
}

// --- geometry: every feature rect matches the rendered SVG element ----------
// The walk's focus rings come from describeChannels().geometry, NOT from parsing
// the SVG; this proves the model geometry tracks the actual rendered coordinates.

const APPROX = 0.06; // n() serializes coords to 3 decimals; this absorbs rounding
const nums = (s: string): number[] => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
type R = { x: number; y: number; w: number; h: number };
function firstRect(region: string): R | null {
  const m = region.match(/<rect\b[^>]*?\bx="([-\d.]+)"[^>]*?\by="([-\d.]+)"[^>]*?\bwidth="([-\d.]+)"[^>]*?\bheight="([-\d.]+)"/);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
}
function approxRect(actual: R, expected: R, msg: string) {
  for (const k of ["x", "y", "w", "h"] as const) {
    assert.ok(Math.abs(actual[k] - expected[k]) <= APPROX, `${msg}.${k}: ${actual[k]} vs ${expected[k]}`);
  }
}

for (const [name, value, opts] of CASES) {
  test(`geometry: ${name}`, () => {
    const svg = render(value, opts);
    const g = describeChannels(value, opts).geometry;

    // viewBox tracks the root SVG
    const vb = nums(attr(svg, "viewBox") as string), gvb = nums(g.viewBox);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(vb[i] - gvb[i]) <= APPROX, `viewBox[${i}]`);

    // grid background rect
    approxRect(firstRect(svg.split('data-channel="grid"')[1]) as R, g.gridRect, "gridRect");

    // every cell's nucleus rect (first rect inside the cell group)
    svg.split('<g data-channel="cell"').slice(1).forEach((chunk) => {
      const body = chunk.split("data-channel=")[0];
      const idx = Number(body.match(/data-cell-index="(\d+)"/)![1]);
      approxRect(firstRect(body) as R, g.cellRects[idx], `cell ${idx}`);
    });

    // color bar: x≈2, y≈2 (inset by MARGIN=1 + 1px border), width = a real
    // band's width, height = viewBox − 2*MARGIN − 2 (== viewBox − 4)
    const bandRect = firstRect(svg.split('data-channel="color-bar"')[1]) as R;
    assert.ok(Math.abs(g.colorBar.x - 2) <= APPROX && Math.abs(g.colorBar.y - 2) <= APPROX, "colorBar origin");
    assert.ok(Math.abs(g.colorBar.w - bandRect.w) <= APPROX, "colorBar width = band width");
    assert.ok(Math.abs(g.colorBar.h - (gvb[3] - 4)) <= APPROX, "colorBar height = viewBox−4");

    // the two gutter marker discs (left, right), as bounding boxes
    const discs = [...svg.matchAll(/<circle\b[^>]*?\bcx="([-\d.]+)"[^>]*?\bcy="([-\d.]+)"[^>]*?\br="([-\d.]+)"[^>]*?data-bar-marker="(left|right)"/g)];
    const bySide: Record<string, R> = {};
    for (const m of discs) {
      const cx = +m[1], cy = +m[2], r = +m[3];
      bySide[m[4]] = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
    }
    approxRect(bySide.left, g.colorBarMarkers[0], "marker left");
    approxRect(bySide.right, g.colorBarMarkers[1], "marker right");

    // ellipse bounding box: the box of the ROTATED ellipse, clipped to the grid
    // (the ellipse is drawn under the grid clip-path). Read cx/cy/rx/ry AND the
    // rotate() angle from the rendered <ellipse>, and clamp to g.gridRect — the
    // same geometry the focus ring must hug.
    const em = svg.match(/<ellipse\b[^>]*?\bcx="([-\d.]+)"[^>]*?\bcy="([-\d.]+)"[^>]*?\brx="([-\d.]+)"[^>]*?\bry="([-\d.]+)"[^>]*?\btransform="rotate\(([-\d.]+)/) as RegExpMatchArray;
    const ecx = +em[1], ecy = +em[2], erx = +em[3], ery = +em[4];
    const rot = (+em[5] * Math.PI) / 180, c = Math.cos(rot), s = Math.sin(rot);
    const hw = Math.hypot(erx * c, ery * s), hh = Math.hypot(erx * s, ery * c);
    const gx0 = Math.max(g.gridRect.x, ecx - hw), gy0 = Math.max(g.gridRect.y, ecy - hh);
    const gx1 = Math.min(g.gridRect.x + g.gridRect.w, ecx + hw), gy1 = Math.min(g.gridRect.y + g.gridRect.h, ecy + hh);
    approxRect({ x: gx0, y: gy0, w: gx1 - gx0, h: gy1 - gy0 }, g.ellipse, "ellipse");
  });
}
