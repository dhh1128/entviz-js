/**
 * svg-profile: the strict XML reader and the entviz grammar that stand between
 * a pasted reference and any affirmative verdict.
 *
 * The parser tests are a rejection table — every construct a conformant entviz
 * never contains, and every way a document can be malformed, must come back
 * `null`. The grammar tests mutate a REAL render at the tree level and require
 * each mutation to be rejected, so the allow-lists can't silently drift away
 * from what the renderer emits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXT_NODE,
  extractEntvizChannels,
  glyphText,
  parseXml,
  recoverGeometry,
  treeEqual,
  validateEntvizProfile,
  type XmlNode,
} from "../../src/svg-profile.ts";
import { render } from "../../src/entviz.ts";

const V = "550e8400-e29b-41d4-a716-446655440000";

const el = (tag: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlNode => ({
  tag,
  attrs: new Map(Object.entries(attrs)),
  children,
  text: "",
});

/** A run of character data. */
const txt = (text: string): XmlNode => ({ tag: TEXT_NODE, attrs: new Map(), children: [], text });

const clone = (n: XmlNode): XmlNode => ({
  tag: n.tag,
  attrs: new Map(n.attrs),
  children: n.children.map(clone),
  text: n.text,
});

const parsed = (svg: string): XmlNode => parseXml(svg) as XmlNode;

// --- parseXml: what it accepts --------------------------------------------

test("parseXml: reads elements, attributes, nesting and character data", () => {
  const root = parsed('<a x="1" y=\'2\'>hi<b/><c z="3">deep</c></a>');
  assert.equal(root.tag, "a");
  assert.deepEqual([...root.attrs], [["x", "1"], ["y", "2"]]);
  assert.equal(root.children.length, 3); // the "hi" run, then <b/>, then <c>
  assert.equal(root.children[0].tag, TEXT_NODE);
  assert.equal(root.children[0].text, "hi");
  assert.equal(glyphText(root.children[2]), "deep");
});

test("parseXml: decodes the five predefined entities, in text and in attributes", () => {
  const root = parsed('<a t="&lt;&amp;&gt;&quot;&apos;">&amp;&lt;x&gt;</a>');
  assert.equal(root.attrs.get("t"), "<&>\"'");
  assert.equal(glyphText(root), "&<x>");
});

test("parseXml: accepts a leading XML declaration and surrounding whitespace", () => {
  assert.equal((parseXml('  <?xml version="1.0"?>\n<a/>\n') as XmlNode).tag, "a");
});

test("parseXml: accepts a real entviz", () => {
  assert.equal(parsed(render(V)).tag, "svg");
});

// --- parseXml: the rejection table ----------------------------------------

for (const [why, src] of [
  ["a comment", "<a><!-- x --></a>"],
  ["a CDATA section", "<a><![CDATA[x]]></a>"],
  ["a DOCTYPE", '<!DOCTYPE a><a/>'],
  ["an internal entity subset", '<!DOCTYPE a [<!ENTITY x "y">]><a/>'],
  ["a processing instruction", "<a><?php ?></a>"],
  ["an unterminated XML declaration", '<?xml version="1.0"<a/>'],
  ["an unknown entity", "<a>&nbsp;</a>"],
  ["a character reference", "<a>&#65;</a>"],
  ["an unterminated entity", "<a>&amp</a>"],
  ["an unknown entity in an attribute", '<a t="&nope;"/>'],
  ["a duplicate attribute", '<a x="1" x="2"/>'],
  ["an unquoted attribute value", "<a x=1/>"],
  ["a valueless attribute", "<a x/>"],
  ["an attribute with no closing quote", '<a x="1/>'],
  ["a `<` inside an attribute value", '<a x="<"/>'],
  ["a malformed tag name", "<1a/>"],
  ["a malformed attribute name", '<a "x"="1"/>'],
  ["a stray slash in a tag", "<a /x>"],
  ["an unclosed element", "<a><b></a>"],
  ["a mismatched close tag", "<a></b>"],
  ["an unclosed root", "<a>"],
  ["an unterminated close tag", "<a></a"],
  ["a truncated open tag", "<a"],
  ["character data before the root", "junk<a/>"],
  ["character data after the root", "<a/>junk"],
  ["a second root element", "<a/><b/>"],
  ["markup with no element at all", "nothing here"],
  ["nesting past the depth cap", "<a>".repeat(13) + "</a>".repeat(13)],
  ["more nodes than the cap", "<a>" + "<b/>".repeat(4096) + "</a>"],
] as const) {
  test(`parseXml: rejects ${why}`, () => {
    assert.equal(parseXml(src), null, why);
  });
}

// --- the entviz grammar: honest documents pass ----------------------------

test("validateEntvizProfile: accepts every shape the renderer emits", () => {
  for (const [value, opts] of [
    [V, {}],
    ["012345", {}], // blank cells
    ["0123456789abcdef".repeat(16), {}], // >512-bit (truncated, fingerprint middle)
    ["did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", { note: "hi" }], // bottom label
    ["hello world this is text", { targetAr: 2, fontSizePt: 20 }],
    ["1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", { targetAr: 0.3, fontSizePt: 6 }],
  ] as const) {
    assert.equal(validateEntvizProfile(parsed(render(value, opts))), true, value);
  }
});

test("validateEntvizProfile: the truncated top label is one marker tspan + bare characters", () => {
  // v17 correction: this SERIALIZATION is normative, and there is exactly one of
  // it. The `+hash ` marker is a tspan; the projected label that follows is BARE
  // CHARACTER DATA. entviz-js used to wrap that remainder in a second tspan —
  // same line, same raster, different DOM — and the grammar accepted both, so a
  // python-rendered >512-bit reference could never pass the recompute gate and
  // degraded from the `≈` chip to plain `unknown`. See this.i:gwhtl8r1.
  const doc = parsed(render("0123456789abcdef".repeat(16)));
  const label = doc.children[4].children[0];
  assert.deepEqual(label.children.map((c) => c.tag), ["tspan", TEXT_NODE]);
  assert.equal(glyphText(label.children[0]), "+hash ");
  assert.equal(label.children[1].text, "hex, 1024-bit");
  assert.equal(validateEntvizProfile(doc), true);

  // ...and the divergent form is now rejected rather than tolerated.
  const wrapped = clone(doc);
  const wLabel = wrapped.children[4].children[0];
  wLabel.children[1] = el("tspan", {}, [txt(label.children[1].text)]);
  assert.equal(validateEntvizProfile(wrapped), false);
});

test("validateEntvizProfile: the bottom strip keeps its two-tspan form", () => {
  // The suffix+note bottom strip is `tspan,tspan` in BOTH implementations, and a
  // note alone is a lone tspan (it is quiet gray and carries data-user-note), so
  // the per-channel shapes differ from the top strip's on purpose.
  // A bech32 address carries its verified 6-character checksum as the suffix, so
  // with a note the strip is "...<suffix> (<note>)" — the two-tspan case.
  const noted = parsed(render("cosmos1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnrk363e", { note: "hi" }));
  const bottom = noted.children.find((c) => c.attrs.get("data-channel") === "label-bottom");
  assert.deepEqual(bottom!.children[0].children.map((c) => c.tag), ["tspan", "tspan"]);
  assert.equal(validateEntvizProfile(noted), true);
  // Bare characters ahead of the note tspan is not a shape this channel emits.
  const mixed = clone(noted);
  const mLabel = mixed.children.find((c) => c.attrs.get("data-channel") === "label-bottom")!.children[0];
  mLabel.children[0] = txt("...abcd ");
  assert.equal(validateEntvizProfile(mixed), false);
});

test("parseXml: a text run keeps its position among the elements around it", () => {
  // `<text>a<tspan>b</tspan></text>` and `<text><tspan>b</tspan>a</text>` paint
  // different labels, so they must not parse to the same tree.
  const a = parsed("<text>a<tspan>b</tspan></text>");
  const b = parsed("<text><tspan>b</tspan>a</text>");
  assert.equal(treeEqual(a, b), false);
});

// --- the entviz grammar: the rejection table ------------------------------

const DOC = parsed(render(V));
const NOTED = parsed(render(V, { note: "hi" }));

const gridOf = (d: XmlNode) => d.children[2];
const cellsOf = (d: XmlNode) => gridOf(d).children[gridOf(d).children.length - 1];
const barOf = (d: XmlNode) => d.children[3];

test("validateEntvizProfile: the fixture documents have the shape the mutations assume", () => {
  assert.equal(DOC.children[0].tag, "defs");
  assert.equal(gridOf(DOC).attrs.get("data-channel"), "grid");
  assert.equal(barOf(DOC).attrs.get("data-channel"), "color-bar");
  assert.equal(DOC.children[4].attrs.get("data-channel"), "label-top");
  assert.equal(NOTED.children[5].attrs.get("data-channel"), "label-bottom");
  assert.equal(gridOf(DOC).children[2].attrs.get("data-channel"), "ellipse");
});

const REJECTS: [string, (d: XmlNode) => void, XmlNode?][] = [
  ["a root that isn't <svg>", (d) => void (d.tag = "div")],
  ["character data on the root", (d) => void d.children.push(txt("x"))],
  ["an unknown attribute on the root", (d) => d.attrs.set("opacity", "0")],
  ["a missing <defs>", (d) => void d.children.shift()],
  ["an attribute on <defs>", (d) => d.children[0].attrs.set("id", "x")],
  ["a second child in <defs>", (d) => void d.children[0].children.push(el("rect"))],
  ["a non-clipPath in <defs>", (d) => void (d.children[0].children[0] = el("g"))],
  ["an unknown attribute on the clipPath", (d) => d.children[0].children[0].attrs.set("fill", "#000")],
  ["a second child in the clipPath", (d) => void d.children[0].children[0].children.push(el("rect"))],
  ["a non-rect inside the clipPath", (d) => void (d.children[0].children[0].children[0] = el("text"))],
  ["a background that isn't a plain rect", (d) => void (d.children[1] = el("g"))],
  ["an unknown attribute on the background", (d) => d.children[1].attrs.set("display", "none")],
  ["character data inside the background", (d) => void d.children[1].children.push(txt("x"))],
  ["a missing grid channel", (d) => void gridOf(d).attrs.delete("data-channel")],
  ["an unknown attribute on the grid", (d) => gridOf(d).attrs.set("data-color-bar-band", "W")],
  ["a grid whose first child isn't the backing rect", (d) => void (gridOf(d).children[0] = el("g"))],
  ["an attribute on the surround-path group", (d) => gridOf(d).children[1].attrs.set("opacity", "0")],
  ["a non-path in the surround-path group", (d) => void gridOf(d).children[1].children.push(el("text"))],
  ["an unknown attribute on the ellipse overlay group", (d) => gridOf(d).children[2].attrs.set("display", "none")],
  ["a second child in the ellipse overlay group", (d) => void gridOf(d).children[2].children.push(el("rect"))],
  ["a non-ellipse in the ellipse overlay group", (d) => void (gridOf(d).children[2].children[0] = el("rect"))],
  ["an unknown attribute on the ellipse", (d) => gridOf(d).children[2].children[0].attrs.set("opacity", "0")],
  ["an attribute on the cell container", (d) => cellsOf(d).attrs.set("transform", "translate(9,9)")],
  ["content painted after the cells", (d) => void gridOf(d).children.push(el("rect"))],
  ["a cell container with no cells", (d) => void (cellsOf(d).children.length = 0)],
  ["a cell that isn't in the cell channel", (d) => void cellsOf(d).children[0].attrs.set("data-channel", "x")],
  ["an unknown attribute on a cell", (d) => cellsOf(d).children[0].attrs.set("visibility", "hidden")],
  ["character data on a cell group", (d) => void cellsOf(d).children[0].children.push(txt("x"))],
  ["a cell with no index", (d) => void cellsOf(d).children[0].attrs.delete("data-cell-index")],
  ["a non-numeric cell index", (d) => cellsOf(d).children[0].attrs.set("data-cell-index", "1a")],
  ["a duplicate cell index", (d) => void cellsOf(d).children.push(clone(cellsOf(d).children[0]))],
  ["a foreign element inside a cell", (d) => void cellsOf(d).children[0].children.push(el("line"))],
  ["a third rect inside a cell", (d) => {
    const c = cellsOf(d).children[0];
    c.children.unshift(clone(c.children[0]), clone(c.children[0]));
  }],
  ["a second glyph inside a cell", (d) => {
    const c = cellsOf(d).children[0];
    c.children.push(clone(c.children[c.children.length - 1]));
  }],
  ["a rect painted after a cell's glyph", (d) => {
    const c = cellsOf(d).children[0];
    c.children.push(clone(c.children[0]));
  }],
  ["a cell with no backing rect", (d) => void (cellsOf(d).children[0].children = [])],
  ["an unknown attribute on a cell glyph", (d) => {
    const c = cellsOf(d).children[0];
    c.children[c.children.length - 1].attrs.set("transform", "translate(-9999,0)");
  }],
  ["an unknown attribute on the colour bar", (d) => barOf(d).attrs.set("opacity", "0")],
  ["character data on the colour bar", (d) => void barOf(d).children.push(txt("x"))],
  ["a band with no rank", (d) => void barOf(d).children[0].attrs.delete("data-color-bar-rank")],
  ["an unknown attribute on a band", (d) => barOf(d).children[0].attrs.set("display", "none")],
  ["an empty band", (d) => void (barOf(d).children[0].children.length = 0)],
  ["a band whose first child isn't a rect", (d) => void (barOf(d).children[0].children[0] = el("text"))],
  ["a third child in a band", (d) => void barOf(d).children[0].children.push(el("text"))],
  ["a band whose second child isn't a letter", (d) => void (barOf(d).children[0].children[1] = el("rect"))],
  ["a non-circle after the bands", (d) => void barOf(d).children.push(el("rect"))],
  ["a missing top label", (d) => void d.children.splice(4, 1)],
  ["a top label with two children", (d) => void d.children[4].children.push(el("text"))],
  ["an unknown attribute on a label", (d) => d.children[4].attrs.set("opacity", "0")],
  ["an unknown attribute on a label's text", (d) => d.children[4].children[0].attrs.set("display", "none")],
  ["a label with three runs", (d) => {
    d.children[4].children[0].children.push(el("tspan"), el("tspan"));
  }],
  ["an empty label", (d) => void (d.children[4].children[0].children.length = 0)],
  ["a foreign run inside a label", (d) => void d.children[4].children[0].children.push(el("text"))],
  ["trailing content that isn't a border rule", (d) => void d.children.push(el("rect"))],
  // The bottom label strip (present only when there is a note or a suffix).
  ["a bottom label with a foreign child", (d) => void (d.children[5].children[0].children[0] = el("text")), NOTED],
  ["three tspans in the bottom label", (d) => {
    const t = d.children[5].children[0];
    t.children.push(el("tspan"), el("tspan"));
  }, NOTED],
  ["a tspan with children of its own", (d) => void d.children[5].children[0].children[0].children.push(el("tspan")), NOTED],
];

for (const [why, mutate, base] of REJECTS) {
  test(`validateEntvizProfile: rejects ${why}`, () => {
    const d = clone(base ?? DOC);
    assert.equal(validateEntvizProfile(d), true, "the fixture must start valid");
    mutate(d);
    assert.equal(validateEntvizProfile(d), false, why);
  });
}

// --- channel extraction ----------------------------------------------------

test("extractEntvizChannels: reads the declared channels in cell-index order", () => {
  const ch = extractEntvizChannels(parsed(render(V))) as NonNullable<ReturnType<typeof extractEntvizChannels>>;
  assert.equal(ch.truncated, false);
  assert.equal(ch.filled.length, 6); // a 128-bit UUID: 6 hex tokens
  assert.equal(ch.filled[0].text, "550e84");
  assert.ok(ch.filled[0].surroundBits > 0);
  assert.ok(ch.colorBarLetters.length > 0);
  assert.ok(ch.colorBarLetters.every((l) => /^[wgrbk]$/.test(l)));
});

test("extractEntvizChannels: reports a >512-bit reference as truncated", () => {
  const ch = extractEntvizChannels(parsed(render("0123456789abcdef".repeat(16))));
  assert.equal(ch?.truncated, true);
});

test("extractEntvizChannels: skips blanks and glyphless cells, and null when nothing is left", () => {
  const d = clone(DOC);
  const cells = cellsOf(d).children;
  // A cell with no <text> child contributes nothing...
  cells[0].children = cells[0].children.filter((c) => c.tag !== "text");
  assert.equal((extractEntvizChannels(d) as { filled: unknown[] }).filled.length, 5);
  // ...and neither does one marked blank.
  for (const c of cells) c.attrs.set("data-cell-blank", "true");
  assert.equal(extractEntvizChannels(d), null);
});

test("extractEntvizChannels: a malformed surround-bits annotation reads as zero, not as junk", () => {
  const d = clone(DOC);
  cellsOf(d).children[0].attrs.set("data-surround-bits", "0xZZZZ");
  assert.equal((extractEntvizChannels(d) as { filled: { surroundBits: number }[] }).filled[0].surroundBits, 0);
});

// --- geometry recovery -----------------------------------------------------

test("recoverGeometry: recovers the declared grid, width and note", () => {
  const g = recoverGeometry(NOTED);
  assert.deepEqual(
    { cols: g?.cols, rows: g?.rows, note: g?.note },
    { cols: Number(NOTED.attrs.get("data-cols")), rows: Number(NOTED.attrs.get("data-rows")), note: "hi" },
  );
  assert.equal(recoverGeometry(DOC)?.note, null);
  assert.equal(recoverGeometry(DOC)?.boundingW, Number(DOC.attrs.get("width")));
});

test("recoverGeometry: null when the declared geometry is unusable", () => {
  for (const mutate of [
    (d: XmlNode) => d.attrs.set("data-cols", "0"),
    (d: XmlNode) => d.attrs.set("data-rows", "x"),
    (d: XmlNode) => d.attrs.delete("data-cols"),
    (d: XmlNode) => d.attrs.set("width", "wide"),
    (d: XmlNode) => d.attrs.set("width", "0"),
  ]) {
    const d = clone(DOC);
    mutate(d);
    assert.equal(recoverGeometry(d), null);
  }
});

// --- tree equality ---------------------------------------------------------

test("treeEqual: a document equals itself and an independent render of the same value", () => {
  assert.equal(treeEqual(DOC, parsed(render(V))), true);
});

test("treeEqual: coordinates may differ by a rounding tie, but not visibly", () => {
  // Two conformant renderers disagree only where a coordinate lands exactly on a
  // half at the third decimal (half-up vs half-even), i.e. by 0.001.
  const a = el("rect", { x: "28.5625", d: "M1 2h3" });
  assert.equal(treeEqual(a, el("rect", { x: "28.563", d: "M1 2h3" })), true);
  assert.equal(treeEqual(a, el("rect", { x: "28.62", d: "M1 2h3" })), false);
  assert.equal(treeEqual(a, el("rect", { x: "28.5625", d: "M1 2h9" })), false);
  // A different shape of value is never "close".
  assert.equal(treeEqual(el("rect", { fill: "#ffffff" }), el("rect", { fill: "#e7be00" })), false);
});

test("treeEqual: the library build is ignored; everything else must match", () => {
  const a = el("svg", { "data-entviz-lib": "0.17.0", "data-entviz-version": "v17" });
  assert.equal(treeEqual(a, el("svg", { "data-entviz-lib": "9.9.9", "data-entviz-version": "v17" })), true);
  assert.equal(treeEqual(a, el("svg", { "data-entviz-version": "v17" })), true);
  assert.equal(treeEqual(a, el("svg", { "data-entviz-version": "v16" })), false);
});

test("treeEqual: tag, text, attribute set and child list all count", () => {
  const a = el("g", { x: "1" }, [el("rect")]);
  assert.equal(treeEqual(a, el("h", { x: "1" }, [el("rect")])), false);
  assert.equal(treeEqual(el("text", {}, [txt("ink")]), el("text", {}, [txt("INK")])), false);
  assert.equal(treeEqual(a, el("g", { x: "1" }, [])), false);
  assert.equal(treeEqual(a, el("g", { x: "1", y: "2" }, [el("rect")])), false);
  assert.equal(treeEqual(el("g", { x: "1", y: "2" }, [el("rect")]), a), false);
  assert.equal(treeEqual(a, el("g", { y: "1" }, [el("rect")])), false);
  assert.equal(treeEqual(a, el("g", { x: "1" }, [el("text")])), false);
});
