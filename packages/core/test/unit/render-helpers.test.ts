import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fingerprintEdgeCells,
  minMaxFtokCells,
  blankCellIndices,
  blankFillColors,
  blankMapMarkerColors,
  type Token,
} from "../../src/entviz.ts";

const ftok = (index: number, quant: number): Token => ({ text: "x", index, quant });

test("fingerprintEdgeCells: top-left (if used) + 1st/2nd quartile cells", () => {
  const cellIndices = new Map([[0, 0], [1, 5]]);
  const used = new Set([0, 5]);
  const set = fingerprintEdgeCells([ftok(1, 0), null, null, null], cellIndices, used);
  assert.deepEqual([...set].sort((a, b) => a - b), [0, 5]);
});

test("fingerprintEdgeCells: top-left omitted when cell 0 is blank", () => {
  const cellIndices = new Map([[1, 5]]);
  const used = new Set([5]); // cell 0 not used
  const set = fingerprintEdgeCells([ftok(1, 0), null, null, null], cellIndices, used);
  assert.deepEqual([...set], [5]);
});

test("fingerprintEdgeCells: null and unmapped quartile ftoks are skipped", () => {
  const cellIndices = new Map([[0, 0]]);
  const used = new Set([0]);
  // first quartile maps nowhere (index 99 absent); second is null
  const set = fingerprintEdgeCells([ftok(99, 0), null, null, null], cellIndices, used);
  assert.deepEqual([...set], [0]);
});

test("minMaxFtokCells: min=smallest quant, max=largest, ties break to highest cell index", () => {
  const tokens = [ftok(0, 0), ftok(1, 0), ftok(2, 0)];
  const usedFtoks = [ftok(0, 10), ftok(1, 5), ftok(2, 10)];
  const cellIndices = new Map([[0, 0], [1, 1], [2, 2]]);
  const { minCi, maxCi } = minMaxFtokCells(tokens, usedFtoks, cellIndices);
  assert.equal(minCi, 1); // quant 5 is the unique min
  assert.equal(maxCi, 2); // quant 10 tie between ci 0 and 2 -> highest (2)
});

test("minMaxFtokCells: min tie also breaks to the highest cell index", () => {
  const tokens = [ftok(0, 0), ftok(1, 0), ftok(2, 0)];
  const usedFtoks = [ftok(0, 5), ftok(1, 5), ftok(2, 9)];
  const cellIndices = new Map([[0, 0], [1, 1], [2, 2]]);
  const { minCi } = minMaxFtokCells(tokens, usedFtoks, cellIndices);
  assert.equal(minCi, 1);
});

test("blankCellIndices: row-major indices with no token", () => {
  const grid = { cols: 3, rows: 4, tokenCount: 3 };
  const blanks = blankCellIndices(grid, new Set([0, 1, 2]));
  assert.deepEqual(blanks, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

const edge = ["#ffffff", "#e7be00", "#ff3f2f", "#2f3fbf"];

test("blankFillColors: sole blank IS coloured (it is the map blank)", () => {
  const digest = Buffer.alloc(64);
  digest[32] = 2; // -> edge index 2
  const m = blankFillColors([5], 5, digest, edge);
  assert.equal(m.get(5), "#ff3f2f");
});

test("blankFillColors: with multiple blanks the map blank is excluded; siblings indexed in order", () => {
  const digest = Buffer.alloc(64);
  digest[32] = 2; // first coloured blank -> edge[2]
  digest[33] = 3; // second coloured blank -> edge[3]
  const m = blankFillColors([3, 5, 7], 3, digest, edge); // 3 is the map blank
  assert.equal(m.has(3), false);
  assert.equal(m.get(5), "#ff3f2f");
  assert.equal(m.get(7), "#2f3fbf");
});

test("blankMapMarkerColors: sole blank -> both markers take the contrast colour", () => {
  assert.deepEqual(blankMapMarkerColors(true, "#ffffff"), { minColor: "#000000", maxColor: "#000000" });
  assert.deepEqual(blankMapMarkerColors(true, "#000000"), { minColor: "#ffffff", maxColor: "#ffffff" });
});

test("blankMapMarkerColors: multi-blank (or no fill) keeps the v9 red plus / blue dot", () => {
  assert.deepEqual(blankMapMarkerColors(false, "#ffffff"), { minColor: "#1d4ed8", maxColor: "#d62828" });
  assert.deepEqual(blankMapMarkerColors(true, undefined), { minColor: "#1d4ed8", maxColor: "#d62828" });
});
