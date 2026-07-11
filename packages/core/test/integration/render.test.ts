import { test } from "node:test";
import assert from "node:assert/strict";
import { render, SPEC_VERSION } from "../../src/entviz.ts";

// End-to-end render() tests. The substance of each stage is unit-tested in
// test/unit/; these confirm the orchestration wires the stages together and
// that the document-level invariants hold.

test("render is deterministic and stamps the spec version + viewBox", () => {
  const a = render("0123456789abcdef0123456789abcdef");
  const b = render("0123456789abcdef0123456789abcdef");
  assert.equal(a, b);
  assert.equal(SPEC_VERSION, "v15");
  assert.match(a, new RegExp(`data-entviz-version="${SPEC_VERSION}"`));
  assert.match(a, /viewBox="0 0 /);
  assert.match(a, /data-cols="\d+"/);
  assert.match(a, /data-rows="\d+"/);
});

test("render: the UTF-8 fallback labels the input and renders", () => {
  // v14: the top label is a projection of the characterization — the UTF-8
  // fallback (scheme=null, size_basis=utf8) reads "text, <N>-byte", NOT the old
  // "txt(N)->b64url" fusing. "hello, world" is 12 bytes.
  const svg = render("hello, world");
  assert.match(svg, /text, 12-byte/);
});

test("render: a base64url-alphabet entviz renders full-size cell text", () => {
  // Non-hex/non-UUID input goes through the 6-bit path (cell text at reference).
  const svg = render("The quick brown fox jumps over the lazy dog");
  assert.match(svg, /data-channel="grid"/);
});

test("render: v9 color-bar markers are present and in range", () => {
  const svg = render("0123456789abcdef0123456789abcdef");
  const K = Number(/data-bar-slots="(\d+)"/.exec(svg)![1]);
  assert.ok(K >= 4 && K <= 16);
  assert.ok(Number(/data-bar-marker-left="(\d+)"/.exec(svg)![1]) < K);
  assert.ok(Number(/data-bar-marker-right="(\d+)"/.exec(svg)![1]) < K);
});

test("render: v8 blank-map markers carry row,col; max is a plus path", () => {
  // 66 hex chars -> 11 tokens -> 3x4 grid -> exactly one (map) blank.
  const svg = render("a".repeat(66));
  assert.match(svg, /data-blank-map-min="\d+,\d+"/);
  assert.match(svg, /<path[^>]*data-blank-map-max="\d+,\d+"/);
});

// v10 surround collapse: each filled cell DECLARES its 24-bit surround pattern
// as data-surround-bits (hex), plus data-edge-color when bits != 0. The boxes
// are drawn as one <path> per cell in the surround layer (one 'M' subpath per
// set box). The declared popcount must equal the total subpath count.
test("render: filled cells declare surround bits + edge color, path subpaths match popcount", () => {
  const svg = render(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  // (a) every cell group's data-surround-bits parses as hex, and
  //     data-edge-color is present iff bits != 0.
  let totalBits = 0;
  let sawCell = false;
  for (const m of svg.matchAll(/<g\b[^>]*data-channel="cell"[^>]*>/g)) {
    sawCell = true;
    const tag = m[0];
    const bitsAttr = tag.match(/data-surround-bits="(0x[0-9a-f]+)"/);
    if (!bitsAttr) continue;
    const bits = Number.parseInt(bitsAttr[1], 16);
    assert.ok(Number.isFinite(bits), `unparseable surround bits in ${tag}`);
    let pop = 0;
    for (let b = bits; b; b >>>= 1) pop += b & 1;
    totalBits += pop;
    const hasEdge = /data-edge-color="/.test(tag);
    assert.equal(hasEdge, bits !== 0, `data-edge-color present iff bits != 0: ${tag}`);
  }
  assert.ok(sawCell, "no cell groups found");
  assert.ok(totalBits > 0, "no surround bits set");

  // (b) the surround paths' 'M' subpath count equals the total popcount. The
  //     surround paths are the <path fill> tags with no data-blank-map-* attr.
  let totalSubpaths = 0;
  for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = m[0];
    if (tag.includes("data-blank-map-")) continue;
    const d = tag.match(/\bd="([^"]*)"/);
    if (!d) continue;
    totalSubpaths += (d[1].match(/M/g) ?? []).length;
  }
  assert.equal(totalSubpaths, totalBits, "surround path subpaths must equal declared popcount");
});

test("render: a user note renders in the bottom strip", () => {
  const svg = render("a1b2c3d4", { note: "git" });
  assert.match(svg, /data-user-note="git"/);
});

test("render: printable-ASCII notes (spaces, punctuation) render", () => {
  assert.match(render("a1b2c3d4", { note: "two words" }), /data-user-note="two words"/);
  assert.match(render("a1b2c3d4", { note: "a.b_c-d!" }), /data-user-note="a\.b_c-d!"/);
});

test("render: a note with XML-special chars is escaped (attribute and text)", () => {
  // < > & " are valid printable-ASCII note chars now, so they MUST be escaped
  // in both the data-user-note attribute and the text node — no raw <b>.
  const svg = render("a1b2c3d4", { note: 'a<b>&"x' });
  assert.match(svg, /data-user-note="a&lt;b&gt;&amp;&quot;x"/); // attribute
  assert.match(svg, /\(a&lt;b&gt;&amp;&quot;x\)/); // text node
  assert.ok(!svg.includes("<b>"), "no raw <b> tag may leak");
});

test("render: dashed and undashed UUIDs collapse to identical entvizes", () => {
  const strip = (s: string) => s.replace(/ data-input-bytes="\d+"/, "");
  assert.equal(
    strip(render("550e8400-e29b-41d4-a716-446655440000")),
    strip(render("550e8400e29b41d4a716446655440000")),
  );
});

test("render: empty input produces no tokens and is rejected", () => {
  assert.throws(() => render(""), /No tokens/);
});

test("render: invalid note is rejected", () => {
  assert.throws(() => render("a1b2c3d4", { note: "toolongnote" })); // 11 chars
  assert.throws(() => render("a1b2c3d4", { note: "ab\tcd" })); // control char (tab)
  assert.throws(() => render("a1b2c3d4", { note: "café" })); // non-ASCII (é)
});

test("render: out-of-range font size and aspect ratio are rejected", () => {
  assert.throws(() => render("a1b2c3d4", { fontSizePt: 4 }), /font_size_pt/);
  assert.throws(() => render("a1b2c3d4", { fontSizePt: 40 }), /font_size_pt/);
  assert.throws(() => render("a1b2c3d4", { targetAr: 0 }), /target_ar/);
  assert.throws(() => render("a1b2c3d4", { targetAr: 200 }), /target_ar/);
});

// >512-bit large-input handling now renders (head+middle+tail, truncated) — see
// test/{unit,integration}/large-input.test.ts for the full coverage.
test("render: a >512-bit input renders via the large-input path (truncated)", () => {
  assert.match(render("a".repeat(130)), /data-truncated="true"/); // 65 bytes
});

// Numeric serialization (spec): coordinates are compact plain decimals — no
// exponential notation, at most 3 fractional digits, integers without a point.
test("render: numeric attributes are compact plain decimals (no exponent, <=3dp)", () => {
  for (const input of [
    "0123456789abcdef0123456789abcdef",
    "550e8400-e29b-41d4-a716-446655440000",
    "a".repeat(66), // forces a blank-cell map + ellipse geometry
  ]) {
    const svg = render(input);
    for (const m of svg.matchAll(/="(-?\d+(?:\.\d+)?)"/g)) {
      const value = m[1];
      assert.doesNotMatch(value, /[eE]/, `exponential notation in "${value}"`);
      const frac = value.split(".")[1];
      assert.ok(!frac || frac.length <= 3, `>3 fractional digits in "${value}"`);
      assert.doesNotMatch(value, /^-?\d+\.\d*0$/, `untrimmed trailing zero in "${value}"`);
    }
  }
});

// TST-F4: whitespace-only input and the byte-length boundary on the fallback.
test("render: whitespace-only input produces no tokens and is rejected", () => {
  assert.throws(() => render("   "), /No tokens/);
  assert.throws(() => render("\t\n "), /No tokens/);
});

test("render: the fallback byte-length boundary — 64 bytes lossless, 65 bytes truncated", () => {
  // An interior space puts the input in NO known alphabet (disproof declines)
  // and survives the leading/trailing trim, so it takes the UTF-8 -> base64url
  // fallback. The fallback core represents N bytes; truncation triggers once the
  // decoded core exceeds 64 bytes (>512 bits), i.e. once the original input
  // passes 64 bytes. (A bare 'z'*64 is now claimed by disproof as base32 — the
  // port is faithful to the reference's full dispatch — so it no longer hits
  // this path.)
  const withSpace = (extra: number) => "z".repeat(32) + " " + "z".repeat(extra);
  assert.doesNotMatch(render(withSpace(31)), /data-truncated/); // 64 bytes
  assert.match(render(withSpace(32)), /data-truncated="true"/); // 65 bytes
});

// SEC-F2: SVG/HTML-hostile entropy must never reach the output unescaped. Raw
// input goes through the base64url fallback (not echoed), and any derived text
// is XML-escaped — so a markup-injection attempt produces a safe, well-formed
// document with no live `<script>`/event-handler tags.
test("render: SVG-hostile entropy is neutralized (no raw injected markup)", () => {
  const svg = render('</svg><script>alert(1)</script>&"');
  // Plain substring checks (case-insensitive), not tag-filtering regexes: the
  // injected markup and payload must not appear anywhere in the output.
  const lower = svg.toLowerCase();
  assert.ok(!lower.includes("<script"));
  assert.ok(!svg.includes("alert(1)"));
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
});

// PSY-JS-F5: the spec's oral-readout requirement leans on a monospace font
// chain; assert it is actually emitted (quotes are XML-escaped in the attr).
// The chain is now hoisted ONCE onto the root <svg> as an inherited
// presentation property, so it still appears (escaped) — just not per-<text>.
test("render: the monospace font chain is emitted for cell text", () => {
  const svg = render("The quick brown fox jumps over the lazy dog");
  assert.match(svg, /&quot;JetBrains Mono&quot;/);
  assert.match(svg, /monospace/);
});

// font-family is hoisted to the root <svg> (inherited), not repeated per
// <text>; each <text> carries only a compact font-size attribute.
test("render: font-family is set once on the root <svg> and inherited", () => {
  const svg = render("550e8400-e29b-41d4-a716-446655440000");
  // The chain marker appears exactly once (on the root <svg>).
  assert.equal(svg.match(/JetBrains/g)?.length, 1);
  assert.equal(svg.match(/font-family=/g)?.length, 1);
  // The root <svg> open tag carries it.
  const rootTag = svg.slice(0, svg.indexOf(">") + 1);
  assert.match(rootTag, /font-family=/);
  // No <text> carries a per-text font-family (neither attr nor style).
  for (const m of svg.matchAll(/<text\b[^>]*>/g)) {
    const tag = m[0];
    assert.ok(!tag.includes("font-family"), `<text> sets its own font-family: ${tag}`);
    assert.match(tag, /font-size="/, `<text> missing font-size attr: ${tag}`);
  }
});
