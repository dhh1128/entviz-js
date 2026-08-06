/**
 * svg-profile — strict parse + structural validation of a PASTED entviz SVG.
 *
 * This is the security floor under the SVG comparison engine
 * (comparison-design.md §6.2). A pasted reference is attacker-authorable, and
 * the engine's affirmative verdict is derived from what the document DECLARES
 * (its `<text>` glyph strings and `data-*` annotations). A declared channel is
 * worthless unless it is provably the one PAINTED, so this module exists to
 * make "what the document declares" and "what a viewer paints" the same thing:
 *
 *  1. {@link parseXml} — a deliberately tiny, strict XML reader. It accepts the
 *     exact serialization our renderer emits and nothing else: no comments, no
 *     CDATA, no DOCTYPE (hence no internal entity subset), no processing
 *     instruction except a leading XML declaration, no character references, no
 *     duplicate attributes, no unbalanced or multiple roots. A regex scan over
 *     raw markup cannot see structure, which is exactly what the F1 forgeries
 *     exploited; everything downstream works on the tree instead.
 *  2. {@link validateEntvizProfile} — the entviz GRAMMAR, not a tag whitelist.
 *     Element sequence, nesting, per-position attribute allow-lists, child
 *     counts and cell-index uniqueness are all pinned to the exact shape
 *     `render()` produces. Extra ink then has nowhere legal to live: there is
 *     no node that may carry `opacity`/`display`/`visibility`, no second
 *     `<text>` inside a cell, no drawable content inside `<defs>`, and no
 *     `data-color-bar-band` outside the colour bar.
 *  3. {@link treeEqual} — the recompute check. The caller re-renders the user's
 *     value through this library's own renderer and compares the two trees; a
 *     match means the reference IS our rendering of that value, so declared and
 *     painted coincide by construction.
 *
 * All of it is pure and isomorphic (no DOM), so it stays unit-testable and runs
 * identically in Node and the browser. Every scan is linear with no
 * backtracking: this parses hostile input.
 */

/** The tag of a character-data node. Character data is a CHILD rather than a
 *  field on its parent, so a run of text keeps its position among the elements
 *  around it: `<text>a<tspan>b</tspan></text>` and `<text><tspan>b</tspan>a</text>`
 *  paint different labels and must not parse to the same tree. */
export const TEXT_NODE = "#text";

/** A parsed node: an element, or (when `tag` is {@link TEXT_NODE}) a run of
 *  character data, whose content is in `text`. */
export interface XmlNode {
  tag: string;
  attrs: Map<string, string>;
  children: XmlNode[];
  text: string;
}

// A conformant entviz is a few hundred elements at most (the grid is capped at
// 22 tokens). These caps bound the parser's work on hostile input; a document
// past them is pathological, not an entviz.
const MAX_NODES = 4096;
const MAX_DEPTH = 12;
// A tag or attribute name longer than this is not ours; the bound also keeps
// every regex application on a short, fixed-size window.
const MAX_NAME = 64;

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const WS_RE = /\s/;

// The five predefined XML entities. A character reference (&#x41;) is REJECTED
// rather than decoded: our renderer never emits one, and accepting them would
// give an attacker two spellings of the same glyph string.
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s: string): string | null {
  if (!s.includes("&")) return s;
  let out = "";
  let i = 0;
  for (;;) {
    const amp = s.indexOf("&", i);
    if (amp < 0) return out + s.slice(i);
    out += s.slice(i, amp);
    const semi = s.indexOf(";", amp);
    if (semi < 0 || semi - amp > 6) return null;
    const rep = ENTITIES[s.slice(amp + 1, semi)];
    if (rep === undefined) return null;
    out += rep;
    i = semi + 1;
  }
}

interface OpenTag {
  node: XmlNode;
  end: number;
  selfClosing: boolean;
}

function parseOpenTag(s: string, lt: number): OpenTag | null {
  const nm = NAME_RE.exec(s.slice(lt + 1, lt + 1 + MAX_NAME));
  if (!nm) return null;
  const node: XmlNode = { tag: nm[0], attrs: new Map(), children: [], text: "" };
  let i = lt + 1 + nm[0].length;
  for (;;) {
    while (i < s.length && WS_RE.test(s[i])) i++;
    if (i >= s.length) return null;
    if (s[i] === ">") return { node, end: i + 1, selfClosing: false };
    if (s[i] === "/") {
      return s[i + 1] === ">" ? { node, end: i + 2, selfClosing: true } : null;
    }
    const an = NAME_RE.exec(s.slice(i, i + MAX_NAME));
    if (!an) return null;
    i += an[0].length;
    while (i < s.length && WS_RE.test(s[i])) i++;
    if (s[i] !== "=") return null;
    i++;
    while (i < s.length && WS_RE.test(s[i])) i++;
    const q = s[i];
    if (q !== '"' && q !== "'") return null;
    const close = s.indexOf(q, i + 1);
    if (close < 0) return null;
    const raw = s.slice(i + 1, close);
    if (raw.includes("<")) return null;
    const val = unescapeXml(raw);
    // A repeated attribute is a classic parser-differential: two readers can
    // disagree on which wins. Reject rather than pick.
    if (val === null || node.attrs.has(an[0])) return null;
    node.attrs.set(an[0], val);
    i = close + 1;
  }
}

/**
 * Parse the strict XML subset a conformant entviz is serialized in. Returns the
 * root element, or `null` on ANY deviation — this fails closed, and a false
 * reject only routes the reference to the human walk.
 */
export function parseXml(src: string): XmlNode | null {
  let s = src.trim();
  // A leading XML declaration is the one processing instruction a saved .svg
  // file may legitimately carry. Everything else in the `<!` / `<?` space —
  // DOCTYPE and its internal entity subset, comments, CDATA, further PIs — is
  // rejected outright: our renderer emits none of them, and each is a way to
  // hide markup from a scanner that a viewer still parses.
  if (s.startsWith("<?xml")) {
    const end = s.indexOf("?>");
    if (end < 0) return null;
    s = s.slice(end + 2).trim();
  }
  if (s.includes("<!") || s.includes("<?")) return null;

  let root: XmlNode | null = null;
  const stack: XmlNode[] = [];
  let nodes = 0;
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) return null; // character data outside any element
    if (lt > i) {
      const raw = s.slice(i, lt);
      if (!stack.length) {
        if (raw.trim()) return null;
      } else {
        const t = unescapeXml(raw);
        if (t === null) return null;
        stack[stack.length - 1].children.push({
          tag: TEXT_NODE,
          attrs: new Map(),
          children: [],
          text: t,
        });
      }
    }
    if (s.startsWith("</", lt)) {
      const gt = s.indexOf(">", lt);
      if (gt < 0) return null;
      const top = stack.pop();
      if (!top || top.tag !== s.slice(lt + 2, gt).trim()) return null;
      i = gt + 1;
    } else {
      const open = parseOpenTag(s, lt);
      if (!open || ++nodes > MAX_NODES) return null;
      if (stack.length) stack[stack.length - 1].children.push(open.node);
      else if (root) return null; // a second root element
      else root = open.node;
      if (!open.selfClosing) {
        stack.push(open.node);
        if (stack.length > MAX_DEPTH) return null;
      }
      i = open.end;
    }
    // The root has closed: only trailing whitespace may follow it.
    if (root && !stack.length) return s.slice(i).trim() ? null : root;
  }
  return null; // unclosed element
}

// ---------------------------------------------------------------------------
// The entviz grammar. Each allow-list below is the EXACT attribute set the
// renderer emits at that position (see entviz.ts render()/drawLabels()/the
// colour-bar and ellipse writers). Anything else — an `opacity`, a `display`,
// a `transform` on text, a stray `data-color-bar-band` — has no legal home.
// ---------------------------------------------------------------------------

const set = (names: string): Set<string> => new Set(names.split(" "));

const A_SVG = set(
  "xmlns width height viewBox font-family data-entviz-version data-entviz-lib " +
    "data-input-bytes data-cols data-rows data-truncated data-encoding data-scheme " +
    "data-role data-size-basis data-entropy-type data-size-bits data-qualifiers data-parts",
);
const A_NONE = set("");
const A_CHANNEL = set("data-channel");
const A_CLIP = set("id");
const A_RECT = set("x y width height fill");
const A_CELL_RECT = set("x y width height fill rx ry stroke stroke-width");
const A_LINE = set("x1 y1 x2 y2 stroke stroke-width shape-rendering");
const A_SURROUND_PATH = set("d fill");
const A_ELLIPSE_G = set(
  "data-channel clip-path data-ellipse-anchor-x data-ellipse-anchor-y " +
    "data-ellipse-rx data-ellipse-ry data-ellipse-rotation-deg",
);
const A_ELLIPSE = set("cx cy rx ry transform fill stroke fill-opacity stroke-opacity stroke-width");
const A_CELL = set(
  "data-channel data-cell-index data-cell-row data-cell-col data-surround-bits " +
    "data-edge-color data-cell-quartile data-cell-blank data-cell-blank-map data-cell-fingerprint",
);
const A_CELL_TEXT = set("x y fill font-size text-anchor dominant-baseline");
const A_CELL_POLYGON = set("points fill");
const A_CELL_CIRCLE = set("cx cy r fill data-blank-map-min");
const A_CELL_PATH = set("d fill stroke stroke-width stroke-linecap data-blank-map-max");
const A_BAR = set("data-channel data-bar-slots data-bar-marker-left data-bar-marker-right");
const A_BAND = set("data-color-bar-rank data-color-bar-band");
const A_BAND_TEXT = set("x y fill font-size text-anchor data-color-bar-letter");
const A_BAR_CIRCLE = set("cx cy r fill stroke stroke-width data-bar-marker");
const A_LABEL_TEXT = set("x y fill font-size text-anchor dominant-baseline");
const A_TSPAN = set("fill font-weight data-user-note");

const attrsWithin = (n: XmlNode, allowed: Set<string>): boolean => {
  for (const k of n.attrs.keys()) if (!allowed.has(k)) return false;
  return true;
};

const chan = (n: XmlNode | undefined): string | undefined => n?.attrs.get("data-channel");

/** True when none of `n`'s children is stray character data. Every container in
 *  an entviz holds elements only — a text run inside one is ink with no home. */
const noText = (n: XmlNode): boolean => n.children.every((c) => c.tag !== TEXT_NODE);

/** The character data of a glyph-bearing element (`<text>`, `<tspan>`). */
export const glyphText = (n: XmlNode): string =>
  n.children.length === 1 && n.children[0].tag === TEXT_NODE ? n.children[0].text : "";

/** A drawing element: right tag, allowed attributes, no children, no text. */
const leaf = (n: XmlNode | undefined, tag: string, allowed: Set<string>): boolean =>
  n !== undefined && n.tag === tag && !n.children.length && attrsWithin(n, allowed);

/** A glyph-bearing element: like {@link leaf} but with one run of character data
 *  as its ink, and nothing else. */
const glyph = (n: XmlNode | undefined, tag: string, allowed: Set<string>): boolean =>
  n !== undefined &&
  n.tag === tag &&
  n.children.length <= 1 &&
  n.children.every((c) => c.tag === TEXT_NODE) &&
  attrsWithin(n, allowed);

/** An organizational `<g>` that carries no attributes and no text of its own. */
const plainGroup = (n: XmlNode | undefined): boolean =>
  n !== undefined && n.tag === "g" && !n.attrs.size && noText(n);

function defsOk(d: XmlNode | undefined): boolean {
  // The ONLY thing our <defs> ever holds is the grid clipPath. Anything else
  // there is content that is declared but never painted.
  if (!d || d.tag !== "defs" || d.attrs.size || d.children.length !== 1) return false;
  const cp = d.children[0];
  if (cp.tag !== "clipPath" || !attrsWithin(cp, A_CLIP) || cp.children.length !== 1) {
    return false;
  }
  return leaf(cp.children[0], "rect", set("x y width height"));
}

function cellOk(c: XmlNode): boolean {
  if (c.tag !== "g" || chan(c) !== "cell" || !attrsWithin(c, A_CELL)) return false;
  const counts: Record<string, number> = { rect: 0, text: 0, polygon: 0, circle: 0, path: 0 };
  let inkStarted = false;
  for (const kid of c.children) {
    switch (kid.tag) {
      case "rect":
        // The cell's backing rects are painted FIRST; a rect after the glyph
        // would cover it.
        if (inkStarted || !leaf(kid, "rect", A_CELL_RECT)) return false;
        break;
      case "text":
        inkStarted = true;
        // At most one glyph per cell — the parser reads one, so only one may
        // exist. A second `<text>` used to paint over the first for free.
        if (!glyph(kid, "text", A_CELL_TEXT)) return false;
        break;
      case "polygon":
        inkStarted = true;
        if (!leaf(kid, "polygon", A_CELL_POLYGON)) return false;
        break;
      case "circle":
        inkStarted = true;
        if (!leaf(kid, "circle", A_CELL_CIRCLE)) return false;
        break;
      case "path":
        inkStarted = true;
        if (!leaf(kid, "path", A_CELL_PATH)) return false;
        break;
      default:
        return false;
    }
    if (++counts[kid.tag] > (kid.tag === "rect" ? 2 : 1)) return false;
  }
  return counts.rect > 0;
}

function gridOk(g: XmlNode | undefined): boolean {
  if (!g || g.tag !== "g" || chan(g) !== "grid" || !noText(g) || !attrsWithin(g, A_CHANNEL)) return false;
  const k = g.children;
  let i = 0;
  if (!leaf(k[i++], "rect", A_RECT)) return false;
  const surrounds = k[i++];
  if (!plainGroup(surrounds) || !(surrounds as XmlNode).children.every((p) => leaf(p, "path", A_SURROUND_PATH))) {
    return false;
  }
  if (chan(k[i]) === "ellipse") {
    const e = k[i++];
    if (e.tag !== "g" || !attrsWithin(e, A_ELLIPSE_G) || e.children.length !== 1) return false;
    if (!leaf(e.children[0], "ellipse", A_ELLIPSE)) return false;
  }
  const cells = k[i++];
  // The cell groups are the last thing in the grid channel: nothing may be
  // painted after (i.e. on top of) them.
  if (!plainGroup(cells) || i !== k.length) return false;
  const seen = new Set<string>();
  for (const c of (cells as XmlNode).children) {
    if (!cellOk(c)) return false;
    const idx = c.attrs.get("data-cell-index");
    // A second group for an index already seen is a second cell drawn over the
    // first — one declared, one painted.
    if (idx === undefined || !/^\d{1,4}$/.test(idx) || seen.has(idx)) return false;
    seen.add(idx);
  }
  return seen.size > 0;
}

function barOk(b: XmlNode): boolean {
  if (!noText(b) || !attrsWithin(b, A_BAR)) return false;
  const k = b.children;
  let i = 0;
  for (; i < k.length && k[i].tag === "g"; i++) {
    const band = k[i];
    if (!noText(band) || !attrsWithin(band, A_BAND) || band.attrs.get("data-color-bar-rank") === undefined) {
      return false;
    }
    if (!band.children.length || !leaf(band.children[0], "rect", A_RECT)) return false;
    if (band.children.length > 2) return false;
    if (band.children.length === 2 && !glyph(band.children[1], "text", A_BAND_TEXT)) return false;
  }
  for (; i < k.length; i++) if (!leaf(k[i], "circle", A_BAR_CIRCLE)) return false;
  return true;
}

function labelOk(g: XmlNode | undefined, channel: string): boolean {
  if (!g || g.tag !== "g" || chan(g) !== channel || !noText(g) || !attrsWithin(g, A_CHANNEL)) return false;
  if (g.children.length !== 1) return false;
  const t = g.children[0];
  // A label is one `<text>` holding at most two runs: plain characters, styled
  // tspans, or (as the reference implementation writes a truncated label) one
  // tspan followed by plain characters. Mixed content is allowed HERE and only
  // here, and the parse keeps its order, so two orderings cannot collapse into
  // one tree.
  if (t.tag !== "text" || !attrsWithin(t, A_LABEL_TEXT)) return false;
  if (!t.children.length || t.children.length > 2) return false;
  return t.children.every((c) => c.tag === TEXT_NODE || glyph(c, "tspan", A_TSPAN));
}

/**
 * Validate a parsed document against the entviz grammar. `true` only for the
 * exact shape a conformant renderer emits — element sequence, nesting,
 * per-position attributes, child counts and unique cell indices all pinned.
 *
 * This is what makes the document's declared channels worth reading: after it
 * passes, there is no node in the document that can hide, displace or overpaint
 * the glyphs the parser is about to trust.
 */
export function validateEntvizProfile(root: XmlNode): boolean {
  if (root.tag !== "svg" || !noText(root) || !attrsWithin(root, A_SVG)) return false;
  const k = root.children;
  let i = 0;
  if (!defsOk(k[i++])) return false;
  if (!leaf(k[i++], "rect", A_RECT)) return false;
  if (!gridOk(k[i++])) return false;
  if (chan(k[i]) === "color-bar") {
    if (!barOk(k[i++])) return false;
  }
  if (!labelOk(k[i++], "label-top")) return false;
  if (chan(k[i]) === "label-bottom") {
    if (!labelOk(k[i++], "label-bottom")) return false;
  }
  // Only the canvas border/gutter rules may follow the labels.
  for (; i < k.length; i++) if (!leaf(k[i], "line", A_LINE)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Channel extraction — from the TREE, so every scan is scoped to the group that
// owns it (the colour-bar letters cannot be read from a band letter planted on
// some other element, which the old whole-string regex scan allowed).
// ---------------------------------------------------------------------------

export interface EntvizChannels {
  truncated: boolean;
  /** Filled cells in cell-index (= token) reading order. */
  filled: { text: string; surroundBits: number }[];
  colorBarLetters: string[];
}

/**
 * Read the declared text / surround / colour-bar channels out of a document
 * that has already passed {@link validateEntvizProfile}. `null` if it declares
 * no filled cells.
 */
export function extractEntvizChannels(root: XmlNode): EntvizChannels | null {
  const grid = root.children.find((c) => chan(c) === "grid") as XmlNode;
  const cells = grid.children[grid.children.length - 1].children;
  const filled: { index: number; text: string; surroundBits: number }[] = [];
  for (const c of cells) {
    if (c.attrs.get("data-cell-blank") === "true") continue;
    const t = c.children.find((x) => x.tag === "text");
    if (!t) continue;
    const bits = /^0x([0-9a-f]{1,6})$/.exec(c.attrs.get("data-surround-bits") ?? "");
    filled.push({
      index: Number(c.attrs.get("data-cell-index")),
      text: glyphText(t),
      surroundBits: bits ? parseInt(bits[1], 16) : 0,
    });
  }
  if (!filled.length) return null;
  filled.sort((a, b) => a.index - b.index);
  const bar = root.children.find((c) => chan(c) === "color-bar");
  const colorBarLetters = (bar?.children ?? [])
    .map((band) => band.attrs.get("data-color-bar-band"))
    .filter((l): l is string => l !== undefined)
    .map((l) => l.toLowerCase());
  return {
    truncated: root.attrs.get("data-truncated") === "true",
    filled: filled.map(({ text, surroundBits }) => ({ text, surroundBits })),
    colorBarLetters,
  };
}

/** The geometry a reference declares, for re-rendering it at its own size. */
export interface DeclaredGeometry {
  cols: number;
  rows: number;
  /** The root `width` — the renderer's `boundingW`, linear in the font size. */
  boundingW: number;
  /** The user note recovered from the bottom label strip, if any. */
  note: string | null;
}

const posInt = (s: string | undefined): number | null =>
  s !== undefined && /^[1-9]\d{0,3}$/.test(s) ? Number(s) : null;

/** Recover the render parameters a validated reference declares. */
export function recoverGeometry(root: XmlNode): DeclaredGeometry | null {
  const cols = posInt(root.attrs.get("data-cols"));
  const rows = posInt(root.attrs.get("data-rows"));
  const w = Number(root.attrs.get("width"));
  if (cols === null || rows === null || !Number.isFinite(w) || w <= 0) return null;
  const bottom = root.children.find((c) => chan(c) === "label-bottom");
  const note = bottom?.children[0].children
    .map((sp) => sp.attrs.get("data-user-note"))
    .find((v) => v !== undefined);
  return { cols, rows, boundingW: w, note: note ?? null };
}

// ---------------------------------------------------------------------------
// Tree equality — the recompute check's comparator.
// ---------------------------------------------------------------------------

// The only attributes exempt from comparison, and the rule that admits them:
// an attribute is ignorable exactly when two raw inputs of the SAME identity can
// differ in it while drawing the SAME picture. `data-entviz-lib` names the
// library build (the Python and TypeScript renderers draw the same entviz), and
// `data-input-bytes` counts the raw input's bytes, so `{550e…}` and
// `550e8400e29b…` — normalization-equivalent by the text engine's own identity
// rule, and pixel-identical — differ there and nowhere else. Everything else,
// including the spec version and the whole entropy characterization, bears on
// the drawing or on identity and must agree exactly.
const IGNORED_ATTRS = new Set(["data-entviz-lib", "data-input-bytes"]);

const NUM_TOKEN = /-?\d+(?:\.\d+)?/g;
// The conformance checker's own cross-implementation coordinate tolerance. Our
// renderers agree byte-for-byte except where a coordinate lands exactly on a
// half at the third decimal, where half-up and half-even disagree by 0.001. A
// tolerance this small cannot merge two distinct integer-valued annotations
// (indices, sizes, colour components all differ by at least 1), so it buys
// cross-implementation equality without weakening the check.
const COORD_TOL = 0.05;

function attrValueEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.replace(NUM_TOKEN, "#") !== b.replace(NUM_TOKEN, "#")) return false;
  const na = a.match(NUM_TOKEN) as string[];
  const nb = b.match(NUM_TOKEN) as string[];
  return na.every((v, i) => Math.abs(Number(v) - Number(nb[i])) <= COORD_TOL);
}

/**
 * Deep equality of two parsed documents: same element sequence, same attribute
 * sets, same character data — with numeric attribute values compared to within
 * {@link COORD_TOL}. Two documents that compare equal paint the same picture.
 */
export function treeEqual(a: XmlNode, b: XmlNode): boolean {
  if (a.tag !== b.tag || a.text !== b.text || a.children.length !== b.children.length) return false;
  let n = 0;
  for (const [k, v] of a.attrs) {
    if (IGNORED_ATTRS.has(k)) continue;
    n++;
    const w = b.attrs.get(k);
    if (w === undefined || !attrValueEqual(v, w)) return false;
  }
  // ...and b carries no attribute a lacks.
  for (const k of b.attrs.keys()) if (!IGNORED_ATTRS.has(k)) n--;
  if (n !== 0) return false;
  return a.children.every((c, i) => treeEqual(c, b.children[i]));
}
