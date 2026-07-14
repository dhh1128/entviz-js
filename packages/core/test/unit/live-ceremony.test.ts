import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReadbackPlan,
  classifyValue,
  startCeremony,
  respond,
  finish,
  coverage,
  type ReadbackPlan,
} from "../../src/live-ceremony.ts";
import { describeChannels } from "../../src/describe.ts";

// Deterministic [0,1) source (LCG) — stands in for the authenticator's live choice.
function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // 6 cells → small, constrained, hex
const HEX512 = "0123456789abcdef".repeat(8); // 512 bits, medium, constrained, hex (clean)
const BIG = "0123456789abcdef".repeat(16); // >512 bits → big (truncated)
const B64URL = "AbCd-EfGh_IjKl-MnOp_QrSt-UvWx_YzAb01"; // native base64url → medium, constrained, prone
const TEXT = "hello world this is arbitrary prose for the ceremony tests"; // txt fallback → programmable, prone

const filled = (value: string): number[] =>
  describeChannels(value, {}).cells.filter((c) => !c.blank).map((c) => c.index);
const fps = (value: string): number[] =>
  describeChannels(value, {}).cells.filter((c) => c.fingerprint).map((c) => c.index);

// --- classifyValue --------------------------------------------------------

test("classifyValue: size classes (small / medium / big)", () => {
  assert.equal(classifyValue(UUID).sizeClass, "small");
  assert.equal(classifyValue(HEX512).sizeClass, "medium");
  assert.equal(classifyValue(BIG).sizeClass, "big");
});

test("classifyValue: constrained vs programmable (the txt fallback is programmable)", () => {
  assert.equal(classifyValue(HEX512).constrained, true);
  assert.equal(classifyValue(UUID).constrained, true);
  assert.equal(classifyValue(TEXT).constrained, false); // arbitrary prose ⇒ txt→b64url
});

test("classifyValue: homoglyph-prone only for base64/base64url alphabets", () => {
  assert.equal(classifyValue(HEX512).homoglyphProne, false); // hex is clean
  assert.equal(classifyValue(BIG).homoglyphProne, false);
  assert.equal(classifyValue(B64URL).homoglyphProne, true);
  assert.equal(classifyValue(TEXT).homoglyphProne, true); // txt→b64url is base64url
});

// --- buildReadbackPlan: voice-only ---------------------------------------

test("voice-only, small: read all cells", () => {
  const p = buildReadbackPlan(UUID, {}, "voice-only", rngFrom(1));
  assert.equal(p.kind, "all-cells");
  assert.deepEqual([...p.cells].sort((a, b) => a - b), filled(UUID));
  assert.equal(p.homoglyphExtra, 0);
});

test("voice-only, medium constrained: read a run of consecutive cells", () => {
  const p = buildReadbackPlan(HEX512, {}, "voice-only", rngFrom(4));
  assert.equal(p.kind, "consecutive");
  assert.equal(p.goodCells, 4); // the sound sample (milestone) is a 4-cell run
  // the sample is consecutive filled cells in reading order (a contiguous slice)
  const fi = filled(HEX512);
  const sampleCells = p.cells.slice(0, p.goodCells);
  const start = fi.indexOf(sampleCells[0]);
  assert.deepEqual(sampleCells, fi.slice(start, start + 4));
  // the rest of `cells` are the remaining filled cells (optional coverage past it)
  assert.deepEqual([...p.cells].sort((a, b) => a - b), fi);
  assert.ok(p.cells.length > p.goodCells);
});

test("voice-only, medium programmable: read all cells (no sound sample)", () => {
  const p = buildReadbackPlan(TEXT, {}, "voice-only", rngFrom(2));
  assert.equal(classifyValue(TEXT).sizeClass, "medium");
  assert.equal(p.kind, "all-cells");
  // an all-cells read needs no homoglyph compensation even on a confusable alphabet
  assert.equal(p.homoglyphExtra, 0);
});

test("voice-only, big: the fingerprint-middle cells are the sound sample, extras follow", () => {
  const p = buildReadbackPlan(BIG, {}, "voice-only", rngFrom(5));
  assert.equal(p.kind, "fingerprint-cells");
  // milestone = the hash-anchored fingerprint cells
  assert.equal(p.goodCells, fps(BIG).length);
  assert.deepEqual([...p.cells.slice(0, p.goodCells)].sort((a, b) => a - b), fps(BIG));
  // the full read extends past the sample to every filled cell (the Complete ceiling)
  assert.ok(p.cells.length > p.goodCells);
  assert.deepEqual([...p.cells].sort((a, b) => a - b), filled(BIG));
  assert.equal(p.homoglyphExtra, 0); // Crockford middle is homoglyph-clean
});

test("voice-only, medium constrained + confusable alphabet: one extra compensation cell", () => {
  const p = buildReadbackPlan(B64URL, {}, "voice-only", rngFrom(7));
  assert.equal(p.kind, "consecutive");
  assert.equal(p.homoglyphExtra, 1);
  // the extra cell is distinct from the line cells and still a filled cell
  assert.equal(new Set(p.cells).size, p.cells.length);
  for (const ci of p.cells) assert.ok(filled(B64URL).includes(ci));
});

// --- buildReadbackPlan: paste-bind ---------------------------------------

test("paste-bind, constrained non-big: bind on a couple of cells", () => {
  const p = buildReadbackPlan(HEX512, {}, "paste-bind", rngFrom(3));
  assert.equal(p.kind, "bind");
  assert.equal(p.goodCells, 2); // the binding sample is two cells
  for (const ci of p.cells) assert.ok(filled(HEX512).includes(ci));
});

test("paste-bind, big: bind on hash-anchored fingerprint cells", () => {
  const p = buildReadbackPlan(BIG, {}, "paste-bind", rngFrom(6));
  assert.equal(p.kind, "bind");
  assert.equal(p.goodCells, 2);
  for (const ci of p.cells.slice(0, p.goodCells)) assert.ok(fps(BIG).includes(ci));
});

test("paste-bind, programmable non-big: fall back to reading all cells", () => {
  const p = buildReadbackPlan(TEXT, {}, "paste-bind", rngFrom(8));
  assert.equal(p.kind, "all-cells");
  assert.deepEqual([...p.cells].sort((a, b) => a - b), filled(TEXT));
});

test("paste-bind, constrained + confusable alphabet: bind gets a compensation cell", () => {
  const p = buildReadbackPlan(B64URL, {}, "paste-bind", rngFrom(9));
  assert.equal(p.kind, "bind");
  assert.equal(p.homoglyphExtra, 1);
  assert.equal(p.goodCells, BIND_CELLS_PLUS_EXTRA); // 2 bind + 1 homoglyph within the sample
});
const BIND_CELLS_PLUS_EXTRA = 3;

// --- the ceremony reducer -------------------------------------------------

const planAll = (value: string): ReadbackPlan =>
  buildReadbackPlan(value, {}, "voice-only", rngFrom(1));

test("reducer: all matches walk to NO-DIFFERENCE, never IDENTICAL", () => {
  let s = startCeremony(planAll(UUID));
  assert.equal(s.status, "pending");
  while (!s.ended) s = respond(s, "match");
  assert.equal(s.status, "no-difference");
  assert.equal(s.ended, true);
});

test("reducer: one differ is a certain, terminal DIFFERENT", () => {
  let s = startCeremony(planAll(UUID));
  s = respond(s, "match");
  s = respond(s, "differ");
  assert.equal(s.status, "different");
  assert.equal(s.ended, true);
  // further responses are inert once ended
  assert.deepEqual(respond(s, "match"), s);
});

test("reducer: coverage climbs 0→1 across the read-back", () => {
  let s = startCeremony(planAll(UUID));
  assert.equal(coverage(s), 0);
  const n = s.plan.cells.length;
  for (let i = 1; i <= n; i++) {
    s = respond(s, "match");
    assert.ok(Math.abs(coverage(s) - i / n) < 1e-9);
  }
  assert.equal(coverage(s), 1);
});

test("reducer: finish before the end freezes PENDING; after the end keeps NO-DIFFERENCE", () => {
  let s = startCeremony(planAll(HEX512));
  s = respond(s, "match"); // partial
  const frozen = finish(s);
  assert.equal(frozen.status, "pending");
  assert.equal(frozen.ended, true);
  assert.deepEqual(finish(frozen), frozen); // idempotent once ended

  let t = startCeremony(planAll(UUID));
  while (!t.ended) t = respond(t, "match");
  assert.equal(finish(t).status, "no-difference"); // already ended → unchanged
});

test("reducer: respond past the end is a no-op", () => {
  let s = startCeremony(planAll(UUID));
  while (!s.ended) s = respond(s, "match");
  assert.deepEqual(respond(s, "match"), s);
});

test("coverage: an empty plan reports 0 and never affirms", () => {
  const empty: ReadbackPlan = {
    mode: "voice-only", kind: "all-cells",
    cls: { sizeClass: "small", constrained: true, homoglyphProne: false, filledCells: 0 },
    cells: [], goodCells: 0, homoglyphExtra: 0,
  };
  const s = startCeremony(empty);
  assert.equal(coverage(s), 0);
  assert.equal(finish(s).status, "pending");
});

// --- milestone: NO-DIFFERENCE at the sample, then optional read-past ---------

test("reducer: NO-DIFFERENCE at the sound-sample milestone is NOT terminal", () => {
  let s = startCeremony(buildReadbackPlan(BIG, {}, "voice-only", rngFrom(5)));
  const good = s.plan.goodCells;
  assert.ok(good > 1 && s.plan.cells.length > good); // a real milestone with extras after
  for (let i = 0; i < good; i++) s = respond(s, "match");
  assert.equal(s.status, "no-difference"); // milestone reached
  assert.equal(s.ended, false); // …but the ceremony does not end — extras remain
  // reading the extras keeps NO-DIFFERENCE and ends only at the plan's end
  while (!s.ended) s = respond(s, "match");
  assert.equal(s.status, "no-difference");
  assert.equal(s.ended, true);
});

test("reducer: Done AT the milestone freezes NO-DIFFERENCE (extras are optional)", () => {
  let s = startCeremony(buildReadbackPlan(BIG, {}, "voice-only", rngFrom(5)));
  for (let i = 0; i < s.plan.goodCells; i++) s = respond(s, "match");
  const done = finish(s);
  assert.equal(done.status, "no-difference");
  assert.equal(done.ended, true);
});

test("reducer: Done BEFORE the milestone freezes PENDING", () => {
  let s = startCeremony(buildReadbackPlan(BIG, {}, "voice-only", rngFrom(5)));
  s = respond(s, "match"); // 1 of goodCells(>1) read
  assert.equal(finish(s).status, "pending");
});
