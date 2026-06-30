import { test } from "node:test";
import assert from "node:assert/strict";
import {
  El,
  drawQuartileMark,
  twoBitUsage,
  twoBitFirstAppearance,
  drawColorBar,
  drawLabels,
  drawEllipse,
  borderLine,
  enumerateInteriorCorners,
  enumerateExternalCorners,
} from "../../src/entviz.ts";

const EDGE = ["#ffffff", "#e7be00", "#ff3f2f", "#2f3fbf"];

test("El: numbers stringify, empty element self-closes", () => {
  const e = new El("rect").set("x", 5).set("fill", "#fff");
  assert.equal(e.render(), '<rect x="5" fill="#fff"/>');
});

test("El: text content is XML-escaped and wrapped in open/close tags", () => {
  const e = new El("text");
  e.text = 'a<b>&"c"';
  assert.equal(e.render(), '<text>a&lt;b&gt;&amp;&quot;c&quot;</text>');
});

test("El: child() nests and add() returns the appended element", () => {
  const root = new El("g");
  root.child("rect").set("x", 1);
  const standalone = new El("circle");
  assert.equal(root.add(standalone), standalone);
  assert.match(root.render(), /^<g><rect x="1"\/><circle\/><\/g>$/);
});

test("twoBitUsage: tallies the four 2-bit patterns across 256 slices", () => {
  assert.equal(twoBitUsage(Buffer.alloc(64, 0x00), EDGE).get("#ffffff"), 256); // all 00
  assert.equal(twoBitUsage(Buffer.alloc(64, 0xff), EDGE).get("#2f3fbf"), 256); // all 11
  const mixed = twoBitUsage(Buffer.alloc(64, 0x1b), EDGE); // 0x1b -> one of each
  for (const c of EDGE) assert.equal(mixed.get(c), 64);
});

test("twoBitFirstAppearance: orders colors by first appearance, tie-break by pattern", () => {
  // 0x1b scans patterns 3,2,1,0 within the first byte -> that is the order.
  assert.deepEqual(twoBitFirstAppearance(Buffer.alloc(64, 0x1b), EDGE),
    ["#2f3fbf", "#ff3f2f", "#e7be00", "#ffffff"]);
  // all-zero: only pattern 0 appears; absent patterns fall back to value order.
  assert.deepEqual(twoBitFirstAppearance(Buffer.alloc(64, 0x00), EDGE), EDGE);
});

test("drawColorBar: emits the band channel, slots, and both gutter markers", () => {
  const root = new El("svg");
  const second = Buffer.alloc(64);
  second[12] = 5;
  second[13] = 9;
  drawColorBar(root, Buffer.alloc(64, 0x1b), EDGE, 20, 200, 12, second);
  const out = root.render();
  assert.match(out, /data-channel="color-bar"/);
  assert.match(out, /data-bar-slots="16"/); // floor((200-2)/12)=16
  assert.match(out, /data-bar-marker-left="5"/); // 5 % 16
  assert.match(out, /data-bar-marker-right="9"/);
  assert.match(out, /data-color-bar-letter="true"/);
});

test("drawColorBar: degenerate empty palette draws nothing", () => {
  const root = new El("svg");
  drawColorBar(root, Buffer.alloc(64, 0x1b), [], 20, 200, 12, Buffer.alloc(64));
  assert.equal(root.children.length, 0);
});

test("drawQuartileMark: a triangle polygon in each of the four corners", () => {
  for (let q = 0; q < 4; q++) {
    const g = new El("g");
    drawQuartileMark(g, 0, 0, 48, 20, q, "#000000");
    assert.match(g.render(), /<polygon points="[^"]+" fill="#000000"\/>/);
  }
});

test("drawLabels: top strip variants (type only, type+prefix, prefix only, empty)", () => {
  const top = (typeName: string, prefix: string | null) => {
    const svg = new El("svg");
    drawLabels(svg, 10, 100, 30, 200, 20, typeName, prefix, null, 12, null);
    return svg.render();
  };
  assert.match(top("hex(6)", null), />hex\(6\):</);
  assert.match(top("ETH", "0xabc"), />ETH: 0xabc\.\.\.</);
  assert.match(top("", "swh:1:rev:x"), />swh:1:rev:x\.\.\.</);
  assert.match(top("", null), /<text[^>]*><\/text>/); // empty label still emitted
});

test("drawLabels: bottom strip variants (suffix, suffix+note, note only)", () => {
  const bottom = (suffix: string | null, note: string | null) => {
    const svg = new El("svg");
    drawLabels(svg, 10, 100, 30, 200, 20, "hex(6)", null, suffix, 12, note);
    return svg.render();
  };
  assert.match(bottom("ab", null), /\.\.\.ab</);
  const both = bottom("ab", "git");
  assert.match(both, /\.\.\.ab /);
  assert.match(both, /data-user-note="git"/);
  assert.match(bottom(null, "git"), /data-user-note="git"/);
});

test("borderLine: a crisp 1px gray line", () => {
  const svg = new El("svg");
  borderLine(svg, 0, 0.5, 100, 0.5);
  assert.match(svg.render(), /<line x1="0" y1="0.5" x2="100" y2="0.5" stroke="#808080"/);
});

test("enumerate corners: interior count (cols-1)(rows-1); external 2(cols+rows)", () => {
  assert.equal(enumerateInteriorCorners(3, 3, 10, 10, 0, 0).length, 4);
  assert.equal(enumerateExternalCorners(2, 2, 10, 10, 0, 0).length, 8);
});

test("drawEllipse: large grid uses interior anchors; channel + ellipse emitted", () => {
  const g = new El("g");
  const digest = Buffer.alloc(64);
  digest[60] = 3; digest[61] = 7; digest[62] = 11; digest[63] = 5;
  drawEllipse(g, digest, 10, 10, 240, 160, 60, 40, { cols: 4, rows: 4, tokenCount: 16 }, "#ffffff", "clip-x");
  assert.match(g.render(), /data-channel="ellipse"/);
  assert.match(g.render(), /<ellipse /);
});

test("drawEllipse: small grid uses external anchors; blue bg lightens", () => {
  const g = new El("g");
  drawEllipse(g, Buffer.alloc(64, 0x40), 10, 10, 120, 80, 60, 40, { cols: 2, rows: 2, tokenCount: 4 }, "#2f3fbf", "clip-y");
  assert.match(g.render(), /fill="#ffffff"/); // lighten overlay on a blue entviz
});

test("drawEllipse: an out-of-palette bg falls back to the default darken overlay", () => {
  const g = new El("g");
  drawEllipse(g, Buffer.alloc(64, 0x20), 10, 10, 120, 80, 60, 40, { cols: 2, rows: 2, tokenCount: 4 }, "#000000", "clip-z");
  assert.match(g.render(), /<ellipse /); // no throw; fallback overlay applied
});
