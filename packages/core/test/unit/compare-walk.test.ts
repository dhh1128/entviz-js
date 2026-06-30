import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckPlan,
  featureRects,
  startWalk,
  respond,
  finish,
  coverage,
  type CheckPlan,
  type GestaltDimension,
} from "../../src/compare-walk.ts";
import { describeChannels } from "../../src/describe.ts";

const UUID = "550e8400-e29b-41d4-a716-446655440000"; // 6 cells → "small"
const HEX512 = "0123456789abcdef".repeat(8); // 512 bits, ~22 cells, ≤512 → "large"
const BIG = "0123456789abcdef".repeat(16); // >512 bits → "huge" (truncated)
const TINY = "012345"; // few tokens ⇒ blanks + some null quartiles

// Deterministic [0,1) source (LCG) so plans are reproducible in tests.
function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const kinds = (p: CheckPlan) => p.steps.map((s) => s.kind);

const GW: Record<string, number> = {
  ellipse: 7, "quartile-marks": 6, "colorbar-markers": 5, "blank-map": 5,
  "colorbar-pattern": 4, "blank-pattern": 3, background: 2,
};

// --- buildCheckPlan -------------------------------------------------------

test("buildCheckPlan: spot-check is the full continuous sequence (≥2 text + gestalt, no probe)", () => {
  const p = buildCheckPlan(HEX512, {}, "spot-check", rngFrom(2));
  assert.equal(p.mode, "spot-check");
  assert.equal(p.hasProbe, false);
  assert.ok(kinds(p).filter((k) => k === "text").length >= 2);
  assert.ok(kinds(p).includes("gestalt"));
  // milestones are ordered and the sequence climbs all the way to 100%
  assert.ok(p.quickBits <= p.goodBits && p.goodBits <= p.totalBits);
  assert.ok(p.steps.length > 3); // more than just the Good front — keep-going is possible
});

test("buildCheckPlan: spot-check's Good milestone has the ≥2 text floor + ≥12 gestalt bits", () => {
  for (let seed = 1; seed <= 80; seed++) {
    const p = buildCheckPlan(HEX512, {}, "spot-check", rngFrom(seed));
    assert.ok(p.goodBits >= 2 * 24 + 12, `seed ${seed}: goodBits ${p.goodBits}`);
  }
});

test("buildCheckPlan: spot-check favours discriminatory gestalt early (ellipse before background)", () => {
  let ellipseSum = 0, bgSum = 0, n = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const g = buildCheckPlan(HEX512, {}, "spot-check", rngFrom(seed)).steps
      .filter((s) => s.kind === "gestalt").map((s) => (s as { dimension: string }).dimension);
    const ei = g.indexOf("ellipse"), bi = g.indexOf("background");
    if (ei >= 0 && bi >= 0) { ellipseSum += ei; bgSum += bi; n++; }
  }
  // weighting biases ORDER (the full pool is always present): ellipse lands earlier
  assert.ok(ellipseSum / n < bgSum / n, `ellipse avg ${ellipseSum / n} vs background ${bgSum / n}`);
});

test("buildCheckPlan: complete on a small value reads all text, no gestalt, no probe", () => {
  const p = buildCheckPlan(UUID, {}, "complete", rngFrom(3));
  assert.equal(p.mode, "complete");
  assert.equal(p.sizeClass, "small");
  assert.equal(p.hasProbe, false);
  assert.ok(p.steps.every((s) => s.kind === "text"));
  assert.equal(p.steps.length, 6); // every filled cell
});

test("buildCheckPlan: complete on a large value adds the gestalt CRC and one probe", () => {
  const p = buildCheckPlan(HEX512, {}, "complete", rngFrom(4));
  assert.equal(p.sizeClass, "large");
  assert.equal(p.hasProbe, true);
  assert.equal(kinds(p).filter((k) => k === "probe").length, 1);
  assert.ok(kinds(p).includes("gestalt"));
});

test("buildCheckPlan: a >512-bit value is huge; spot-check text anchors on the fingerprint-middle cells", () => {
  const fp = new Set(describeChannels(BIG).cells.filter((c) => c.fingerprint).map((c) => c.index));
  assert.equal(fp.size, 4);
  const p = buildCheckPlan(BIG, {}, "spot-check", rngFrom(5));
  assert.equal(p.sizeClass, "huge");
  for (const s of p.steps) if (s.kind === "text") assert.ok(fp.has(s.cellIndex));
  assert.equal(buildCheckPlan(BIG, {}, "complete", rngFrom(6)).hasProbe, true);
});

test("buildCheckPlan: deterministic for a fixed rng", () => {
  assert.deepEqual(
    buildCheckPlan(HEX512, {}, "complete", rngFrom(9)),
    buildCheckPlan(HEX512, {}, "complete", rngFrom(9)),
  );
});

// --- the walk reducer -----------------------------------------------------

const planOf = (steps: CheckPlan["steps"], over: Partial<CheckPlan> = {}): CheckPlan => {
  const totalBits = steps.reduce(
    (b, s) => b + (s.kind === "text" ? 24 : s.kind === "gestalt" ? GW[s.dimension] : 0),
    0,
  );
  return { mode: "spot-check", steps, quickBits: 0, goodBits: 0, totalBits, hasProbe: false, sizeClass: "large", ...over };
};

test("respond: climbs to the Good milestone → no-difference; keeps going, ends when exhausted", () => {
  let s = startWalk(planOf([
    { kind: "text", cellIndex: 0 },
    { kind: "text", cellIndex: 1 },
    { kind: "gestalt", dimension: "ellipse" },
  ], { goodBits: 48 })); // 2 text cells = 48 bits
  assert.equal(s.status, "pending");
  assert.equal(s.ended, false);
  assert.equal(coverage(s), 0);
  s = respond(s, "match"); // 1 text — floor not met yet
  assert.equal(s.status, "pending");
  s = respond(s, "match"); // 2 text — floor + Good bits → affirmative, but NOT ended
  assert.equal(s.status, "no-difference");
  assert.equal(s.ended, false);
  s = respond(s, "match"); // ellipse — still no-difference, now exhausted → ended
  assert.equal(s.status, "no-difference");
  assert.equal(s.ended, true);
  assert.equal(coverage(s), 1);
});

test("coverage: weighted by feature bits (an ellipse step advances more than background)", () => {
  // background (2 bits) then ellipse (7) → after background, coverage = 2/9
  let s = startWalk(planOf([
    { kind: "gestalt", dimension: "background" },
    { kind: "gestalt", dimension: "ellipse" },
  ]));
  s = respond(s, "match");
  assert.ok(Math.abs(coverage(s) - 2 / 9) < 1e-9, `${coverage(s)}`);
  s = respond(s, "match");
  assert.equal(coverage(s), 1);
});

test("finish: Done freezes the live verdict — PENDING below Good, NO-DIFFERENCE at/above", () => {
  const plan = planOf([
    { kind: "text", cellIndex: 0 }, { kind: "text", cellIndex: 1 },
    { kind: "gestalt", dimension: "ellipse" },
  ], { goodBits: 48 });
  // Done below Good → still a peek
  let s = startWalk(plan);
  s = respond(s, "match"); // 1 text
  s = finish(s);
  assert.equal(s.status, "pending");
  assert.equal(s.ended, true);
  assert.deepEqual(respond(s, "match"), s); // terminal
  // Done past Good → keep the affirmative, stop early
  let t = startWalk(plan);
  t = respond(t, "match"); // text0
  t = respond(t, "match"); // text1 → no-difference
  t = finish(t);
  assert.equal(t.status, "no-difference");
  assert.equal(t.ended, true);
});

test("respond: any differs → different (terminal)", () => {
  let s = startWalk(planOf([{ kind: "text", cellIndex: 0 }, { kind: "text", cellIndex: 1 }]));
  s = respond(s, "differ");
  assert.equal(s.status, "different");
  assert.equal(s.ended, true);
  assert.deepEqual(respond(s, "match"), s); // terminal: no further change
});

test("respond: the transparent probe — caught advances; missed resets; missed twice → inconclusive", () => {
  const plan = planOf(
    [{ kind: "text", cellIndex: 0 }, { kind: "probe" }, { kind: "text", cellIndex: 1 }],
    { hasProbe: true, goodBits: 48 },
  );
  // caught
  let s = startWalk(plan);
  s = respond(s, "match"); // text0
  s = respond(s, "differ"); // probe caught → advance
  s = respond(s, "match"); // text1 → 2 text, no-difference, exhausted → ended
  assert.equal(s.status, "no-difference");
  assert.equal(s.ended, true);
  // missed once → reset to the start
  s = respond(startWalk(plan), "match"); // text0, now at the probe
  s = respond(s, "match"); // probe missed
  assert.equal(s.index, 0);
  assert.equal(s.probeResets, 1);
  assert.equal(s.ended, false);
  // missed twice → inconclusive (ended)
  s = respond(s, "match"); // text0 again
  s = respond(s, "match"); // probe missed again
  assert.equal(s.status, "inconclusive");
  assert.equal(s.ended, true);
});

// --- featureRects (geometry from the render model) ------------------------

test("featureRects: a text cell → one rect; viewBox present", () => {
  const { viewBox, rects } = featureRects(HEX512, {}, { kind: "text", cellIndex: 0 });
  assert.match(viewBox, /^0 0 /);
  assert.equal(rects.length, 1);
  assert.ok(rects[0].w > 0 && rects[0].h > 0);
});

test("featureRects: an out-of-range text cell → no rect", () => {
  assert.equal(featureRects(HEX512, {}, { kind: "text", cellIndex: 9999 }).rects.length, 0);
});

test("featureRects: every gestalt dimension present in HEX512 yields ≥1 rect", () => {
  const dims: GestaltDimension[] = [
    "background", "colorbar-pattern", "colorbar-markers", "ellipse",
    "blank-pattern", "blank-map", "quartile-marks",
  ];
  for (const dimension of dims) {
    const { rects } = featureRects(HEX512, {}, { kind: "gestalt", dimension });
    assert.ok(rects.length > 0, dimension);
  }
});

test("featureRects: color-bar pattern is the single whole-bar rect; two markers", () => {
  assert.equal(featureRects(HEX512, {}, { kind: "gestalt", dimension: "colorbar-pattern" }).rects.length, 1);
  assert.equal(featureRects(HEX512, {}, { kind: "gestalt", dimension: "colorbar-markers" }).rects.length, 2);
});

test("featureRects: a probe step has no figure rect", () => {
  assert.equal(featureRects(HEX512, {}, { kind: "probe" }).rects.length, 0);
});

test("featureRects: blank-map / quartile features degrade to empty when absent", () => {
  // a value whose grid is exactly full has no blank map; a few-token value has
  // some null quartile cells — both exercise the empty/null branches.
  const noBlanks = describeChannels(UUID, {}).markers.blankMap === null;
  assert.ok(noBlanks); // UUID fills its grid
  assert.equal(featureRects(UUID, {}, { kind: "gestalt", dimension: "blank-map" }).rects.length, 0);
  // TINY has blanks (so a blank-map cell) AND fewer than 4 quartile cells
  const d = describeChannels(TINY, {});
  assert.ok(d.quartiles.some((q) => q.cellIndex === null));
  const qr = featureRects(TINY, {}, { kind: "gestalt", dimension: "quartile-marks" }).rects.length;
  assert.equal(qr, d.quartiles.filter((q) => q.cellIndex !== null).length);
  assert.equal(featureRects(TINY, {}, { kind: "gestalt", dimension: "blank-map" }).rects.length, 1);
});
