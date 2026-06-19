import { test } from "node:test";
import assert from "node:assert/strict";
import { El, drawBlankCells, computeGeometry } from "../../src/entviz.ts";

const grid = { cols: 3, rows: 2, tokenCount: 4 };
const geom = computeGeometry(12, grid, false);

function groups(count: number): Map<number, El> {
  const m = new Map<number, El>();
  for (let i = 0; i < count; i++) m.set(i, new El("g").set("data-cell-index", i));
  return m;
}

test("drawBlankCells: multi-blank — map keeps the anchor, sibling is fingerprint-filled", () => {
  const cg = groups(6);
  const fill = new Map([[5, "#ff3f2f"]]); // map blank (3) excluded; sibling 5 coloured
  drawBlankCells(cg, [3, 5], 3, fill, "#ffffff", 0, 1, grid, geom);

  const map = cg.get(3)!.render();
  assert.match(map, /data-cell-blank-map="true"/);
  assert.match(map, /<rect[^>]*fill="#ffffff"/); // white/gold findable anchor
  assert.match(map, /<circle[^>]*fill="#1d4ed8"[^>]*data-blank-map-min="\d+,\d+"/);
  assert.match(map, /<path[^>]*stroke="#d62828"[^>]*data-blank-map-max="\d+,\d+"/);

  const sib = cg.get(5)!.render();
  assert.match(sib, /<rect[^>]*fill="#ff3f2f"/);
  assert.doesNotMatch(sib, /data-cell-blank-map/);
});

test("drawBlankCells: sole blank IS the fingerprint-filled map, markers take contrast colour", () => {
  const cg = groups(6);
  const fill = new Map([[5, "#ffffff"]]); // sole blank coloured; white fill -> black markers
  drawBlankCells(cg, [5], 5, fill, "#ffffff", 0, 4, grid, geom);

  const map = cg.get(5)!.render();
  assert.match(map, /<rect[^>]*fill="#ffffff"/);
  assert.match(map, /<circle[^>]*fill="#000000"[^>]*data-blank-map-min/);
  assert.match(map, /<path[^>]*stroke="#000000"[^>]*data-blank-map-max/);
});

test("drawBlankCells: no blanks -> nothing drawn", () => {
  const cg = groups(6);
  drawBlankCells(cg, [], null, new Map(), "#ffffff", 0, 0, grid, geom);
  for (const g of cg.values()) assert.equal(g.children.length, 0);
});
