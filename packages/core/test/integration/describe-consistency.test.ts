import { test } from "node:test";
import assert from "node:assert/strict";
import { render, type RenderOptions } from "../../src/entviz.ts";
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
    return {
      index,
      blank,
      fingerprint,
      quartileRank: quartile ? Number(quartile[1]) : null,
      surroundBits: surround ? parseInt(surround[1], 16) : 0,
      text: textM ? textM[1] : null,
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

    // per-cell text / blank / fingerprint flags / surround bits
    for (const sc of cells) {
      const dc = d.cells[sc.index];
      assert.equal(dc.blank, sc.blank, `cell ${sc.index} blank`);
      assert.equal(dc.fingerprint, sc.fingerprint, `cell ${sc.index} fingerprint`);
      assert.equal(dc.text, sc.text, `cell ${sc.index} text`);
      assert.equal(dc.surroundBits, sc.surroundBits, `cell ${sc.index} surround bits`);
    }

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
