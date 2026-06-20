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
  assert.equal(SPEC_VERSION, "v10");
  assert.match(a, new RegExp(`data-entviz-version="${SPEC_VERSION}"`));
  assert.match(a, /viewBox="0 0 /);
  assert.match(a, /data-cols="\d+"/);
  assert.match(a, /data-rows="\d+"/);
});

test("render: the txt-to-b64url fallback labels the input and renders", () => {
  const svg = render("hello, world");
  assert.match(svg, /txt\(12\)-&gt;b64url/); // the gt char is XML-escaped in the label
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

test("render: a user note renders in the bottom strip", () => {
  const svg = render("a1b2c3d4", { note: "git" });
  assert.match(svg, /data-user-note="git"/);
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
  assert.throws(() => render("a1b2c3d4", { note: "two words" }));
  assert.throws(() => render("a1b2c3d4", { note: "toolongnote" }));
});

test("render: out-of-range font size and aspect ratio are rejected", () => {
  assert.throws(() => render("a1b2c3d4", { fontSizePt: 4 }), /font_size_pt/);
  assert.throws(() => render("a1b2c3d4", { fontSizePt: 40 }), /font_size_pt/);
  assert.throws(() => render("a1b2c3d4", { targetAr: 0 }), /target_ar/);
  assert.throws(() => render("a1b2c3d4", { targetAr: 200 }), /target_ar/);
});

test("render: a >512-bit input rejects (large-input path not yet ported)", () => {
  assert.throws(() => render("a".repeat(130)), /large-input/); // 65 bytes
});

// TST-F4: whitespace-only input and the byte-length boundary on the fallback.
test("render: whitespace-only input produces no tokens and is rejected", () => {
  assert.throws(() => render("   "), /No tokens/);
  assert.throws(() => render("\t\n "), /No tokens/);
});

test("render: the fallback byte-length boundary is exactly 64 bytes", () => {
  // 'z' is non-hex, so these take the UTF-8 -> base64url fallback. 64 bytes is
  // the largest short-path input; 65 must reject (SEC-F1 guards this cheaply).
  assert.match(render("z".repeat(64)), /^<svg/);
  assert.throws(() => render("z".repeat(65)), /large-input/);
});

// SEC-F2: SVG/HTML-hostile entropy must never reach the output unescaped. Raw
// input goes through the base64url fallback (not echoed), and any derived text
// is XML-escaped — so a markup-injection attempt produces a safe, well-formed
// document with no live `<script>`/event-handler tags.
test("render: SVG-hostile entropy is neutralized (no raw injected markup)", () => {
  const svg = render('</svg><script>alert(1)</script>&"');
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<\/svg><script/);
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
});

// PSY-JS-F5: the spec's oral-readout requirement leans on a monospace font
// chain; assert it is actually emitted (quotes are XML-escaped in the attr).
test("render: the monospace font chain is emitted for cell text", () => {
  const svg = render("The quick brown fox jumps over the lazy dog");
  assert.match(svg, /&quot;JetBrains Mono&quot;/);
  assert.match(svg, /monospace/);
});
