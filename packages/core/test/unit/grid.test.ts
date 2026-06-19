import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseGrid, assignCellIndices, type Token } from "../../src/entviz.ts";

test("chooseGrid: spec worked example 11 tokens @ 1:1 -> 3x4", () => {
  const g = chooseGrid(11, 1.0);
  assert.deepEqual([g.cols, g.rows], [3, 4]);
});

test("chooseGrid: 6 tokens @ 1:1 -> 2x3 (tiles exactly, no blanks)", () => {
  const g = chooseGrid(6, 1.0);
  assert.deepEqual([g.cols, g.rows], [2, 3]);
});

test("chooseGrid: a single token falls back to a 2x2 grid", () => {
  const g = chooseGrid(1, 1.0);
  assert.deepEqual([g.cols, g.rows], [2, 2]);
});

test("chooseGrid: an unreachably-high target AR takes the widest candidate", () => {
  // 11 tokens yields several candidates, all below ar=100, so the 'else' branch
  // reduces over them and picks the widest (max-ar) grid.
  const g = chooseGrid(11, 100);
  assert.ok(g.cols > g.rows); // widest available
  assert.ok(g.cols * g.rows >= 11);
});

const tok = (index: number): Token => ({ text: String(index), index, quant: index });

test("assignCellIndices: identity when tokens fill the grid", () => {
  const tokens = [tok(0), tok(1), tok(2), tok(3)];
  const grid = { cols: 2, rows: 2, tokenCount: 4 };
  const m = assignCellIndices(tokens, grid, tokens[0], tokens);
  assert.deepEqual([...m.entries()].sort(), [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test("assignCellIndices: empty tokens -> empty map", () => {
  const grid = { cols: 2, rows: 2, tokenCount: 0 };
  assert.equal(assignCellIndices([], grid, null, []).size, 0);
});

test("assignCellIndices: equal-text sort keys fall back to the index tie-break", () => {
  // Spare cells make the min/max sort run; equal text forces the index tiebreak.
  const tokens = [tok(0), tok(1), tok(2)];
  const grid = { cols: 3, rows: 2, tokenCount: 3 };
  const sameText: Token[] = [
    { text: "k", index: 0, quant: 0 },
    { text: "k", index: 1, quant: 0 },
    { text: "k", index: 2, quant: 0 },
  ];
  const m = assignCellIndices(tokens, grid, sameText[1], sameText);
  assert.equal(new Set(m.values()).size, 3);
});

test("assignCellIndices: spare cells trigger median + min/max blank shifts", () => {
  // 3 tokens in a 6-cell grid: median shift + both quartile-extreme shifts run,
  // so at least one cell index is pushed past its token's natural position.
  const tokens = [tok(0), tok(1), tok(2)];
  const grid = { cols: 3, rows: 2, tokenCount: 3 };
  const m = assignCellIndices(tokens, grid, tokens[1], tokens);
  assert.equal(m.size, 3);
  const cells = new Set(m.values());
  assert.equal(cells.size, 3); // still injective
  assert.ok(Math.max(...cells) >= 3); // some token shifted into the spare cells
});
