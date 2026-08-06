/**
 * The SVG engine's adversarial suite (comparison-design.md §6.2, security scan
 * findings F1/F2, red-team S3).
 *
 * Every test here encodes one documented forgery: an SVG whose DECLARED channels
 * (`<text>`, `data-*`) say X while the ink a viewer paints says Y, or says
 * nothing at all. The single invariant is that none of them may reach the
 * affirmative verdicts — `identical`, or the >512-bit `unknown`+`similar` (the
 * green "≈" chip) — because both are read by a human as "the picture you saw is
 * your value". A structurally-rejected forgery must land on `unknown`, NOT on
 * `different`: an attacker-authored reference must never be spun into a false
 * "they differ" either (§3, §6.3).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSvg } from "../../src/compare.ts";
import { render } from "../../src/entviz.ts";

const VICTIM = "550e8400-e29b-41d4-a716-446655440000";
const ATTACKER = "0123456789abcdef0123456789abcdef";
const BIG = "0123456789abcdef".repeat(16); // >512 bits → truncated

// --- surgery helpers -------------------------------------------------------

/** The document's inner content (everything between the root tags). */
function innerContent(svg: string): string {
  return svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"));
}

/** The run of `<g data-channel="cell">` groups, and the offsets they span.
 *  The cell groups are the last thing in the grid channel, so the two `</g>`
 *  before the colour bar close the cell container and the grid group. */
function cellRun(svg: string): { start: number; end: number; cells: string } {
  const start = svg.indexOf('<g data-channel="cell"');
  const end = svg.indexOf('<g data-channel="color-bar"') - "</g></g>".length;
  const cells = svg.slice(start, end);
  assert.ok(start > 0 && cells.startsWith('<g data-channel="cell"') && cells.endsWith("</g>"));
  return { start, end, cells };
}

/** The first cell group, as markup. */
function firstCell(svg: string): string {
  const m = /<g data-channel="cell"[\s\S]*?<\/g>/.exec(svg);
  return (m as RegExpExecArray)[0];
}

/** An opaque cover over the whole canvas — every tag inside the closed profile. */
const COVER = '<rect x="0" y="0" width="99999" height="99999" fill="#ffffff"/>';

/** Attacker ink: the victim-facing entviz of ATTACKER, with its non-rendering
 *  annotations renamed so the parser cannot see its cells, and `data-truncated`
 *  dropped. Renaming changes no pixels — this is the F1 exploit verbatim. */
function attackerInk(value: string): string {
  return innerContent(render(value))
    .replace(/data-channel=/g, "data-x=")
    .replace(/data-cell-index=/g, "data-x-index=")
    .replace(/data-color-bar-band=/g, "data-x-band=")
    .replace(/ data-truncated="true"/g, "");
}

// --- the honest path must survive -----------------------------------------

test("attack suite baseline: a genuine render of the value is still `identical`", () => {
  assert.deepEqual(compareSvg(render(VICTIM), VICTIM), { state: "identical" });
  assert.deepEqual(compareSvg(render(ATTACKER), ATTACKER), { state: "identical" });
});

test("attack suite baseline: a genuine render of another value is still `different`", () => {
  assert.deepEqual(compareSvg(render(ATTACKER), VICTIM), { state: "different" });
});

// --- F1/F2: extra ink ------------------------------------------------------

test("forgery: opaque cover + attacker glyphs appended before </svg> is not `identical`", () => {
  const forged = render(VICTIM).replace("</svg>", COVER + attackerInk(ATTACKER) + "</svg>");
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

test("forgery: the honest cells moved into <defs> (declared but never painted) is not `identical`", () => {
  const svg = render(VICTIM);
  const { start, end, cells } = cellRun(svg);
  const hollow = svg.slice(0, start) + svg.slice(end);
  const forged = hollow.replace("</defs>", cells + "</defs>");
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

// --- F1: the honest glyphs neutralized by a presentation attribute ---------

for (const [name, attr] of [
  ["opacity=\"0\"", ' opacity="0"'],
  ["display=\"none\"", ' display="none"'],
  ["visibility=\"hidden\"", ' visibility="hidden"'],
  ["transform=\"translate(-9999,0)\"", ' transform="translate(-9999,0)"'],
] as const) {
  test(`forgery: honest cell text neutralized by ${name} is not \`identical\``, () => {
    const forged = render(VICTIM).replace(
      /dominant-baseline="central"/g,
      `dominant-baseline="central"${attr}`,
    );
    assert.equal(compareSvg(forged, VICTIM).state, "unknown");
  });
}

// --- F1: duplicate / extra declarations inside the recognized structure ----

test("forgery: a second cell group for an index already seen is not `identical`", () => {
  const svg = render(VICTIM);
  const cell = firstCell(svg);
  const dup = cell.replace(/>([^<>]*)<\/text>/, ">ZZZZZZ</text>");
  assert.notEqual(dup, cell);
  const forged = svg.replace(cell, cell + dup);
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

test("forgery: a second dominant-baseline text inside one cell group is not `identical`", () => {
  // The parser used to take the FIRST central-baseline <text> in a cell and
  // ignore the rest, so the second one painted over it for free.
  const svg = render(VICTIM);
  const cell = firstCell(svg);
  const over = '<text x="58" y="47" fill="#000000" font-size="12" text-anchor="middle" dominant-baseline="central">ZZZZZZ</text>';
  const forged = svg.replace(cell, cell.replace("</g>", over + "</g>"));
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

test("forgery: renamed annotations + attacker ink, `data-truncated` dropped, is not `identical`", () => {
  // Rename-only tampering changes no pixels: the parser sees just the victim's
  // honest cells, while every viewer paints the attacker's entviz on top.
  const forged = render(VICTIM).replace("</svg>", attackerInk(ATTACKER) + "</svg>");
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

test("forgery: a colour-bar band letter planted outside the colour-bar group is not `identical`", () => {
  // The band scan used to run over the whole document string, so a letter
  // planted on an earlier element counted as if the bar had painted it.
  const svg = render(VICTIM);
  const band = /<g data-color-bar-rank="0" data-color-bar-band="([WGRBK])">/.exec(svg);
  assert.ok(band, "expected a first colour-bar band with a letter");
  const forged = svg
    .replace(band[0], '<g data-color-bar-rank="0">')
    .replace('<g data-channel="grid">', `<g data-channel="grid" data-color-bar-band="${band[1]}">`);
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

// --- F2: the >512-bit green "≈" chip --------------------------------------

test("forgery: a >512-bit reference with attacker ink reaches neither `identical` nor `similar`", () => {
  const forged = render(BIG).replace("</svg>", COVER + attackerInk(ATTACKER) + "</svg>");
  const v = compareSvg(forged, BIG);
  assert.equal(v.state, "unknown");
  assert.equal(v.state === "unknown" && !!v.similar, false);
});

test("forgery: a >512-bit reference whose cells are hidden reaches neither `identical` nor `similar`", () => {
  const forged = render(BIG).replace(
    /dominant-baseline="central"/g,
    'dominant-baseline="central" display="none"',
  );
  const v = compareSvg(forged, BIG);
  assert.equal(v.state, "unknown");
  assert.equal(v.state === "unknown" && !!v.similar, false);
});

// --- F1: honest declarations, displaced ink -------------------------------

test("forgery: a glyph displaced off its own cell is not `identical`", () => {
  // Nothing is added, removed or renamed here: the cell still declares its token
  // and its surround bits, and `x` is an attribute the profile allows. Only the
  // recompute check can catch this — the glyph is painted 40px from where the
  // cell it belongs to is drawn.
  const svg = render(VICTIM);
  const cell = firstCell(svg);
  const moved = cell.replace(/(<text x=")(\d+(?:\.\d+)?)/, (_m, p, x) => p + (Number(x) + 40));
  assert.notEqual(moved, cell);
  assert.equal(compareSvg(svg.replace(cell, moved), VICTIM).state, "unknown");
});

test("forgery: a reference declaring a note we cannot reproduce is not `identical`", () => {
  // The bottom strip is attacker-controlled text. A note the renderer would
  // reject can't be re-rendered, so the reference can't be confirmed.
  const svg = render(VICTIM, { note: "hi" });
  const forged = svg.replace('data-user-note="hi"', 'data-user-note="far too long to be a note"');
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

// --- document-level parser hardening --------------------------------------

test("forgery: a DOCTYPE with an internal entity subset is not `identical`", () => {
  const svg = render(VICTIM);
  const forged =
    '<!DOCTYPE svg [<!ENTITY x "y">]>' + svg;
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});

test("forgery: an <svg> nested inside the document is not `identical`", () => {
  const forged = render(VICTIM).replace("</svg>", `<svg>${COVER}</svg></svg>`);
  assert.equal(compareSvg(forged, VICTIM).state, "unknown");
});
