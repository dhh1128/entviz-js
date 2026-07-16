import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChannels, characterize, mnemonic } from "../../src/entviz.ts";
import type { CellDescription } from "../../src/describe.ts";

// mmtxrg4w: the mnemonic is built ONLY from the entviz's displayed cells, so every
// character it shows appears in the visualization. Its shape scales with entropy:
// <256 bit → first…last; ≥256 bit → first-two…middle…last (a real fingerprint-middle
// cell for the middle when the input is >512-bit).

const mn = (v: string) => mnemonic(describeChannels(v).cells, characterize(v.trim()).sizeBits);
const cellTexts = (v: string) =>
  describeChannels(v).cells.filter((c) => !c.blank).map((c) => c.text as string);

const cell = (text: string | null, o: { blank?: boolean; fingerprint?: boolean } = {}): CellDescription => ({
  index: 0, row: 0, col: 0, text, blank: o.blank ?? false, fingerprint: o.fingerprint ?? false,
  nucleusColor: null, surroundBits: 0,
});

test("small (<256 bit): first cell … last cell — both are real entviz cells", () => {
  const v = "0123456789abcdef"; // 64-bit hex
  const texts = cellTexts(v);
  const m = mn(v);
  assert.equal(m, `${texts[0]}…${texts[texts.length - 1]}`);
  assert.equal(m.split("…").length, 2); // exactly one ellipsis
});

test("large (≥256 bit): first … middle … last (three single cells)", () => {
  const v = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx"; // 264-bit CESR key
  const texts = cellTexts(v);
  const parts = mn(v).split("…");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], texts[0]); // FIRST cell only (not two)
  assert.equal(parts[2], texts[texts.length - 1]); // last cell
  assert.ok(texts.includes(parts[1])); // middle is one of the shown cells
});

test(">512-bit: the middle group is a genuine fingerprint-middle cell", () => {
  const v = "ab".repeat(80); // 640-bit hex → truncated, has fingerprint-middle cells
  const chan = describeChannels(v);
  const fpTexts = chan.cells.filter((c) => c.fingerprint).map((c) => c.text as string);
  assert.ok(fpTexts.length > 0);
  const parts = mnemonic(chan.cells, characterize(v).sizeBits).split("…");
  assert.equal(parts.length, 3);
  assert.ok(fpTexts.includes(parts[1])); // the middle is a fingerprint cell the entviz shows
});

test("is deterministic", () => {
  const v = "DKxy2sgzfplyr_tgwIxS19f2OchFHtLwPWD3v4oYimBx";
  assert.equal(mn(v), mn(v));
});

// --- edges on the pure cell contract (constructed cells) --------------------

test("no shown cells → empty string", () => {
  assert.equal(mnemonic([], 999), "");
  assert.equal(mnemonic([cell(null, { blank: true }), cell("x", { blank: true })], 999), "");
});

test("≥256 bit but too few cells to spread three groups → falls back to first…last", () => {
  const cells = [cell("aa"), cell("bb")]; // only 2 non-blank
  assert.equal(mnemonic(cells, 300), "aa…bb");
});

test("blank cells are skipped when picking first/last", () => {
  const cells = [cell(null, { blank: true }), cell("HEAD"), cell("mid"), cell("TAIL"), cell(null, { blank: true })];
  assert.equal(mnemonic(cells, 100), "HEAD…TAIL");
});
