/**
 * entviz — TypeScript reference port (core).
 *
 * A faithful port of the Python reference (docs/spec.md, v10) for the
 * short-input path. Certified against the shared conformance corpus
 * (see the entviz repo's compliance/ suite). Parsers ported so far: hex,
 * UUID, and the UTF-8→base64url fallback; the blockchain / CESR / SSH /
 * large-input parsers are tracked follow-ons.
 *
 * Runs under Node's native TypeScript type-stripping (Node >= 22.6); no
 * build step required.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { keccak256Hex } from "./keccak.ts";

export const SPEC_VERSION = "v10";
// Read the published version straight from package.json so the data-entviz-lib
// stamp can never drift from the release. release.py bumps only package.json;
// duplicating the version as a literal here would silently go stale on every
// release (the value would lie about which build produced an SVG).
const PKG = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
export const LIB_VERSION = PKG.version;
const DPI = 96;

// ---------------------------------------------------------------------------
// Alphabets
// ---------------------------------------------------------------------------
export interface Alphabet {
  name: string;
  chars: string;
  bitsPerChar: number;
}
const HEX_ALPHABET = "0123456789ABCDEF";
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const HEX: Alphabet = { name: "hex", chars: HEX_ALPHABET, bitsPerChar: 4 };
export const BASE64URL: Alphabet = {
  name: "base64url",
  chars: BASE64URL_ALPHABET,
  bitsPerChar: 6,
};

// ---------------------------------------------------------------------------
// Tokenization + quant extension
// ---------------------------------------------------------------------------
export interface Token {
  text: string;
  index: number;
  quant: number;
}

export function tokenize(text: string, alphabet: Alphabet): Token[] {
  const bits = alphabet.bitsPerChar;
  const chars = alphabet.chars;
  const lower = chars.toLowerCase();
  const tokenLen = Math.floor(24 / bits);
  const tokens: Token[] = [];
  for (let i = 0; i < text.length; i += tokenLen) {
    // i < text.length and tokenLen >= 1, so the slice always yields ≥ 1 char.
    const chunk = text.slice(i, i + tokenLen);
    let val = 0;
    let actualBits = 0;
    for (const ch of chunk) {
      let cv = chars.indexOf(ch);
      if (cv === -1) cv = lower.indexOf(ch.toLowerCase());
      if (cv === -1 && bits === 6) {
        if (ch === "-" || ch === "+") cv = 62;
        else if (ch === "_" || ch === "/") cv = 63;
      }
      if (cv === -1) cv = 0;
      val = (val << bits) | cv;
      actualBits += bits;
    }
    // A chunk is at most floor(24/bits) chars, so actualBits is in {bits,
    // 2·bits, …, 24} — it can never exceed 24. Only the short-token case needs
    // the bit-extension below; a full token already fills 24 bits.
    let quant = val;
    if (actualBits > 0 && actualBits < 24) {
      while (actualBits < 24) {
        const shift = Math.min(actualBits, 24 - actualBits);
        const mask = (1 << shift) - 1;
        const add = quant & mask;
        quant = (quant << shift) | add;
        actualBits += shift;
      }
    }
    tokens.push({ text: chunk, index: tokens.length, quant: quant & 0xffffff });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------
// LOAD-BEARING: the fingerprint hashes the core's UTF-8 TEXT, not its decoded
// bytes. This is a spec invariant (docs/spec.md) and is what makes a hex string
// and its byte-equal-but-differently-cased twin fingerprint the same after the
// parser has normalized case. Do NOT "optimize" this to hash decoded bytes —
// that silently re-keys every pre-existing entviz.
export function computeFingerprint(core: string): Buffer {
  return createHash("sha512").update(core, "utf8").digest();
}

// The second, domain-separated digest: SHA-512(DOMAIN_TAG ‖ core). Computed for
// EVERY input (v9): it drives the two color-bar markers on all inputs (and,
// on >512-bit inputs, the 4 fingerprint-middle cells — not yet ported here).
// The DOMAIN_TAG keeps it independent of the primary fingerprint; its "v6" is a
// fixed construction version, NOT the spec version. It is FROZEN: changing it
// re-keys the fingerprint-middle digest of every input, so it MUST NOT be
// bumped when the spec version changes. The normative definition lives in the
// entviz reference repo's docs/spec.md (this is a port; there is no this.i
// here).
const MIDDLE_DOMAIN_TAG = Buffer.from("entviz/fingerprint-middle/v6\0", "latin1");
export function fingerprintMiddleDigest(core: string): Buffer {
  return createHash("sha512")
    .update(MIDDLE_DOMAIN_TAG)
    .update(core, "utf8")
    .digest();
}

export function tokenizeFingerprint(digest: Buffer): Token[] {
  if (digest.length !== 64) throw new Error("fingerprint must be 64 bytes");
  const b64 = digest.toString("base64url"); // unpadded
  const toks = tokenize(b64, BASE64URL);
  if (toks.length !== 22) throw new Error(`expected 22 ftoks, got ${toks.length}`);
  return toks;
}

// ASCII (bytewise) string comparison — base64url chars are all ASCII, so
// JS's default code-unit order equals bytewise order.
function asciiCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function medianToken(tokens: Token[]): Token | null {
  if (!tokens.length) return null;
  const s = [...tokens].sort((x, y) => asciiCmp(x.text, y.text) || x.index - y.index);
  return s[Math.floor((s.length - 1) / 2)];
}

export function quartileTokens(tokens: Token[]): (Token | null)[] {
  if (!tokens.length) return [null, null, null, null];
  const rev = (t: Token) => [...t.text].reverse().join("");
  const s = [...tokens].sort(
    (x, y) => asciiCmp(rev(x), rev(y)) || x.index - y.index,
  );
  const qSize = Math.ceil(s.length / 4);
  const out: (Token | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = i * qSize;
    out.push(idx < s.length ? s[idx] : null);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
export const POSSIBLE_EDGE_COLORS = [
  "#ffffff",
  "#e7be00",
  "#ff3f2f",
  "#2f3fbf",
  "#000000",
];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function oklabLightness(r: number, g: number, b: number): number {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
  const lp = Math.cbrt(l);
  const mp = Math.cbrt(m);
  const sp = Math.cbrt(s);
  return 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp;
}
const OKLAB_THRESHOLD = 0.6;

function hex2 (n: number): string { return n.toString(16).padStart(2, "0"); }

export function nucleusColors(quant: number): [string, string] {
  const r = quant & 0xff;
  const g = (quant >> 8) & 0xff;
  const b = (quant >> 16) & 0xff;
  const bg = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const L = oklabLightness(r, g, b);
  const fg = L < OKLAB_THRESHOLD ? "#ffffff" : "#000000";
  return [bg, fg];
}

export function hexToRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

export function weightedRgbDistance(c1: string, c2: string): number {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return Math.sqrt(
    2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2,
  );
}

export function closestPaletteColor(target: string, palette: string[]): string {
  let best = palette[0];
  let bestD = Infinity;
  for (const c of palette) {
    const d = weightedRgbDistance(c, target);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export interface VisualStyle {
  bgColor: string;
  edgeColors: string[];
}
export function selectVisualStyle(medianFtok: Token): VisualStyle {
  // `& 0x03` maps the median quant to one of the FIRST FOUR palette colors, so
  // the background is always one of {white, gold, red, blue} and NEVER index 4
  // (#000000 / black). Keeping black off the background is a spec MUST (black is
  // reserved as an edge color for maximum contrast). Do NOT change this mask to
  // `% 5` — that would let black become the background, a silent spec violation.
  const idx = medianFtok.quant & 0x03;
  const bgColor = POSSIBLE_EDGE_COLORS[idx];
  const edgeColors = POSSIBLE_EDGE_COLORS.filter((_, i) => i !== idx);
  return { bgColor, edgeColors };
}

// ---------------------------------------------------------------------------
// Grid selection + blank-cell placement
// ---------------------------------------------------------------------------
export interface Grid {
  cols: number;
  rows: number;
  tokenCount: number;
}

export function chooseGrid(tokenCount: number, targetAr = 1.0): Grid {
  const tightest = new Map<number, number>();
  for (let cols = 2; cols <= tokenCount; cols++) {
    const rows = Math.ceil(tokenCount / cols);
    if (rows < 2) continue;
    if (!tightest.has(rows) || cols < (tightest.get(rows) as number)) {
      tightest.set(rows, cols);
    }
  }
  const candidates: [number, number, number][] = [];
  for (const [rows, cols] of tightest) {
    candidates.push([cols, rows, (cols * 3) / (rows * 2)]);
  }
  if (!candidates.length) return { cols: 2, rows: 2, tokenCount };
  const above = candidates.filter((c) => c[2] >= targetAr);
  let chosen: [number, number, number];
  if (above.length) {
    chosen = above.reduce((a, b) => (b[2] - targetAr < a[2] - targetAr ? b : a));
  } else {
    chosen = candidates.reduce((a, b) => (b[2] > a[2] ? b : a));
  }
  return { cols: chosen[0], rows: chosen[1], tokenCount };
}

export function assignCellIndices(
  tokens: Token[],
  grid: Grid,
  medianToken: Token | null,
  sortKeys: Token[],
): Map<number, number> {
  const cellIndices = new Map<number, number>();
  for (const t of tokens) cellIndices.set(t.index, t.index);
  const cellCount = grid.cols * grid.rows;
  const tokenCount = tokens.length;
  if (tokenCount >= cellCount || !tokens.length) return cellIndices;

  const shiftFrom = (start: number) => {
    for (const k of cellIndices.keys()) {
      if (k >= start) cellIndices.set(k, (cellIndices.get(k) as number) + 1);
    }
  };
  if (medianToken) shiftFrom(medianToken.index);
  const sorted = [...sortKeys].sort(
    (a, b) => asciiCmp(a.text, b.text) || a.index - b.index,
  );
  if (tokenCount + 1 < cellCount) shiftFrom(sorted[sorted.length - 1].index);
  if (tokenCount + 2 < cellCount) shiftFrom(sorted[0].index);
  return cellIndices;
}

// ---------------------------------------------------------------------------
// Parsing (subset: hex, UUID, UTF-8 fallback)
// ---------------------------------------------------------------------------
export interface Parsed {
  type: string;
  core: string;
  alphabet: Alphabet;
  prefix: string | null;
  suffix: string | null;
}

const HEX_RE = /^[0-9a-fA-F]+$/;
const UUID_DASHED_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUID_PLAIN_RE = /^[0-9a-fA-F]{32}$/;
const ETHEREUM_RE = /^(0[xX])?([0-9a-fA-F]{40})$/;

// EIP-55: throw if `body` (40 hex chars, mixed case) disagrees with the
// canonical checksum case derived from keccak256(lower(body)). Rejecting —
// rather than silently rendering — is a spec MUST (docs/spec.md "Ethereum
// (EIP-55) case validation"): a corrupted address must fail closed, not render
// a plausible-but-wrong entviz that looks like a different valid address.
function validateEip55(body: string): void {
  const digestHex = keccak256Hex(Buffer.from(body.toLowerCase(), "ascii"));
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (!/[a-zA-Z]/.test(c)) continue;
    const canonicalUpper = parseInt(digestHex[i], 16) >= 8;
    const expected = canonicalUpper ? c.toUpperCase() : c.toLowerCase();
    if (c !== expected) {
      throw new Error(
        `EIP-55 checksum mismatch at position ${i}: '${c}' should be '${expected}'`,
      );
    }
  }
}

// Recognize an Ethereum address. Recognition requires either an explicit
// 0x/0X prefix on a 40-hex body, OR EIP-55-style mixed case on a bare 40-hex
// body. A bare single-case 40-hex string falls through to plain hex ("0x" is a
// generic hex prefix predating Ethereum, and length-40 alone is too weak a
// signal). Mixed case — with or without prefix — asserts EIP-55, so the
// checksum is validated and a bad one is rejected. The parsed core is always
// the lowercase body; the EIP-55 case is a checksum, not part of the value.
function parseEthereum(raw: string): Parsed | null {
  const m = raw.match(ETHEREUM_RE);
  if (m === null) return null;
  const hasPrefix = Boolean(m[1]);
  const body = m[2];
  const letters = [...body].filter((c) => /[a-zA-Z]/.test(c));
  const isMixed =
    letters.some((c) => c >= "a" && c <= "z") && letters.some((c) => c >= "A" && c <= "Z");
  if (!hasPrefix && !isMixed) return null; // bare single-case 40-hex -> plain hex
  if (isMixed) validateEip55(body); // throws on a bad checksum
  return { type: "ETH", core: body.toLowerCase(), alphabet: HEX, prefix: "0x", suffix: null };
}

export function parse(raw: string): Parsed | null {
  const eth = parseEthereum(raw);
  if (eth !== null) return eth;
  if (UUID_DASHED_RE.test(raw)) {
    return {
      type: "UUID",
      core: raw.replace(/-/g, "").toLowerCase(),
      alphabet: HEX,
      prefix: null,
      suffix: null,
    };
  }
  if (UUID_PLAIN_RE.test(raw)) {
    return { type: "UUID", core: raw.toLowerCase(), alphabet: HEX, prefix: null, suffix: null };
  }
  if (HEX_RE.test(raw)) {
    return { type: "hex", core: raw.toLowerCase(), alphabet: HEX, prefix: null, suffix: null };
  }
  return null; // caller applies UTF-8 → base64url fallback
}

// ---------------------------------------------------------------------------
// User note sanitization (matches the spec error catalog)
// ---------------------------------------------------------------------------
const NOTE_RE = /^[A-Za-z0-9]{1,8}$/;
export function sanitizeNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null;
  if (!NOTE_RE.test(note)) {
    throw new Error(
      `user note must be 1-8 ASCII alphanumeric characters (got ${JSON.stringify(note)})`,
    );
  }
  return note;
}

// ---------------------------------------------------------------------------
// SVG building
// ---------------------------------------------------------------------------
// Round half to EVEN (banker's rounding) — matches Python's round(), which the
// spec's rendered-font-size rule relies on ("ties broken toward even").
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

function n(x: number): string {
  // Serialize a coordinate per the spec's numeric-serialization rule: a finite
  // plain decimal in compact form (<=3 fractional digits, no trailing zeros,
  // integers without a decimal point, -0 as 0). toFixed (not String()) is used
  // precisely because String()/Number.toString emit EXPONENTIAL notation for
  // tiny magnitudes (e.g. 1e-7), which the spec forbids. The rounding mode is
  // unconstrained by the spec; the checker's 0.05px tolerance absorbs the
  // cross-impl difference between toFixed's half-up and other impls' half-even.
  let s = x.toFixed(3);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  if (s === "" || s === "-0" || s === "-") s = "0";
  return s;
}
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class El {
  tag: string;
  attrs: [string, string][] = [];
  children: El[] = [];
  text: string | null = null;
  constructor(tag: string) {
    this.tag = tag;
  }
  set(k: string, v: string | number): this {
    this.attrs.push([k, typeof v === "number" ? n(v) : v]);
    return this;
  }
  child(tag: string): El {
    const e = new El(tag);
    this.children.push(e);
    return e;
  }
  add(e: El): El {
    this.children.push(e);
    return e;
  }
  render(): string {
    const a = this.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    if (this.text === null && !this.children.length) return `<${this.tag}${a}/>`;
    const inner =
      (this.text !== null ? esc(this.text) : "") +
      this.children.map((c) => c.render()).join("");
    return `<${this.tag}${a}>${inner}</${this.tag}>`;
  }
}

const FONT_FAMILY =
  '"JetBrains Mono", "Menlo", "Consolas", "DejaVu Sans Mono", ' +
  '"Liberation Mono", "Roboto Mono", "Noto Sans Mono", monospace';

const BAND_LETTER: Record<string, string> = {
  "#ffffff": "W",
  "#e7be00": "G",
  "#ff3f2f": "R",
  "#2f3fbf": "B",
  "#000000": "K",
};
const OVERLAY_BY_BG: Record<string, [string, number, number]> = {
  "#ffffff": ["#000000", 0.2, 0.3],
  "#e7be00": ["#000000", 0.2, 0.3],
  "#ff3f2f": ["#000000", 0.25, 0.35],
  "#2f3fbf": ["#ffffff", 0.35, 0.45],
};

// ---------------------------------------------------------------------------
// Render-stage helpers — the logic-bearing pieces of render(), extracted as
// pure functions so they can be unit-tested in isolation (render() itself is
// thin orchestration over these + the draw* helpers above).
// ---------------------------------------------------------------------------
export interface ClassifiedInput {
  core: string;
  typeName: string;
  alphabet: Alphabet;
  prefix: string | null;
  suffix: string | null;
}

// Map a trimmed raw input to its (core, type label, alphabet, prefix, suffix)
// via the ported parsers, falling back to UTF-8 → base64url for anything no
// parser claims.
export function classifyInput(rawInput: string): ClassifiedInput {
  const parsed = parse(rawInput);
  if (parsed === null) {
    // SEC-F1: cap on the cheap BYTE LENGTH before allocating the base64url
    // encoding. Anything over 64 bytes is the not-yet-ported >512-bit path and
    // is rejected anyway; converting first would let a multi-megabyte input
    // allocate a ~1.33× base64 string before that rejection — an avoidable DoS
    // amplifier. Buffer.byteLength measures without materializing the encoding.
    if (Buffer.byteLength(rawInput, "utf8") > 64) {
      throw new Error("large-input (>512-bit) path not yet ported in entviz-js");
    }
    return {
      core: Buffer.from(rawInput, "utf8").toString("base64url"),
      typeName: `txt(${rawInput.length})->b64url`,
      alphabet: BASE64URL,
      prefix: null,
      suffix: null,
    };
  }
  const typeName = parsed.type === "hex" ? `hex(${parsed.core.length})` : parsed.type;
  return {
    core: parsed.core,
    typeName,
    alphabet: parsed.alphabet,
    prefix: parsed.prefix,
    suffix: parsed.suffix,
  };
}

export interface Geometry {
  fs: number; nucleusWidth: number; nucleusHeight: number;
  boxWidth: number; boxHeight: number; cellWidth: number; cellHeight: number;
  gm: number; barWidth: number; gridW: number; gridH: number;
  boundingW: number; boundingH: number; gridLeft: number; gridTop: number;
}

// All pixel geometry, derived from the reference font size and the chosen grid
// (see the spec's geometry section). `hasBottom` adds a bottom label strip.
export function computeGeometry(fontSizePt: number, grid: Grid, hasBottom: boolean): Geometry {
  const fs = (fontSizePt * DPI) / 72;
  const nucleusWidth = fs * 3;
  const nucleusHeight = fs * 1.25;
  const boxWidth = nucleusWidth / 8;
  const boxHeight = nucleusHeight / 2;
  const cellWidth = nucleusWidth + 2 * boxWidth;
  const cellHeight = nucleusHeight + 2 * boxHeight;
  const gm = boxHeight / 2;
  const barWidth = 2 * boxHeight;
  const gridW = cellWidth * grid.cols;
  const gridH = cellHeight * grid.rows;
  const boundingW = 1 + barWidth + 1 + gm + gridW + gm + 1;
  const bottomRegion = hasBottom ? nucleusHeight + gm : gm;
  const boundingH = 1 + gm + nucleusHeight + gridH + bottomRegion + 1;
  const gridLeft = 1 + barWidth + 1 + gm;
  const gridTop = 1 + gm + nucleusHeight;
  return {
    fs, nucleusWidth, nucleusHeight, boxWidth, boxHeight, cellWidth, cellHeight,
    gm, barWidth, gridW, gridH, boundingW, boundingH, gridLeft, gridTop,
  };
}

// Rendered cell-text and label-text sizes in px. 4-bit alphabets (hex) render
// their 6-char tokens at 0.75× so they fit the nucleus; 6-bit at reference.
export function cellTextSizes(fontSizePt: number, alphabet: Alphabet): { cellTextPx: number; labelTextPx: number } {
  const cellTextPt = alphabet.bitsPerChar === 4 ? roundHalfEven(fontSizePt * 0.75) : fontSizePt;
  return {
    cellTextPx: (cellTextPt * DPI) / 72,
    labelTextPx: (roundHalfEven(fontSizePt * 0.75) * DPI) / 72,
  };
}

// v10: the fingerprint-edge cells — top-left (grid position 0) plus the 1st/2nd
// quartile-ftok cells — whose surround edge colour is fingerprint-driven.
// Skipped where the target cell is blank or the quartile ftok is null.
export function fingerprintEdgeCells(
  quartFtoks: (Token | null)[],
  cellIndices: Map<number, number>,
  usedCellIndices: Set<number>,
): Set<number> {
  const out = new Set<number>();
  if (usedCellIndices.has(0)) out.add(0);
  for (const q of quartFtoks.slice(0, 2)) {
    if (!q) continue;
    const qci = cellIndices.get(q.index);
    if (qci !== undefined) out.add(qci);
  }
  return out;
}

// minftok cell = smallest ftok quant (tie-break: highest cell index); maxftok
// cell = largest quant (tie-break: highest cell index). Drives the blank-map.
export function minMaxFtokCells(
  tokens: Token[],
  usedFtoks: Token[],
  cellIndices: Map<number, number>,
): { minCi: number; maxCi: number } {
  const pairs = tokens.map((t) => ({ q: usedFtoks[t.index].quant, ci: cellIndices.get(t.index) as number }));
  let minCi = pairs[0].ci, maxCi = pairs[0].ci, minQ = pairs[0].q, maxQ = pairs[0].q;
  for (const p of pairs) {
    if (p.q < minQ || (p.q === minQ && p.ci > minCi)) { minQ = p.q; minCi = p.ci; }
    if (p.q > maxQ || (p.q === maxQ && p.ci > maxCi)) { maxQ = p.q; maxCi = p.ci; }
  }
  return { minCi, maxCi };
}

// Cell indices in the grid that no token landed on (row-major order).
export function blankCellIndices(grid: Grid, usedCellIndices: Set<number>): number[] {
  const out: number[] = [];
  for (let ci = 0; ci < grid.cols * grid.rows; ci++) if (!usedCellIndices.has(ci)) out.push(ci);
  return out;
}

// v10 hybrid fingerprint blank fill: the j-th *coloured* blank (in cell-index
// order) takes edge_palette[digest[32 + j] & 0b11]. The map blank is coloured
// only when it is the sole blank; otherwise it keeps the white/gold anchor and
// is excluded here.
export function blankFillColors(
  blankIndices: number[],
  mapCellIdx: number | null,
  digest: Buffer,
  edgeColors: string[],
): Map<number, string> {
  const soleBlank = blankIndices.length === 1;
  const out = new Map<number, string>();
  let j = 0;
  for (const bi of blankIndices) {
    if (bi === mapCellIdx && !soleBlank) continue;
    out.set(bi, edgeColors[digest[32 + j] & 0b11]);
    j++;
  }
  return out;
}

// v10: in the sole-blank case the map fill is fingerprint-coloured, so both
// markers take the luminance-contrast colour against it (shape still carries
// max/min). Otherwise the fixed v9 red plus / blue dot.
export function blankMapMarkerColors(soleBlank: boolean, mapFillColor: string | undefined): { minColor: string; maxColor: string } {
  if (soleBlank && mapFillColor) {
    const [, mc] = nucleusColors(
      parseInt(mapFillColor.slice(1, 3), 16) |
        (parseInt(mapFillColor.slice(3, 5), 16) << 8) |
        (parseInt(mapFillColor.slice(5, 7), 16) << 16),
    );
    return { minColor: mc, maxColor: mc };
  }
  return { minColor: "#1d4ed8", maxColor: "#d62828" };
}

// Draw every blank cell's rounded "pill" into its pre-created cell group, and
// turn the lowest-indexed blank (the map blank) into a miniature grid carrying
// the min (blue dot) and max (red plus) ftok-cell markers. Each marker's
// data-blank-map-* attribute carries the literal "row,col" of its cell.
export function drawBlankCells(
  cellGroups: Map<number, El>,
  blankIndices: number[],
  mapCellIdx: number | null,
  blankFillColor: Map<number, string>,
  mapFill: string,
  minCi: number,
  maxCi: number,
  grid: Grid,
  geom: Geometry,
): void {
  const { gridLeft, gridTop, cellWidth, cellHeight, boxWidth, boxHeight, nucleusWidth, nucleusHeight, fs } = geom;
  const cornerR = nucleusHeight / 2;
  const soleBlank = blankIndices.length === 1;
  for (const ci of blankIndices) {
    const g = cellGroups.get(ci) as El;
    const col = ci % grid.cols;
    const row = Math.floor(ci / grid.cols);
    const nx = gridLeft + col * cellWidth + boxWidth;
    const ny = gridTop + row * cellHeight + boxHeight;
    const isMap = ci === mapCellIdx;
    const blankFill = isMap && !soleBlank ? mapFill : (blankFillColor.get(ci) as string);
    g.child("rect").set("x", nx).set("y", ny)
      .set("width", nucleusWidth).set("height", nucleusHeight)
      .set("rx", cornerR).set("ry", cornerR)
      .set("fill", blankFill).set("stroke", "#000000").set("stroke-width", "1");
    if (!isMap) continue;
    g.set("data-cell-blank-map", "true");
    const subW = nucleusWidth / grid.cols;
    const subH = nucleusHeight / grid.rows;
    const dotR = nucleusHeight / 8 + fs / 16;
    const sub = (cellIdx: number): [number, number] => [
      nx + ((cellIdx % grid.cols) + 0.5) * subW,
      ny + (Math.floor(cellIdx / grid.cols) + 0.5) * subH,
    ];
    const [maxCx, maxCy] = sub(maxCi);
    const [minCx, minCy] = sub(minCi);
    const maxRow = Math.floor(maxCi / grid.cols), maxCol = maxCi % grid.cols;
    const minRow = Math.floor(minCi / grid.cols), minCol = minCi % grid.cols;
    // Plus geometry: arms a touch longer than the dot radius, thinner stroke,
    // so the cross reads as a distinct shape rather than a blob.
    const plusArm = dotR * 1.2;
    const plusW = Math.max(1.0, dotR * 0.55);
    // v10: in the sole-blank case the map blank is fingerprint-filled, so the
    // fixed red/blue would clash — both markers take the luminance-contrast
    // colour against that fill. Max/min identity rides on SHAPE (plus vs dot),
    // not hue, so this costs only the redundant colour cue.
    const { minColor, maxColor } = blankMapMarkerColors(soleBlank, blankFillColor.get(mapCellIdx as number));
    // minftok = blue dot (drawn first); maxftok = red plus (drawn on top, so it
    // stays visible where both land on one cell). The SHAPE carries the max/min
    // semantic so it survives total colour blindness (PSY-F1); each marker's
    // data-blank-map-* attribute carries the literal "row,col" of its cell so a
    // checker recovers the position directly, not from pixel geometry (SPEC-F2).
    g.child("circle").set("cx", minCx).set("cy", minCy).set("r", dotR)
      .set("fill", minColor).set("data-blank-map-min", `${minRow},${minCol}`);
    g.child("path")
      .set("d", `M ${n(maxCx - plusArm)},${n(maxCy)} H ${n(maxCx + plusArm)} M ${n(maxCx)},${n(maxCy - plusArm)} V ${n(maxCy + plusArm)}`)
      .set("fill", "none").set("stroke", maxColor)
      .set("stroke-width", plusW).set("stroke-linecap", "butt")
      .set("data-blank-map-max", `${maxRow},${maxCol}`);
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export interface RenderOptions {
  targetAr?: number;
  fontSizePt?: number;
  note?: string | null;
}

export function render(entropy: string, opts: RenderOptions = {}): string {
  const targetAr = opts.targetAr ?? 1.0;
  const fontSizePt = opts.fontSizePt ?? 12;
  const note = sanitizeNote(opts.note ?? null);

  if (!(fontSizePt >= 6 && fontSizePt <= 30)) {
    throw new Error(`font_size_pt must be in [6, 30] (got ${fontSizePt})`);
  }
  if (!(targetAr >= 0.01 && targetAr <= 100)) {
    throw new Error(`target_ar must be in [0.01, 100] (got ${targetAr})`);
  }

  const rawInput = entropy.trim();
  const { core, typeName, alphabet, prefix, suffix } = classifyInput(rawInput);

  // Short-input path only (this port does not yet implement the >512-bit
  // truncation branch).
  const byteLen = decodedByteLength(core, alphabet);
  if (byteLen > 64) {
    throw new Error("large-input (>512-bit) path not yet ported in entviz-js");
  }

  const tokens = tokenize(core, alphabet);
  if (!tokens.length) throw new Error("No tokens produced from input entropy.");
  const tokenCount = tokens.length;

  const usedFtoks = tokenizeFingerprint(computeFingerprint(core)).slice(0, tokenCount);
  const grid = chooseGrid(tokenCount, targetAr);
  const medFtok = medianToken(usedFtoks) as Token;
  const quartFtoks = quartileTokens(usedFtoks);
  const style = selectVisualStyle(medFtok);
  const cellIndices = assignCellIndices(tokens, grid, medFtok, usedFtoks);

  // Geometry
  const hasBottom = Boolean(suffix) || Boolean(note);
  const geom = computeGeometry(fontSizePt, grid, hasBottom);
  const {
    fs, nucleusWidth, nucleusHeight, boxWidth, boxHeight, cellWidth, cellHeight,
    barWidth, gridW, gridH, boundingW, boundingH, gridLeft, gridTop,
  } = geom;
  const { cellTextPx, labelTextPx } = cellTextSizes(fontSizePt, alphabet);

  const digest = computeFingerprint(core);
  const digestHex = digest.toString("hex");
  const clipId = `grid-clip-${digestHex.slice(0, 16)}-${grid.cols}x${grid.rows}`;

  // Root
  const svg = new El("svg");
  svg
    .set("width", boundingW)
    .set("height", boundingH)
    .set("viewBox", `0 0 ${n(boundingW)} ${n(boundingH)}`)
    .set("xmlns", "http://www.w3.org/2000/svg")
    // font-family is an inherited SVG presentation property: set the monospace
    // chain ONCE on the root <svg> so every descendant <text> inherits it; each
    // <text> then carries only a compact font-size attribute (not the full
    // per-text style). Mirrors the Python anchor; checker accepts either form.
    .set("font-family", FONT_FAMILY)
    .set("data-entviz-version", SPEC_VERSION)
    .set("data-entviz-lib", LIB_VERSION)
    .set("data-input-bytes", String(Buffer.byteLength(rawInput, "utf8")))
    .set("data-cols", grid.cols)
    .set("data-rows", grid.rows);

  // defs + clipPath (grid rect)
  const defs = svg.child("defs");
  const cp = defs.child("clipPath").set("id", clipId);
  cp.child("rect")
    .set("x", gridLeft)
    .set("y", gridTop)
    .set("width", gridW)
    .set("height", gridH);

  // White bounding-rect fill (first painted element, before the grid group).
  svg.child("rect").set("x", 0).set("y", 0)
    .set("width", boundingW).set("height", boundingH).set("fill", "#ffffff");

  // grid channel
  const gridG = svg.child("g").set("data-channel", "grid");
  // bg rect
  gridG.child("rect").set("x", gridLeft).set("y", gridTop)
    .set("width", gridW).set("height", gridH).set("fill", style.bgColor);

  // per-token cell geometry + nucleus bg
  interface TC { token: Token; ftok: Token; ci: number; nx: number; ny: number; nucleusBg: string; }
  const tokenCells: TC[] = [];
  for (const token of tokens) {
    const ci = cellIndices.get(token.index) as number;
    const col = ci % grid.cols;
    const row = Math.floor(ci / grid.cols);
    const cellX = gridLeft + col * cellWidth;
    const cellY = gridTop + row * cellHeight;
    const nx = cellX + boxWidth;
    const ny = cellY + boxHeight;
    const [nucleusBg] = nucleusColors(token.quant);
    tokenCells.push({ token, ftok: usedFtoks[token.index], ci, nx, ny, nucleusBg });
  }

  // Layer 1: edges.
  // v10: fingerprint-edge cells — the top-left cell (grid position 0) and the
  // cells of the 1st & 2nd quartile ftoks take their surround edge colour from
  // the fingerprint (2 low-order ftok-quant bits → edge palette) instead of the
  // nearest-palette nucleus echo, so the surround colour avalanches to a casual
  // glance. Skipped where the target cell is blank or the quartile ftok is null.
  const usedCellIndices = new Set(cellIndices.values());
  const fpEdgeCells = fingerprintEdgeCells(quartFtoks, cellIndices, usedCellIndices);

  // v10: a filled cell's 24-bit surround pattern is emitted as ONE <path> (one
  // subpath per set box) instead of one <rect> per box — repeated box rects were
  // ~a third of a dense entviz. The bit pattern + edge color are DECLARED on the
  // cell GROUP below (data-surround-bits / data-edge-color), so a checker
  // recovers the channel from the attribute, not the box geometry; this path is
  // purely pixels. The path MUST stay in this surround layer (painted before the
  // cell groups and the ellipse overlay) so paint order is preserved (the
  // overlay composites over the boxes exactly as before).
  const surroundByCell = new Map<number, { bits: number; edgeColor: string }>();
  const edgesG = gridG.child("g");
  for (const tc of tokenCells) {
    const edgeColor = fpEdgeCells.has(tc.ci)
      ? style.edgeColors[tc.ftok.quant & 0b11]
      : closestPaletteColor(tc.nucleusBg, style.edgeColors);
    const cellX = tc.nx - boxWidth;
    const cellY = tc.ny - boxHeight;
    let bits = 0;
    let d = "";
    for (let i = 0; i < 24; i++) {
      if (!((tc.ftok.quant >> i) & 1)) continue;
      bits |= 1 << i;
      const [ox, oy] = boxOrigin(i, cellX, cellY, boxWidth, boxHeight, nucleusWidth, nucleusHeight);
      d += `M${n(ox)} ${n(oy)}h${n(boxWidth)}v${n(boxHeight)}h-${n(boxWidth)}z`;
    }
    if (d) edgesG.child("path").set("fill", edgeColor).set("d", d);
    surroundByCell.set(tc.ci, { bits: bits >>> 0, edgeColor });
  }

  // Layer 2: ellipse overlay
  drawEllipse(gridG, digest, gridLeft, gridTop, gridW, gridH, cellWidth, cellHeight, grid, style.bgColor, clipId);

  // Layer 3: cell groups (created in cell-index order)
  const nucleiG = gridG.child("g");
  const cellGroups = new Map<number, El>();
  for (let ci = 0; ci < grid.cols * grid.rows; ci++) {
    const col = ci % grid.cols;
    const row = Math.floor(ci / grid.cols);
    const g = nucleiG.child("g")
      .set("data-channel", "cell")
      .set("data-cell-index", ci)
      .set("data-cell-row", row)
      .set("data-cell-col", col);
    if (!usedCellIndices.has(ci)) g.set("data-cell-blank", "true");
    // v10: a filled cell declares its surround channel here (hex bit pattern +
    // edge color); the boxes themselves were drawn as a path in the surround
    // layer above. data-edge-color is omitted when no box is set (edge color is
    // then undefined, matching the render model).
    const surround = surroundByCell.get(ci);
    if (surround) {
      g.set("data-surround-bits", `0x${surround.bits.toString(16)}`);
      if (surround.bits) g.set("data-edge-color", surround.edgeColor);
    }
    cellGroups.set(ci, g);
  }

  // nuclei + text
  for (const tc of tokenCells) {
    const g = cellGroups.get(tc.ci) as El;
    const [bg, fg] = nucleusColors(tc.token.quant);
    g.child("rect").set("x", tc.nx).set("y", tc.ny)
      .set("width", nucleusWidth).set("height", nucleusHeight).set("fill", bg);
    const t = g.child("text")
      .set("x", tc.nx + nucleusWidth / 2)
      .set("y", tc.ny + nucleusHeight / 2)
      .set("fill", fg)
      .set("font-size", cellTextPx)
      .set("text-anchor", "middle")
      .set("dominant-baseline", "central");
    t.text = tc.token.text;
  }

  // Layer 3b: blank cells + map.
  // v10 hybrid fingerprint blank fill: the map blank is fingerprint-filled only
  // when it is the sole blank (where the casual-avalanche colour is needed),
  // else it keeps the white/gold anchor while its siblings carry the colour.
  const { minCi, maxCi } = minMaxFtokCells(tokens, usedFtoks, cellIndices);
  const blankIndices = blankCellIndices(grid, usedCellIndices);
  const mapCellIdx = blankIndices.length ? Math.min(...blankIndices) : null;
  const mapFill = style.bgColor === "#ffffff" ? "#e7be00" : "#ffffff";
  const blankFillColor = blankFillColors(blankIndices, mapCellIdx, digest, style.edgeColors);
  drawBlankCells(cellGroups, blankIndices, mapCellIdx, blankFillColor, mapFill, minCi, maxCi, grid, geom);

  // Layer 4: quartile marks
  const cellByIndex = new Map<number, TC>();
  for (const tc of tokenCells) cellByIndex.set(tc.ci, tc);
  const tokenByIndex = new Map<number, Token>();
  for (const t of tokens) tokenByIndex.set(t.index, t);
  quartFtoks.forEach((q, qIdx) => {
    if (!q) return;
    const ci = cellIndices.get(q.index);
    if (ci === undefined) return;
    const tc = cellByIndex.get(ci);
    if (!tc) return;
    const token = tokenByIndex.get(q.index);
    if (!token) return;
    const [, fg] = nucleusColors(token.quant);
    const g = cellGroups.get(ci) as El;
    g.set("data-cell-quartile", String(qIdx + 1));
    drawQuartileMark(g, tc.nx, tc.ny, nucleusWidth, nucleusHeight, qIdx, fg);
  });

  // Layer 5a: color bar
  drawColorBar(svg, digest, style.edgeColors, barWidth, boundingH, cellTextPx, fingerprintMiddleDigest(core));

  // Layer 5b: labels
  drawLabels(svg, gridLeft, gridTop + gridH, gridTop, gridLeft + gridW, nucleusHeight, typeName, prefix, suffix, labelTextPx, note);

  // Borders
  borderLine(svg, 0, 0.5, boundingW, 0.5);
  borderLine(svg, boundingW - 0.5, 0, boundingW - 0.5, boundingH);
  borderLine(svg, 0, boundingH - 0.5, boundingW, boundingH - 0.5);
  borderLine(svg, 0.5, 0, 0.5, boundingH);
  borderLine(svg, 1 + barWidth + 0.5, 0, 1 + barWidth + 0.5, boundingH);

  return svg.render();
}

export function decodedByteLength(core: string, alphabet: Alphabet): number {
  // Matches the spec's "decode the core under its declared alphabet" length.
  // For 4-bit (hex) that is ceil(len*4/8); for 6-bit (base64url) ceil(len*6/8).
  return Math.floor((core.length * alphabet.bitsPerChar) / 8);
}

export function boxOrigin(i: number, cellX: number, cellY: number, bw: number, bh: number, nucW: number, nucH: number): [number, number] {
  const nLeft = cellX + bw;
  const nTop = cellY + bh;
  const nRight = nLeft + nucW;
  const nBottom = nTop + nucH;
  if (i < 10) return [nLeft - bw + i * bw, nTop - bh];
  if (i < 12) return [nRight, nTop + (i - 10) * bh];
  if (i < 22) return [nLeft - bw + (21 - i) * bw, nBottom];
  return [nLeft - bw, nTop + (23 - i) * bh];
}

export function drawQuartileMark(g: El, nx: number, ny: number, nucW: number, nucH: number, qIdx: number, fg: string) {
  const leg = nucH / 2;
  const left = nx, top = ny, right = nx + nucW, bottom = ny + nucH;
  let pts: [number, number][];
  if (qIdx === 0) pts = [[left, top], [left + leg, top], [left, top + leg]];
  else if (qIdx === 1) pts = [[right, top], [right - leg, top], [right, top + leg]];
  else if (qIdx === 2) pts = [[right, bottom], [right, bottom - leg], [right - leg, bottom]];
  else pts = [[left, bottom], [left, bottom - leg], [left + leg, bottom]];
  g.child("polygon").set("points", pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")).set("fill", fg);
}

export function twoBitUsage(digest: Buffer, edgeColors: string[]): Map<string, number> {
  const counts = [0, 0, 0, 0];
  for (const byte of digest) for (const shift of [0, 2, 4, 6]) counts[(byte >> shift) & 0x03]++;
  const m = new Map<string, number>();
  for (let i = 0; i < 4; i++) m.set(edgeColors[i], counts[i]);
  return m;
}

// v9: colors in each 2-bit pattern's FIRST-APPEARANCE order across the 256
// disjoint slices of the digest (tie-break by pattern value). Decouples the
// color-bar band *order* from the count^4 band *heights* — through v8 the order
// was descending count, carrying no information beyond the heights.
export function twoBitFirstAppearance(digest: Buffer, edgeColors: string[]): string[] {
  const first = new Map<number, number>();
  let idx = 0;
  for (const byte of digest) {
    for (const shift of [0, 2, 4, 6]) {
      const pat = (byte >> shift) & 0x03;
      if (!first.has(pat)) first.set(pat, idx);
      idx++;
    }
  }
  const order = [0, 1, 2, 3].sort(
    (a, b) => (first.get(a) ?? 256 + a) - (first.get(b) ?? 256 + b) || a - b,
  );
  return order.map((p) => edgeColors[p]);
}

export function drawColorBar(svg: El, digest: Buffer, edgeColors: string[], barWidth: number, boundingH: number, cellTextPx: number, secondDigest: Buffer) {
  const usage = twoBitUsage(digest, edgeColors);
  const paletteOrder = new Map<string, number>();
  edgeColors.forEach((c, i) => paletteOrder.set(c, i));
  // v9: band vertical order = each 2-bit pattern's first-appearance order in the
  // digest scan (decoupled from the count^4 heights), tie-break by palette index.
  const bandOrder = twoBitFirstAppearance(digest, edgeColors);
  const orderPos = new Map<string, number>();
  bandOrder.forEach((c, i) => orderPos.set(c, i));
  const used: [string, number][] = edgeColors
    .map((c) => [c, usage.get(c) ?? 0] as [string, number])
    .filter(([, cnt]) => cnt > 0);
  if (!used.length) return;
  used.sort(
    (a, b) =>
      (orderPos.get(a[0]) ?? bandOrder.length) - (orderPos.get(b[0]) ?? bandOrder.length) ||
      (paletteOrder.get(a[0]) as number) - (paletteOrder.get(b[0]) as number),
  );
  const total = used.reduce((s, [, cnt]) => s + cnt ** 4, 0);
  const barLeft = 1, barTop = 1, barHeight = boundingH - 2;
  const barCx = barLeft + barWidth / 2;
  const barG = svg.child("g").set("data-channel", "color-bar");
  let y = barTop;
  used.forEach(([color, cnt], i) => {
    const isLast = i === used.length - 1;
    const h = isLast ? (barTop + barHeight) - y : (barHeight * cnt ** 4) / total;
    const letter = BAND_LETTER[color];
    const bandG = barG.child("g").set("data-color-bar-rank", i);
    if (letter !== undefined) bandG.set("data-color-bar-band", letter);
    bandG.child("rect").set("x", barLeft).set("y", y).set("width", barWidth).set("height", h).set("fill", color);
    if (letter !== undefined) {
      const r = parseInt(color.slice(1, 3), 16), gg = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      const [, fg] = nucleusColors(r | (gg << 8) | (b << 16));
      // PSY-JS-F2: the letter is bottom-anchored (baseline 0.22·font above the
      // band's lower edge). On a very short band (height < ~0.78·font, ~0.09% of
      // inputs) the glyph top bleeds above the band — an accepted design choice:
      // the band COLOR is the primary channel and the letter is a redundant cue,
      // and this matches the Python reference's layout exactly.
      const baselineY = y + h - 0.22 * cellTextPx;
      const t = bandG.child("text").set("x", barCx).set("y", baselineY).set("fill", fg)
        .set("font-size", cellTextPx)
        .set("text-anchor", "middle").set("data-color-bar-letter", "true");
      t.text = letter.toLowerCase();
    }
    y += h;
  });

  // v9: two fixed-slot discrete CIRCLE markers ride the bar's gutters. Identity
  // is carried by SIDE — left = second[12], right = second[13] — not shape.
  // K = clamp(floor(bar_height/12px), 4, 16) equal slots, independent of bands.
  // Drawn OPAQUE (white fill + ~0.75px black halo, NOT a blend mode) so they
  // render identically across rasterizers and stay visible across a band cut.
  const K = Math.max(4, Math.min(16, Math.floor(barHeight / 12)));
  barG.set("data-bar-slots", String(K));
  const slotH = barHeight / K;
  const radius = barWidth * 0.17;
  const inset = barWidth * 0.06;
  const markers: [string, number][] = [
    ["left", secondDigest[12] % K],
    ["right", secondDigest[13] % K],
  ];
  for (const [side, slot] of markers) {
    barG.set(`data-bar-marker-${side}`, String(slot));
    const cy = barTop + (slot + 0.5) * slotH;
    const cx = side === "left" ? barLeft + inset + radius : barLeft + barWidth - inset - radius;
    barG.child("circle").set("cx", cx).set("cy", cy).set("r", radius)
      .set("fill", "#ffffff").set("stroke", "#000000")
      .set("stroke-width", "0.75").set("data-bar-marker", side);
  }
}

export function drawLabels(svg: El, gridLeft: number, gridBottom: number, gridTop: number, gridRight: number, nucleusHeight: number, typeName: string, prefix: string | null, suffix: string | null, textPx: number, note: string | null) {
  // font-family is inherited from the root <svg>; each label <text> carries
  // only a compact font-size presentation attribute.
  const topG = svg.child("g").set("data-channel", "label-top");
  let restText: string;
  if (typeName) restText = prefix ? `${typeName}: ${prefix}...` : `${typeName}:`;
  else restText = prefix ? `${prefix}...` : "";
  const topCy = gridTop - nucleusHeight / 2;
  const el = topG.child("text").set("x", gridLeft).set("y", topCy).set("fill", "#666666").set("font-size", textPx).set("dominant-baseline", "central");
  el.text = restText;
  if (suffix || note) {
    const bottomG = svg.child("g").set("data-channel", "label-bottom");
    const bottomCy = gridBottom + nucleusHeight / 2;
    const bel = bottomG.child("text").set("x", gridRight).set("y", bottomCy).set("fill", "#666666").set("font-size", textPx).set("text-anchor", "end").set("dominant-baseline", "central");
    if (suffix && note) {
      const st = bel.child("tspan"); st.text = `...${suffix} `;
      const nt = bel.child("tspan").set("fill", "#808080").set("data-user-note", note); nt.text = `(${note})`;
    } else if (suffix) {
      bel.text = `...${suffix}`;
    } else {
      const nt = bel.child("tspan").set("fill", "#808080").set("data-user-note", note as string); nt.text = `(${note})`;
    }
  }
}

export function borderLine(svg: El, x1: number, y1: number, x2: number, y2: number) {
  svg.child("line").set("x1", x1).set("y1", y1).set("x2", x2).set("y2", y2)
    .set("stroke", "#808080").set("stroke-width", "1").set("shape-rendering", "crispEdges");
}

export function enumerateInteriorCorners(cols: number, rows: number, cw: number, ch: number, ox: number, oy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) pts.push([ox + c * cw, oy + r * ch]);
  return pts;
}
export function enumerateExternalCorners(cols: number, rows: number, cw: number, ch: number, ox: number, oy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let c = 0; c <= cols; c++) pts.push([ox + c * cw, oy]);
  for (let r = 1; r < rows; r++) { pts.push([ox, oy + r * ch]); pts.push([ox + cols * cw, oy + r * ch]); }
  for (let c = 0; c <= cols; c++) pts.push([ox + c * cw, oy + rows * ch]);
  return pts;
}

export function drawEllipse(gridG: El, digest: Buffer, gridLeft: number, gridTop: number, gridW: number, gridH: number, cw: number, ch: number, grid: Grid, bgColor: string, clipId: string) {
  const cols = grid.cols, rows = grid.rows;
  const interior = (cols - 1) * (rows - 1);
  const pts = interior >= 6
    ? enumerateInteriorCorners(cols, rows, cw, ch, gridLeft, gridTop)
    : enumerateExternalCorners(cols, rows, cw, ch, gridLeft, gridTop);
  if (!pts.length) return;
  const anchorIndex = digest[60];
  const rxStep = digest[61] % 16;
  const ryStep = digest[62] % 16;
  const rotStep = digest[63] % 16;
  const [ax, ay] = pts[anchorIndex % pts.length];
  const gridRight = gridLeft + gridW, gridBottom = gridTop + gridH;
  const corners: [number, number][] = [[gridLeft, gridTop], [gridRight, gridTop], [gridLeft, gridBottom], [gridRight, gridBottom]];
  let dFar = 0;
  for (const [cx, cy] of corners) dFar = Math.max(dFar, Math.hypot(cx - ax, cy - ay));
  const rMin = 0.22 * dFar, rMax = 0.58 * dFar;
  if (rMax <= rMin) return;
  const rx = rMin + (rxStep / 15) * (rMax - rMin);
  const ry = rMin + (ryStep / 15) * (rMax - rMin);
  const rotationDeg = (rotStep / 15) * 180;
  const [fill, fillOp, edgeOp] = OVERLAY_BY_BG[bgColor] ?? ["#000000", 0.2, 0.3];
  const strokeW = ch / 20;
  const clipped = gridG.child("g")
    .set("clip-path", `url(#${clipId})`)
    .set("data-channel", "ellipse")
    .set("data-ellipse-anchor-x", ax)
    .set("data-ellipse-anchor-y", ay)
    .set("data-ellipse-rx", rx)
    .set("data-ellipse-ry", ry)
    .set("data-ellipse-rotation-deg", rotationDeg);
  clipped.child("ellipse")
    .set("cx", ax).set("cy", ay).set("rx", rx).set("ry", ry)
    .set("transform", `rotate(${n(rotationDeg)} ${n(ax)} ${n(ay)})`)
    .set("fill", fill).set("stroke", fill)
    .set("fill-opacity", fillOp).set("stroke-opacity", edgeOp).set("stroke-width", strokeW);
}
