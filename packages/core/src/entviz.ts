/**
 * entviz — TypeScript reference port (core).
 *
 * A faithful port of the Python reference (docs/spec.md, v11), including the
 * >512-bit large-input path. Certified against the shared conformance corpus
 * (see the entviz repo's compliance/ suite). The full identifier-parser
 * dispatch is ported: hex-multihash, CESR, SSH keys, Bitcoin/Ripple/Litecoin/
 * Bitcoin-Cash/Cardano/Stellar addresses, UUID, ULID, snowflake, LEI, DID, URN,
 * SWHID, gitoid, generic bech32, IPFS CID, hex, EOS — followed by disproof-based
 * alphabet detection and the UTF-8→base64url fallback. Order is semantics (see
 * `PARSE_FUNCS`), matching the reference's `parse_funcs` list exactly.
 *
 * Runs under Node's native TypeScript type-stripping (Node >= 22.6); no
 * build step required. Isomorphic: hashing/encoding go through @noble/hashes +
 * the browser-safe helpers in bytes.ts (no node:crypto/node:fs/Buffer), so the
 * renderer bundles cleanly for the browser too — see isomorphic.test.ts.
 */
import { sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  utf8Bytes,
  utf8ByteLength,
  bytesToHex,
  bytesToBase64url,
} from "./bytes.ts";
import pkg from "../package.json" with { type: "json" };

export const SPEC_VERSION = "v11";
// Read the published version straight from package.json (via a JSON import, so
// the renderer stays browser-bundleable — no node:fs) so the data-entviz-lib
// stamp can never drift from the release. release.py bumps only package.json;
// duplicating the version as a literal here would silently go stale on every
// release (the value would lie about which build produced an SVG).
export const LIB_VERSION = (pkg as { version: string }).version;
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
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
// Base32 (RFC 4648) and its either-case input variant (the address regexes
// accept upper- or lower-case base32). Stellar / IPFS CIDv1 use base32.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_ALPHABET_EITHER_CASE =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
// Bech32 (BIP-173): 32 chars, intentionally excludes 1/b/i/o.
const BECH32_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_ALPHABET_EITHER_CASE =
  BECH32_ALPHABET + BECH32_ALPHABET.toUpperCase();
// Crockford base32 (excludes I/L/O/U). Used by ULID. (The fingerprint-middle
// readout uses its own lowercase string constant, CROCKFORD32, further down.)
const CROCKFORD32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// Base36: digits + uppercase letters. Used by GLEIF LEI (ISO 17442).
const BASE36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Decimal: snowflake IDs only.
const DECIMAL_ALPHABET = "0123456789";
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const HEX: Alphabet = { name: "hex", chars: HEX_ALPHABET, bitsPerChar: 4 };
export const BASE58: Alphabet = { name: "base58", chars: BASE58_ALPHABET, bitsPerChar: 6 };
export const BASE64: Alphabet = { name: "base64", chars: BASE64_ALPHABET, bitsPerChar: 6 };
export const BASE32: Alphabet = { name: "base32", chars: BASE32_ALPHABET, bitsPerChar: 5 };
export const BECH32: Alphabet = { name: "bech32", chars: BECH32_ALPHABET, bitsPerChar: 5 };
// ULID core alphabet (Crockford base32). Named CROCKFORD32_AB to avoid a clash
// with the lowercase CROCKFORD32 string used by the fingerprint-middle readout.
export const CROCKFORD32_AB: Alphabet = {
  name: "crockford32",
  chars: CROCKFORD32_ALPHABET,
  bitsPerChar: 5,
};
export const BASE36: Alphabet = { name: "base36", chars: BASE36_ALPHABET, bitsPerChar: 6 };
export const DECIMAL: Alphabet = { name: "decimal", chars: DECIMAL_ALPHABET, bitsPerChar: 4 };
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
export function computeFingerprint(core: string): Uint8Array {
  return sha512(utf8Bytes(core));
}

// PREFIX-FOLD (v11): a SEMANTIC prefix (an identity-bearing scheme/method/NID —
// did:web:, urn:isbn:, …) is folded into the FINGERPRINT input so that two
// values differing ONLY in their semantic prefix avalanche apart across every
// fingerprint-driven channel. `prefix ‖ core` is exactly the original primitive
// string for these inputs, so no information is invented. A SIGNAL prefix (0x,
// prefixSemantic falsy) is NOT folded: the fingerprint stays over the bare core,
// preserving the pre-existing keying of hex/UUID/ETH. NOTE the fingerprint-MIDDLE
// digest (color-bar markers) deliberately stays over the bare `core`, mirroring
// the Python reference — only the PRIMARY fingerprint folds the prefix.
export function fingerprintCore(
  core: string,
  prefix: string | null,
  prefixSemantic: boolean | undefined,
): string {
  return prefix && prefixSemantic ? prefix + core : core;
}

// The second, domain-separated digest: SHA-512(DOMAIN_TAG ‖ core). Computed for
// EVERY input (v9): it drives the two color-bar markers on all inputs (and,
// on >512-bit inputs, the 4 fingerprint-middle cells — see fingerprintMiddleTokens).
// The DOMAIN_TAG keeps it independent of the primary fingerprint; its "v6" is a
// fixed construction version, NOT the spec version. It is FROZEN: changing it
// re-keys the fingerprint-middle digest of every input, so it MUST NOT be
// bumped when the spec version changes. The normative definition lives in the
// entviz reference repo's docs/spec.md (this is a port; there is no this.i
// here).
// The tag is pure ASCII (incl. the trailing NUL), so its UTF-8 bytes equal the
// latin1 bytes the reference uses — the digest is unchanged by encoding it here.
const MIDDLE_DOMAIN_TAG = utf8Bytes("entviz/fingerprint-middle/v6\0");
export function fingerprintMiddleDigest(core: string): Uint8Array {
  return sha512.create().update(MIDDLE_DOMAIN_TAG).update(utf8Bytes(core)).digest();
}

export function tokenizeFingerprint(digest: Uint8Array): Token[] {
  if (digest.length !== 64) throw new Error("fingerprint must be 64 bytes");
  const b64 = bytesToBase64url(digest); // unpadded
  const toks = tokenize(b64, BASE64URL);
  if (toks.length !== 22) throw new Error(`expected 22 ftoks, got ${toks.length}`);
  return toks;
}

// ---------------------------------------------------------------------------
// Large-input handling (>512-bit). The text channel can't be lossless past 512
// bits, so it shows head (first 8 tokens) + middle (4 fingerprint tokens) + tail
// (last 8 tokens); the whole input is still bound via the primary fingerprint.
// Mirrors the reference (docs/spec.md "Large-input handling"); the construction
// is frozen at v6.
// ---------------------------------------------------------------------------
export const MAX_TOKENS = 22;
export const HEAD_TOKENS = 8;
export const MIDDLE_TOKENS = 4;
const TAIL_TOKENS = 8;
// Anti-DoS cap: entviz visualizes identifiers; the largest plausible one is a
// few KB, so 64 KiB is ~16x headroom. Past it, render() rejects outright.
export const MAX_INPUT_CHARS = 65536;

// Crockford base32 (excludes I/L/O/U). Used only for the fingerprint-middle
// cells, so each carries a full 24 bits and the readout is homoglyph-clean and
// single-case (no read-aloud "cap" cue).
const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function crockford5(value: number): string {
  let v = value >>> 0;
  let out = "";
  for (let k = 0; k < 5; k++) {
    out = CROCKFORD32[v & 0x1f] + out;
    v >>>= 5;
  }
  return out.toLowerCase();
}

// The 4 middle tokens: token i renders second[3i..3i+2] (24-bit big-endian) as
// 5 lowercase Crockford base32 chars. Crockford regardless of the input
// alphabet, so the readout is injective (32^5 = 2^25 >= 2^24) and avalanches on
// any input change; the domain tag keeps it independent of the primary
// fingerprint. Token indices here are 0..3; the caller renumbers into 0..19.
export function fingerprintMiddleTokens(core: string): Token[] {
  const second = fingerprintMiddleDigest(core);
  const out: Token[] = [];
  for (let i = 0; i < MIDDLE_TOKENS; i++) {
    const quant = (second[3 * i] << 16) | (second[3 * i + 1] << 8) | second[3 * i + 2];
    out.push({ text: crockford5(quant), index: i, quant });
  }
  return out;
}

// Tokenize for rendering: the short path for <=512-bit inputs, else the
// head/middle/tail large-input path (20 tokens renumbered 0..19, truncated=true).
// The >22-token guard also bounds a sub-512-bit edge case (e.g. a 23-token
// bech32 fragment) onto the large path, matching the reference.
export function tokenizeEntropy(
  core: string,
  alphabet: Alphabet,
): { tokens: Token[]; truncated: boolean } {
  const tokenLen = Math.floor(24 / alphabet.bitsPerChar);
  const tokenCount = Math.ceil(core.length / tokenLen);
  const nBytes = decodedByteLength(core, alphabet);
  if (tokenCount <= MAX_TOKENS && nBytes <= 64) {
    return { tokens: tokenize(core, alphabet), truncated: false };
  }
  const head = tokenize(core.slice(0, HEAD_TOKENS * tokenLen), alphabet);
  const tail = tokenize(core.slice(core.length - TAIL_TOKENS * tokenLen), alphabet);
  const combined = [...head, ...fingerprintMiddleTokens(core), ...tail];
  const tokens = combined.map((t, i) => ({ text: t.text, index: i, quant: t.quant }));
  return { tokens, truncated: true };
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

// The grid's natural aspect ratio (W/H) — cells are 3:2, so a cols×rows grid is
// (cols·3)/(rows·2). chooseGrid selects the candidate closest to (and ≥) the
// requested targetAr; this is also the targetAr that re-selects that candidate.
export function gridAspectRatio(cols: number, rows: number): number {
  return (cols * 3) / (rows * 2);
}

// All grid shapes a given token count can take (one tightest cols per row count),
// in no particular order. chooseGrid picks one of these by targetAr; the reshape
// picker offers them. Shared so the two can never disagree on what is achievable.
export function gridCandidates(tokenCount: number): Grid[] {
  const tightest = new Map<number, number>();
  for (let cols = 2; cols <= tokenCount; cols++) {
    const rows = Math.ceil(tokenCount / cols);
    if (rows < 2) continue;
    if (!tightest.has(rows) || cols < (tightest.get(rows) as number)) {
      tightest.set(rows, cols);
    }
  }
  const out: Grid[] = [];
  for (const [rows, cols] of tightest) out.push({ cols, rows, tokenCount });
  return out;
}

export function chooseGrid(tokenCount: number, targetAr = 1.0): Grid {
  const candidates = gridCandidates(tokenCount);
  if (!candidates.length) return { cols: 2, rows: 2, tokenCount };
  const above = candidates.filter((c) => gridAspectRatio(c.cols, c.rows) >= targetAr);
  const closestAbove = (a: Grid, b: Grid) =>
    gridAspectRatio(b.cols, b.rows) - targetAr < gridAspectRatio(a.cols, a.rows) - targetAr ? b : a;
  const widest = (a: Grid, b: Grid) =>
    gridAspectRatio(b.cols, b.rows) > gridAspectRatio(a.cols, a.rows) ? b : a;
  const chosen = above.length ? above.reduce(closestAbove) : candidates.reduce(widest);
  return { cols: chosen.cols, rows: chosen.rows, tokenCount };
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
  // `prefixSemantic` marks a prefix as IDENTITY-bearing — it must BIND the
  // fingerprint (the pipeline fingerprints `prefix ‖ core`) rather than being a
  // mere display signal. Defaults to false so every existing Parsed object
  // literal (hex/UUID/ETH) keeps the old signal-prefix behavior, where the
  // fingerprint stays over the bare core. See docs/spec.md (the "swap test").
  prefixSemantic?: boolean;
}

// DID (W3C DID Core), v11. `did:<method>:<method-specific-id>` optionally
// followed by a DID-URL tail (path `/…`, query `?…`, fragment `#…`). The msid
// MAY contain `:` as a segment separator, so the body ends only at the first
// `/`, `?`, or `#` — the tail is a FREE annotation and is DROPPED. method is
// lowercase alnum per the ABNF. The `.` in the msid char class is literal; the
// trailing `-` in `[A-Za-z0-9._%:-]` is a literal hyphen.
const DID_RE = /^did:([a-z0-9]+):([A-Za-z0-9._%:-]+)(?:[/?#].*)?$/;
// URN (RFC 8141): `urn:<NID>:<NSS>` optionally followed by r-/q-/f-components
// (`?+` / `?=` / `#`), which are NOT part of URN equivalence and are dropped.
// The `urn` scheme and the NID are case-INSENSITIVE (the `i` flag; the prefix
// is lowercased below); the NSS is case-sensitive and kept VERBATIM. `/` is a
// legal NSS char, so the NSS ends only at the first `?` or `#`.
const URN_RE = /^urn:([A-Za-z0-9][A-Za-z0-9-]{0,31}):([^?#]+)(?:[?#].*)?$/i;

// Parse a W3C DID / DID-URL. method is IDENTITY (same body under a different
// method is a different DID), so `did:<method>:` is kept as the prefix and
// bound by PREFIX-FOLD (prefixSemantic=true). The method-specific-id is the
// core, kept verbatim (NOT case-folded — DIDs are case-sensitive), tokenized as
// base64url. No type label: the prefix is self-describing. See docs/spec.md
// *Decentralized Identifiers*.
function parseDid(text: string): Parsed | null {
  const m = text.match(DID_RE);
  if (m === null) return null;
  return {
    type: "",
    core: m[2],
    alphabet: BASE64URL,
    prefix: `did:${m[1]}:`,
    suffix: null,
    prefixSemantic: true,
  };
}

// Parse a URN (RFC 8141). Same shape as a DID: the NID is IDENTITY, bound by
// PREFIX-FOLD; the NSS is the core, kept verbatim, base64url. Two differences
// from a DID: the NSS keeps `/` (ends only at `?`/`#`), and the scheme+NID are
// case-INSENSITIVE so the `urn:<nid>:` prefix is LOWERCASED while the NSS case
// is PRESERVED. See docs/spec.md *Uniform Resource Names*.
function parseUrn(text: string): Parsed | null {
  const m = text.match(URN_RE);
  if (m === null) return null;
  return {
    type: "",
    core: m[2],
    alphabet: BASE64URL,
    prefix: `urn:${m[1].toLowerCase()}:`,
    suffix: null,
    prefixSemantic: true,
  };
}

const HEX_RE = /^[0-9a-fA-F]+$/;
const UUID_RE =
  /^\{?[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}\}?$/;
const ETHEREUM_RE = /^(0[xX])?([0-9a-fA-F]{40})$/;

// EIP-55: throw if `body` (40 hex chars, mixed case) disagrees with the
// canonical checksum case derived from keccak256(lower(body)). Rejecting —
// rather than silently rendering — is a spec MUST (docs/spec.md "Ethereum
// (EIP-55) case validation"): a corrupted address must fail closed, not render
// a plausible-but-wrong entviz that looks like a different valid address.
function validateEip55(body: string): void {
  const digestHex = bytesToHex(keccak_256(utf8Bytes(body.toLowerCase())));
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

// ---------------------------------------------------------------------------
// Multihash / multicodec tables + varint reader (CID labeling). Browser-safe:
// pure JS over numbers, no Buffer/node:crypto.
// ---------------------------------------------------------------------------
const MULTIHASH_HASH_FUNCS: Record<number, string> = {
  0x11: "sha1", 0x12: "sha2-256", 0x13: "sha2-512", 0x14: "sha3-224",
  0x15: "sha3-256", 0x16: "sha3-384", 0x17: "sha3-512", 0x18: "shake-128",
  0x19: "shake-256", 0x1a: "keccak-224", 0x1b: "keccak-256", 0x1c: "keccak-384",
  0x1d: "keccak-512", 0x22: "blake2b-8", 0x23: "blake2b-16", 0x24: "blake2b-24",
  0x25: "blake2b-32", 0x26: "blake2b-40", 0x27: "blake2b-48", 0x28: "blake2b-56",
  0x29: "blake2b-64", 0x2a: "blake2b-72", 0x2b: "blake2b-80", 0x2c: "blake2b-88",
  0x2d: "blake2b-96", 0x2e: "blake2b-104", 0x2f: "blake2b-112", 0x30: "blake2b-120",
  0x31: "blake2b-128", 0x32: "blake2b-136", 0x33: "blake2b-144", 0x34: "blake2b-152",
  0x35: "blake2b-160", 0x36: "blake2b-168", 0x37: "blake2b-176", 0x38: "blake2b-184",
  0x39: "blake2b-192", 0x3a: "blake2b-200", 0x3b: "blake2b-208", 0x3c: "blake2b-216",
  0x3d: "blake2b-224", 0x3e: "blake2b-232", 0x3f: "blake2b-240", 0x40: "blake2b-248",
  0x41: "blake2b-256", 0xb201: "dbl-sha2-256", 0xb202: "murmur3-128", 0xb203: "murmur3-32",
};
const MULTICODEC_CONTENT: Record<number, string> = {
  0x00: "identity", 0x51: "cbor", 0x55: "raw", 0x60: "rlp", 0x70: "dag-pb",
  0x71: "dag-cbor", 0x72: "libp2p-key", 0x78: "git-raw", 0x90: "eth-block",
  0x97: "eth-tx", 0x0129: "dag-json", 0x0202: "car",
};

// Read an unsigned LEB128 varint from `data` at `pos`. Returns null if the
// buffer ends mid-varint. (CID prefixes use only small values, so number math
// is exact.)
function readUvarint(data: Uint8Array, pos: number): { value: number; pos: number } | null {
  let result = 0;
  let shift = 0;
  while (pos < data.length) {
    const b = data[pos];
    pos += 1;
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: result >>> 0, pos };
    shift += 7;
  }
  return null;
}

// RFC 4648 base32 decode of an upper/lower body (no padding required). Streams
// 5-bit groups MSB-first and emits whole bytes, dropping the final partial bits
// (matches Python's b32decode on a properly-padded multiple-of-8 body for the
// leading bytes the varint reader consumes). Returns null on a non-base32 char.
function b32NoPadDecode(s: string): Uint8Array | null {
  const up = s.toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of up) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

// hex string -> bytes; null on odd length or a non-hex char.
function hexToBytes(s: string): Uint8Array | null {
  if (s.length % 2 !== 0) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    const byte = parseInt(s.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i / 2] = byte;
  }
  return out;
}

// Decode the leading varints of a binary CIDv1 into (content codec, hash) names,
// or null if the bytes do not describe a recognized version-1 codec/hash.
function decodeMulticodec(cidBytes: Uint8Array): [string, string] | null {
  const v = readUvarint(cidBytes, 0);
  if (!v || v.value !== 1) return null;
  const codec = readUvarint(cidBytes, v.pos);
  if (!codec) return null;
  const hashFn = readUvarint(cidBytes, codec.pos);
  if (!hashFn) return null;
  const codecName = MULTICODEC_CONTENT[codec.value];
  const hashName = MULTIHASH_HASH_FUNCS[hashFn.value];
  if (codecName === undefined || hashName === undefined) return null;
  return [codecName, hashName];
}

// Parse `bytes` as a binary multihash: byte 0 = hash-func code, byte 1 = digest
// length, then `length` digest bytes (and nothing more). Returns prefix (2
// bytes) + body (digest) + decoded label, or null.
function parseMultihash(bytes: Uint8Array): { label: string; prefix: Uint8Array; core: Uint8Array } | null {
  if (bytes.length >= 3) {
    const hashFunc = MULTIHASH_HASH_FUNCS[bytes[0]];
    if (hashFunc) {
      const hashLength = bytes[1];
      if (bytes.length === hashLength + 2) {
        const label = hashFunc === "sha2-256" ? "multihash" : `multihash ${hashFunc}`;
        return { label, prefix: bytes.slice(0, 2), core: bytes.slice(2) };
      }
    }
  }
  return null;
}

// Parse text as a hex-encoded multihash. The body must be even-length all-hex
// (an odd-length hex string falls through to parse_hex, which checks parity).
function parseHexMultihash(text: string): Parsed | null {
  if (!text || text.length < 6) return null;
  if (text.length % 2 !== 0) return null;
  if (!HEX_RE.test(text)) return null;
  const bytes = hexToBytes(text);
  if (!bytes) return null;
  const mh = parseMultihash(bytes);
  if (!mh) return null;
  return {
    type: `hex ${mh.label}`,
    core: bytesToHex(mh.core).toLowerCase(),
    alphabet: HEX,
    prefix: bytesToHex(mh.prefix).toLowerCase(),
    suffix: null,
  };
}

// ---------------------------------------------------------------------------
// CESR (Composable Event Streaming Representation) derivation codes.
// ---------------------------------------------------------------------------
const CESR_1_BYTE_CODES: [string, string, number][] = [
  ["A", "Ed25519 seed", 44], ["B", "Ed25519 nt pubkey", 44], ["C", "X25519 pub enckey", 44],
  ["D", "Ed25519 pubkey", 44], ["E", "Blake3-256", 44], ["F", "Blake2b-256", 44],
  ["G", "Blake2s-256", 44], ["H", "SHA3-256", 44], ["I", "SHA2-256", 44],
  ["J", "secp256k1 seed", 44], ["K", "Ed448 seed", 76], ["L", "X448 pub enckey", 76],
  ["O", "X25519 priv deckey", 44], ["P", "X25519 124 cipher 44 seed", 124], ["Q", "secp256r1 seed", 44],
  ["a", "blinding factor", 44], ["c", "FN-DSA-512 seed", 44], ["d", "FN-DSA-1024 seed", 44],
  ["e", "FN-DSA-1024 sig", 1708], ["b", "FN-DSA-1024 pubkey", 2392],
];
const CESR_1_BYTE_LENGTHS = new Set(CESR_1_BYTE_CODES.map((x) => x[2]));
const CESR_2_BYTE_CODES: [string, string, number][] = [
  ["0A", "random 128-bit number", 24], ["0B", "Ed25519 sig", 88], ["0C", "secp256k1 sig", 88],
  ["0D", "Blake3-512", 88], ["0E", "Blake2b-512", 88], ["0F", "SHA3-512", 88],
  ["0G", "SHA2-512", 88], ["0I", "secp256r1 sig", 88],
];
const CESR_2_BYTE_LENGTHS = new Set(CESR_2_BYTE_CODES.map((x) => x[2]));
const CESR_4_BYTE_CODES: [string, string, number][] = [
  ["1AAA", "secp256k1 nt pubkey", 48], ["1AAB", "secp256k1 pub/enc key", 48],
  ["1AAC", "Ed448 nt pubkey", 80], ["1AAD", "Ed448 pubkey", 80], ["1AAE", "Ed448 sig", 156],
  ["1AAH", "X25519 100 cipher 24 salt", 100], ["1AAI", "secp256r1 nt pubkey", 48],
  ["1AAJ", "secp256r1 pub/enc key", 48], ["1AAR", "FN-DSA-512 sig", 892], ["1AAQ", "FN-DSA-512 pubkey", 1200],
];
const CESR_4_BYTE_LENGTHS = new Set(CESR_4_BYTE_CODES.map((x) => x[2]));
const BASE64URL_NO_PAD_RE = /^[A-Za-z0-9\-_]+$/;

// The derivation code is IDENTITY (it stays IN the core — rendered AND
// fingerprinted), not a stripped prefix. Decoded type goes in the label.
function parseCesr(text: string): Parsed | null {
  if (!text) return null;
  const lenText = text.length;
  const code = text[0];
  let items: [string, string, number][] | null = null;
  if (code === "0") {
    if (CESR_2_BYTE_LENGTHS.has(lenText)) items = CESR_2_BYTE_CODES;
  } else if (code === "1") {
    if (CESR_4_BYTE_LENGTHS.has(lenText)) items = CESR_4_BYTE_CODES;
  } else if (CESR_1_BYTE_LENGTHS.has(lenText)) {
    items = CESR_1_BYTE_CODES;
  }
  if (!items) return null;
  for (const [prefix, label, length] of items) {
    if (text.startsWith(prefix) && lenText === length) {
      if (BASE64URL_NO_PAD_RE.test(text)) {
        return { type: `CESR ${label}`, core: text, alphabet: BASE64URL, prefix: null, suffix: null };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SSH public keys.
// ---------------------------------------------------------------------------
// (short_name, match_str, prefix_length). Order matters: longer/more-specific
// prefixes first so they aren't shadowed by shorter substrings.
const SSH_KEY_TYPES: [string, string, number][] = [
  ["ecdsa-nistp256", "AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABB", 52],
  ["ecdsa-nistp384", "AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABh", 52],
  ["ecdsa-nistp521", "AAAAE2VjZHNhLXNoYTItbmlzdHA1MjEAAAAIbmlzdHA1MjEAAACF", 52],
  ["rsa", "AAAAB3NzaC1yc2EAAAADAQAB", 28],
  ["ed25519", "AAAAC3NzaC1lZDI1NTE5AAAA", 24],
  ["dss", "AAAAB3NzaC1kc3M", 15],
];
const SSH_KEY_RE = /^(AAAA)([0-9A-Za-z+/]+={0,3})$/;
const SSH_LINE_RE =
  /^(?:(?:ssh-(?:ed25519|rsa|dss)|ecdsa-sha2-nistp(?:256|384|521))\s+)?(AAAA[0-9A-Za-z+/]+={0,3})(?:\s+(\S[\s\S]*))?$/;

function parseSshKey(text: string): Parsed | null {
  const m = text.match(SSH_LINE_RE);
  if (!m) {
    const km = text.match(SSH_KEY_RE);
    if (km) return { type: "SSH key", core: km[2], alphabet: BASE64, prefix: km[1], suffix: null };
    return null;
  }
  const payload = m[1];
  // m[2] is the trailing comment — a free annotation, dropped.
  for (const [shortName, matchStr, prefixLength] of SSH_KEY_TYPES) {
    if (payload.startsWith(matchStr) && payload.length >= prefixLength) {
      return {
        type: `SSH ${shortName}`,
        core: payload.slice(prefixLength),
        alphabet: BASE64,
        prefix: payload.slice(0, prefixLength),
        suffix: null,
      };
    }
  }
  // SSH_LINE_RE guaranteed the payload is `AAAA<b64+><=*0-3>`, which SSH_KEY_RE
  // matches by construction, so this legacy fallback always succeeds here (the
  // reference's trailing `return None` is unreachable on this branch and is
  // omitted to keep the line reachable/testable). The non-NULL assertion is
  // safe for that reason.
  const legacy = payload.match(SSH_KEY_RE)!;
  return { type: "SSH key", core: legacy[2], alphabet: BASE64, prefix: legacy[1], suffix: null };
}

// ---------------------------------------------------------------------------
// Blockchain address regexes + parsers.
// ---------------------------------------------------------------------------
const B58 = BASE58_ALPHABET;
const B58C = `[${B58}]`;
const BECH32E = `[${BECH32_ALPHABET_EITHER_CASE}]`;
const BASE32E = `[${BASE32_ALPHABET_EITHER_CASE}]`;
const BITCOIN_LEGACY_RE = new RegExp(`^([123mn])(${B58C}{21,30})(${B58C}{4})$`);
const BITCOIN_SEGWIT_RE = new RegExp(`^(bc1|tb1)(${BECH32E}{39,69})$`, "i");
const RIPPLE_RE = new RegExp(`^(r)(${B58C}{33})$`);
const LITECOIN_LEGACY_RE = new RegExp(`^(t?L)(${B58C}{33})$`);
const LITECOIN_RE = new RegExp(`^(ltc1)(${BECH32E}{38,68})$`, "i");
const BITCOIN_CASH_RE = new RegExp(`^((?:bitcoincash|bchtest):)?([pq]${BECH32E}{41})$`, "i");
const CARDANO_SHORT_BYRON_RE = new RegExp(`^(Ae2)(${B58C}{50})(${B58C}{6})$`);
const CARDANO_LONG_BYRON_RE = new RegExp(`^(DdzFF)(${B58C}{65})(${B58C}{6})$`);
const CARDANO_SHELLEY_RE = new RegExp(`^((?:addr|stake)(?:_test)?1)(${BECH32E}{50,100})(${BECH32E}{6})$`);
const STELLAR_RE = new RegExp(`^(G|g)(${BASE32E}{55})$`);
const STELLAR_MUXED_RE = new RegExp(`^(M|m)(${BASE32E}{68})$`);
const BECH32_GENERIC_RE = new RegExp(`^([a-z]{1,83})1([${BECH32_ALPHABET}]{8,})$`, "i");
const IPFS_CIDV0_RE = new RegExp(`^(Qm)(${B58C}{44})$`);
const IPFS_CIDV1_RE = new RegExp(`^(b)(${BASE32E}{58,112})$`);
const EOS_RE = /(^[a-z1-5.]{1,11}[a-z1-5]$)|(^[a-z1-5.]{12}[a-j1-5]$)/;

function parseBitcoin(text: string): Parsed | null {
  let m = text.match(BITCOIN_LEGACY_RE);
  if (m) return { type: "BTC legacy", core: m[2], alphabet: BASE58, prefix: m[1], suffix: m[3] };
  m = text.match(BITCOIN_SEGWIT_RE);
  if (m) return { type: "BTC SegWit", core: m[2].toLowerCase(), alphabet: BECH32, prefix: m[1].toLowerCase(), suffix: null };
  return null;
}

function parseRipple(text: string): Parsed | null {
  const m = text.match(RIPPLE_RE);
  if (m) return { type: "XRP", core: m[2], alphabet: BASE58, prefix: m[1], suffix: null };
  return null;
}

function parseLitecoin(text: string): Parsed | null {
  let m = text.match(LITECOIN_LEGACY_RE);
  if (m) return { type: "LTC legacy", core: m[2], alphabet: BASE58, prefix: m[1], suffix: null };
  m = text.match(LITECOIN_RE);
  if (m) return { type: "LTC", core: m[2].toLowerCase(), alphabet: BECH32, prefix: m[1].toLowerCase(), suffix: null };
  return null;
}

function parseBitcoinCash(text: string): Parsed | null {
  const m = text.match(BITCOIN_CASH_RE);
  // CashAddr uses the bech32 alphabet (not RFC 4648 base32) despite the name.
  if (m) return { type: "BCH", core: m[2].toLowerCase(), alphabet: BECH32, prefix: m[1] ?? null, suffix: null };
  return null;
}

function parseCardano(text: string): Parsed | null {
  let m = text.match(CARDANO_SHORT_BYRON_RE);
  if (m) return { type: "ADA Byron", core: m[2], alphabet: BASE58, prefix: m[1], suffix: m[3] };
  m = text.match(CARDANO_LONG_BYRON_RE);
  if (m) return { type: "ADA Byron", core: m[2], alphabet: BASE58, prefix: m[1], suffix: m[3] };
  m = text.match(CARDANO_SHELLEY_RE);
  if (m) return { type: "ADA Shelley", core: m[2].toLowerCase(), alphabet: BECH32, prefix: m[1], suffix: m[3].toLowerCase() };
  return null;
}

function parseStellar(text: string): Parsed | null {
  let m = text.match(STELLAR_RE);
  if (m) return { type: "XLM", core: m[2].toUpperCase(), alphabet: BASE32, prefix: m[1].toUpperCase(), suffix: null };
  m = text.match(STELLAR_MUXED_RE);
  if (m) return { type: "XLM muxed", core: m[2].toUpperCase(), alphabet: BASE32, prefix: m[1].toUpperCase(), suffix: null };
  return null;
}

function parseEos(text: string): Parsed | null {
  const m = text.match(EOS_RE);
  if (!m) return null;
  const whole = m[0];
  // Don't let EOS claim an all-hex fragment (parse_hex wins for even-length
  // hex; odd-length all-[a-f1-5] is a hex fragment, not an EOS name).
  if ([...whole].every((c) => "0123456789abcdef".includes(c))) return null;
  return { type: "EOS", core: whole, alphabet: BASE64, prefix: null, suffix: null };
}

// ---------------------------------------------------------------------------
// UUID / ULID / snowflake / LEI.
// ---------------------------------------------------------------------------
function parseUuid(text: string): Parsed | null {
  const m = text.match(UUID_RE);
  if (!m) return null;
  const body = m[0].toLowerCase().replace(/-/g, "").replace(/[{}]/g, "");
  return { type: "UUID", core: body, alphabet: HEX, prefix: null, suffix: null };
}

const ULID_RE = /^[0-9A-TV-Za-tv-z]{26}$/;
// Crockford input-alias translation: I/L -> 1, O -> 0 (either case).
function crockfordAliases(s: string): string {
  let out = "";
  for (const c of s) {
    if (c === "I" || c === "i" || c === "L" || c === "l") out += "1";
    else if (c === "O" || c === "o") out += "0";
    else out += c;
  }
  return out;
}
function parseUlid(text: string): Parsed | null {
  if (!ULID_RE.test(text)) return null;
  const normalized = crockfordAliases(text).toUpperCase();
  return { type: "ULID", core: normalized, alphabet: CROCKFORD32_AB, prefix: null, suffix: null };
}

const SNOWFLAKE_RE = /^[0-9]{17,20}$/;
function parseSnowflake(text: string): Parsed | null {
  if (!SNOWFLAKE_RE.test(text)) return null;
  // Sign-bit (bit 63) must be clear: a canonical snowflake is non-negative
  // signed 64-bit. BigInt because the value can exceed 2^53.
  if (BigInt(text) >> 63n) return null;
  return { type: "snowflake", core: text, alphabet: DECIMAL, prefix: null, suffix: null };
}

const LEI_RE = /^[0-9A-Za-z]{20}$/;
// ISO/IEC 7064 MOD 97-10: map letters to base36 values (A=10..Z=35), interpret
// the digit string as a base-10 integer (BigInt — it exceeds 2^53), require ≡ 1
// (mod 97). LEI_RE only matches [0-9A-Za-z] but case-folds to upper first.
function leiChecksumOk(lei: string): boolean {
  // Caller passes the upper-cased candidate, which LEI_RE has already pinned to
  // [0-9A-Z], so every char is a digit or A-Z here (the reference's defensive
  // "else return false" is unreachable under that guarantee and is omitted to
  // keep the line reachable/testable).
  let digits = "";
  for (const c of lei) {
    if (c >= "0" && c <= "9") digits += c;
    else digits += String(c.charCodeAt(0) - 65 + 10);
  }
  return BigInt(digits) % 97n === 1n;
}
function parseLei(text: string): Parsed | null {
  if (!LEI_RE.test(text)) return null;
  const upper = text.toUpperCase();
  if (upper.slice(4, 6) !== "00") return null;
  if (!leiChecksumOk(upper)) return null;
  return { type: "LEI", core: upper.slice(0, 18), alphabet: BASE36, prefix: null, suffix: upper.slice(18) };
}

// ---------------------------------------------------------------------------
// SWHID / gitoid (prefix-semantic: object-type binds the fingerprint).
// ---------------------------------------------------------------------------
const SWHID_RE = /^(swh:1:(?:snp|rel|rev|dir|cnt):)([0-9a-fA-F]{40})(?:;([\s\S]+))?$/;
function parseSwhid(text: string): Parsed | null {
  const m = text.match(SWHID_RE);
  if (!m) return null;
  // The ;<qualifiers> tail (m[3]) is a free annotation, dropped.
  return {
    type: "",
    core: m[2].toLowerCase(),
    alphabet: HEX,
    prefix: m[1].toLowerCase(),
    suffix: null,
    prefixSemantic: true,
  };
}

const GITOID_RE = /^(gitoid:(blob|tree|commit|tag):(sha1|sha256):)([0-9a-fA-F]+)$/i;
const GITOID_ALGO_LEN: Record<string, number> = { sha1: 40, sha256: 64 };
function parseGitoid(text: string): Parsed | null {
  const m = text.match(GITOID_RE);
  if (!m) return null;
  const algo = m[3].toLowerCase();
  const body = m[4].toLowerCase();
  if (body.length !== GITOID_ALGO_LEN[algo]) return null;
  return {
    type: "",
    core: body,
    alphabet: HEX,
    prefix: m[1].toLowerCase(),
    suffix: null,
    prefixSemantic: true,
  };
}

// ---------------------------------------------------------------------------
// Generic bech32 (BIP-173 / BIP-350 checksum-validated) + IPFS CID.
// ---------------------------------------------------------------------------
function bech32Polymod(values: number[]): number {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) chk ^= ((top >> i) & 1) ? gen[i] : 0;
  }
  return chk >>> 0;
}
function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}
function bech32ChecksumConst(hrp: string, data: string): number {
  const values: number[] = [];
  for (const c of data) values.push(BECH32_ALPHABET.indexOf(c));
  return bech32Polymod([...bech32HrpExpand(hrp), ...values]);
}
function parseBech32(text: string): Parsed | null {
  const m = text.match(BECH32_GENERIC_RE);
  if (!m) return null;
  const hrp = m[1].toLowerCase();
  const data = m[2].toLowerCase();
  const c = bech32ChecksumConst(hrp, data);
  if (c !== 1 && c !== 0x2bc830a3) return null;
  return { type: "bech32", core: data.slice(0, -6), alphabet: BECH32, prefix: `${hrp}1`, suffix: data.slice(-6) };
}

function parseIpfsCid(text: string): Parsed | null {
  let m = text.match(IPFS_CIDV0_RE);
  if (m) return { type: "CIDv0", core: m[2], alphabet: BASE58, prefix: m[1], suffix: null };
  m = text.match(IPFS_CIDV1_RE);
  if (m) {
    let label = "CIDv1";
    const bytes = b32NoPadDecode(m[2]);
    if (bytes) {
      const described = decodeMulticodec(bytes);
      if (described) {
        const [codecName, hashName] = described;
        label = `CIDv1 ${codecName}`;
        if (hashName !== "sha2-256") label += `/${hashName}`;
      }
    }
    return { type: label, core: m[2].toUpperCase(), alphabet: BASE32, prefix: m[1], suffix: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plain hex.
// ---------------------------------------------------------------------------
function parseHex(text: string): Parsed | null {
  if (!text) return null;
  let prefix: string | null = null;
  let body = text;
  if ((body.startsWith("0x") || body.startsWith("0X")) && body.length > 2) {
    prefix = "0x";
    body = body.slice(2);
  } else if (body.length % 2 !== 0) {
    return null;
  }
  if (!HEX_RE.test(body)) return null;
  return { type: "hex", core: body.toLowerCase(), alphabet: HEX, prefix, suffix: null };
}

// ---------------------------------------------------------------------------
// Disproof-based alphabet detection (last resort before the UTF-8 fallback).
// Most-restrictive (smallest char set) first; case-insensitive for hex/base32/
// bech32, case-sensitive for base58/base64/base64url.
// ---------------------------------------------------------------------------
const DISPROOF_ORDER: [Alphabet, Set<string>][] = [
  [HEX, new Set(HEX_ALPHABET.toLowerCase())],
  [BASE32, new Set(BASE32_ALPHABET.toLowerCase())],
  [BECH32, new Set(BECH32_ALPHABET.toLowerCase())],
  [BASE58, new Set(BASE58_ALPHABET)],
  [BASE64, new Set(BASE64_ALPHABET)],
  [BASE64URL, new Set(BASE64URL_ALPHABET)],
];
export function detectAlphabetByDisproof(text: string): Alphabet | null {
  if (!text) return null;
  const cs = text;
  const ci = text.toLowerCase();
  for (const [alphabet, charSet] of DISPROOF_ORDER) {
    const view = alphabet === BASE58 || alphabet === BASE64 || alphabet === BASE64URL ? cs : ci;
    if ([...view].every((c) => charSet.has(c))) return alphabet;
  }
  return null;
}

// Parser dispatch order — ORDER IS SEMANTICS (mirrors the reference's
// parse_funcs). A narrow/checksummed format must precede any broader one that
// would also accept the same input. parse_hex sits near the end; parseEos runs
// last (its alphabet is a superset of lowercase hex for short strings).
const PARSE_FUNCS: ((t: string) => Parsed | null)[] = [
  parseHexMultihash,
  parseCesr,
  parseSshKey,
  parseBitcoin,
  parseRipple,
  parseEthereum,
  parseLitecoin,
  parseBitcoinCash,
  parseCardano,
  parseStellar,
  parseUuid,
  parseUlid,
  parseSnowflake,
  parseLei,
  parseDid,
  parseUrn,
  parseSwhid,
  parseGitoid,
  parseBech32,
  parseIpfsCid,
  parseHex,
  parseEos,
];

export function parse(raw: string): Parsed | null {
  const entropy = raw.trim();
  for (const fn of PARSE_FUNCS) {
    const answer = fn(entropy);
    if (answer) return answer;
  }
  // No specific parser claimed it: try disproof-based alphabet detection
  // before falling back to UTF-8 → base64url.
  const detected = detectAlphabetByDisproof(entropy);
  if (detected !== null) {
    // Canonical case is PER ALPHABET: base32 -> upper (RFC 4648); bech32/hex ->
    // lower; everything else verbatim.
    let core: string;
    if (detected === BASE32) core = entropy.toUpperCase();
    else if (detected === BECH32 || detected === HEX) core = entropy.toLowerCase();
    else core = entropy;
    return { type: detected.name, core, alphabet: detected, prefix: null, suffix: null };
  }
  return null; // caller applies UTF-8 → base64url fallback
}

// ---------------------------------------------------------------------------
// User note sanitization (matches the spec error catalog)
// ---------------------------------------------------------------------------
// Printable ASCII only (U+0020 space through U+007E tilde), max 10 chars. ASCII
// closes the ENTIRE Unicode-spoofing surface by construction — no control chars,
// bidi overrides, zero-width or combining marks, homoglyphs/confusables — and the
// rule is trivially identical across implementations. The note is still
// XML-escaped on output (esc), so injection is handled regardless.
const NOTE_MAX_LEN = 10;
const NOTE_RE = /^[\x20-\x7E]{1,10}$/;
export function sanitizeNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined || note === "") return null;
  // Length first, then charset (matches the reference order / error catalog).
  if (note.length > NOTE_MAX_LEN) {
    throw new Error(
      `note must be at most ${NOTE_MAX_LEN} characters (got ${note.length})`,
    );
  }
  if (!NOTE_RE.test(note)) {
    throw new Error(
      `note must be printable ASCII (U+0020-U+007E); no control or non-ASCII characters (got ${JSON.stringify(note)})`,
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

export const BAND_LETTER: Record<string, string> = {
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
  prefixSemantic: boolean;
}

// Map a trimmed raw input to its (core, type label, alphabet, prefix, suffix)
// via the ported parsers, falling back to UTF-8 → base64url for anything no
// parser claims.
export function classifyInput(rawInput: string): ClassifiedInput {
  const parsed = parse(rawInput);
  if (parsed === null) {
    // SEC-F1: the >512-bit path IS supported (large-input handling); only
    // inputs past the anti-DoS cap are rejected. Cap on the cheap code-unit
    // length before allocating the base64url encoding, so a multi-megabyte
    // input can't materialize a ~1.33x base64 string first (a DoS amplifier).
    if (rawInput.length > MAX_INPUT_CHARS) {
      throw new Error(`input too large (>${MAX_INPUT_CHARS} characters)`);
    }
    return {
      core: bytesToBase64url(utf8Bytes(rawInput)),
      typeName: `txt(${rawInput.length})->b64url`,
      alphabet: BASE64URL,
      prefix: null,
      suffix: null,
      prefixSemantic: false,
    };
  }
  // Length-bearing labels for the variable-length plain-alphabet types
  // (hex / base64 / base64url). Rename base64* → b64* for consistency with the
  // txt->b64url fallback shortening (mirrors the reference pipeline).
  let typeName = parsed.type;
  if (typeName === "hex") typeName = `hex(${parsed.core.length})`;
  else if (typeName === "base64") typeName = `b64(${parsed.core.length})`;
  else if (typeName === "base64url") typeName = `b64url(${parsed.core.length})`;
  return {
    core: parsed.core,
    typeName,
    alphabet: parsed.alphabet,
    prefix: parsed.prefix,
    suffix: parsed.suffix,
    prefixSemantic: parsed.prefixSemantic ?? false,
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
// quartile-ftok cells — whose surround edge color is fingerprint-driven.
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

// v10 hybrid fingerprint blank fill: the j-th *colored* blank (in cell-index
// order) takes edge_palette[digest[32 + j] & 0b11]. The map blank is colored
// only when it is the sole blank; otherwise it keeps the white/gold anchor and
// is excluded here.
export function blankFillColors(
  blankIndices: number[],
  mapCellIdx: number | null,
  digest: Uint8Array,
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

// v10: in the sole-blank case the map fill is fingerprint-colored, so both
// markers take the luminance-contrast color against it (shape still carries
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
    // color against that fill. Max/min identity rides on SHAPE (plus vs dot),
    // not hue, so this costs only the redundant color cue.
    const { minColor, maxColor } = blankMapMarkerColors(soleBlank, blankFillColor.get(mapCellIdx as number));
    // minftok = blue dot (drawn first); maxftok = red plus (drawn on top, so it
    // stays visible where both land on one cell). The SHAPE carries the max/min
    // semantic so it survives total color blindness (PSY-F1); each marker's
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
  if (rawInput.length > MAX_INPUT_CHARS) {
    throw new Error(`input too large (>${MAX_INPUT_CHARS} characters)`);
  }
  const { core, typeName, alphabet, prefix, suffix, prefixSemantic } = classifyInput(rawInput);
  // v11 PREFIX-FOLD: the PRIMARY fingerprint hashes `prefix ‖ core` for a
  // semantic prefix (DID method / URN NID), else the bare core. The
  // fingerprint-MIDDLE digest (color-bar markers) stays over the bare `core`.
  const fpCore = fingerprintCore(core, prefix, prefixSemantic);

  // >512-bit inputs take the large-input path: the text channel shows head
  // (8 tokens) + fingerprint-middle (4 tokens) + tail (8 tokens) and sets
  // `truncated`; the whole input stays bound through the primary fingerprint.
  const { tokens, truncated } = tokenizeEntropy(core, alphabet);
  if (!tokens.length) throw new Error("No tokens produced from input entropy.");
  const tokenCount = tokens.length;

  const usedFtoks = tokenizeFingerprint(computeFingerprint(fpCore)).slice(0, tokenCount);
  // Large inputs always size the grid for the full token cap (22 → 4x6 = 24
  // cells at AR 1.0), so the 20 tokens always leave a few spare cells for the
  // fingerprint-driven blank shift — matching the reference (choose_grid(22)).
  const grid = chooseGrid(truncated ? MAX_TOKENS : tokenCount, targetAr);
  const medFtok = medianToken(usedFtoks) as Token;
  const quartFtoks = quartileTokens(usedFtoks);
  const style = selectVisualStyle(medFtok);
  const cellIndices = assignCellIndices(tokens, grid, medFtok, usedFtoks);

  // v6: on a truncated (>512-bit) input the 4 middle cells (token indices
  // 8..11) carry no input entropy — they render a Crockford readout of the
  // second fingerprint. Their nucleus is neutralised to the entviz background
  // and 1-px framed (gold on a white-bg entviz, else white), their text is
  // slightly larger (0.80x), and the cell is flagged data-cell-fingerprint.
  // Their surround stays primary-fingerprint-driven (still avalanches).
  const fpMiddleCells = new Set<number>();
  if (truncated) {
    for (let ti = HEAD_TOKENS; ti < HEAD_TOKENS + MIDDLE_TOKENS; ti++) {
      const ci = cellIndices.get(ti);
      if (ci !== undefined) fpMiddleCells.add(ci);
    }
  }
  const fpBorderColor = style.bgColor === "#ffffff" ? "#e7be00" : "#ffffff";
  const fpMiddleTextPx = (roundHalfEven(fontSizePt * 0.8) * DPI) / 72;

  // Geometry
  const hasBottom = Boolean(suffix) || Boolean(note);
  const geom = computeGeometry(fontSizePt, grid, hasBottom);
  const {
    fs, nucleusWidth, nucleusHeight, boxWidth, boxHeight, cellWidth, cellHeight,
    barWidth, gridW, gridH, boundingW, boundingH, gridLeft, gridTop,
  } = geom;
  const { cellTextPx, labelTextPx } = cellTextSizes(fontSizePt, alphabet);

  const digest = computeFingerprint(fpCore);
  const digestHex = bytesToHex(digest);
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
    .set("data-input-bytes", String(utf8ByteLength(rawInput)))
    .set("data-cols", grid.cols)
    .set("data-rows", grid.rows);
  // OMITTED when false (matches the render model: truncated defaults to false).
  if (truncated) svg.set("data-truncated", "true");

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
    // Middle cells are neutralised to the entviz bg; this nucleusBg feeds BOTH
    // the nucleus fill and the surround edge-color pick (mirrors the reference).
    const nucleusBg = fpMiddleCells.has(ci) ? style.bgColor : nucleusColors(token.quant)[0];
    tokenCells.push({ token, ftok: usedFtoks[token.index], ci, nx, ny, nucleusBg });
  }

  // Layer 1: edges.
  // v10: fingerprint-edge cells — the top-left cell (grid position 0) and the
  // cells of the 1st & 2nd quartile ftoks take their surround edge color from
  // the fingerprint (2 low-order ftok-quant bits → edge palette) instead of the
  // nearest-palette nucleus echo, so the surround color avalanches to a casual
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
    if (fpMiddleCells.has(ci)) g.set("data-cell-fingerprint", "true");
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
    const isMid = fpMiddleCells.has(tc.ci);
    // Middle cells take the neutral entviz-bg + a contrast fg derived from it
    // (same Oklab rule, applied to the bg color); entropy cells use the token.
    const [bg, fg] = isMid
      ? nucleusColors(
          parseInt(tc.nucleusBg.slice(1, 3), 16) |
            (parseInt(tc.nucleusBg.slice(3, 5), 16) << 8) |
            (parseInt(tc.nucleusBg.slice(5, 7), 16) << 16),
        )
      : nucleusColors(tc.token.quant);
    g.child("rect").set("x", tc.nx).set("y", tc.ny)
      .set("width", nucleusWidth).set("height", nucleusHeight).set("fill", bg);
    if (isMid) {
      // 1-px stroke flush with the nucleus boundary (gold on a white-bg entviz,
      // else white), painted between the nucleus fill and the text.
      g.child("rect").set("x", tc.nx + 0.5).set("y", tc.ny + 0.5)
        .set("width", nucleusWidth - 1).set("height", nucleusHeight - 1)
        .set("fill", "none").set("stroke", fpBorderColor).set("stroke-width", "1");
    }
    const t = g.child("text")
      .set("x", tc.nx + nucleusWidth / 2)
      .set("y", tc.ny + nucleusHeight / 2)
      .set("fill", fg)
      .set("font-size", isMid ? fpMiddleTextPx : cellTextPx)
      .set("text-anchor", "middle")
      .set("dominant-baseline", "central");
    t.text = tc.token.text;
  }

  // Layer 3b: blank cells + map.
  // v10 hybrid fingerprint blank fill: the map blank is fingerprint-filled only
  // when it is the sole blank (where the casual-avalanche color is needed),
  // else it keeps the white/gold anchor while its siblings carry the color.
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
  drawLabels(svg, gridLeft, gridTop + gridH, gridTop, gridLeft + gridW, nucleusHeight, typeName, prefix, suffix, labelTextPx, note, truncated);

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

export function twoBitUsage(digest: Uint8Array, edgeColors: string[]): Map<string, number> {
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
export function twoBitFirstAppearance(digest: Uint8Array, edgeColors: string[]): string[] {
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

export function drawColorBar(svg: El, digest: Uint8Array, edgeColors: string[], barWidth: number, boundingH: number, cellTextPx: number, secondDigest: Uint8Array) {
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

export function drawLabels(svg: El, gridLeft: number, gridBottom: number, gridTop: number, gridRight: number, nucleusHeight: number, typeName: string, prefix: string | null, suffix: string | null, textPx: number, note: string | null, truncated: boolean) {
  // font-family is inherited from the root <svg>; each label <text> carries
  // only a compact font-size presentation attribute.
  const topG = svg.child("g").set("data-channel", "label-top");
  let restText: string;
  if (typeName) restText = prefix ? `${typeName}: ${prefix}...` : `${typeName}:`;
  else restText = prefix ? `${prefix}...` : "";
  const topCy = gridTop - nucleusHeight / 2;
  const el = topG.child("text").set("x", gridLeft).set("y", topCy).set("fill", "#666666").set("font-size", textPx).set("dominant-baseline", "central");
  if (truncated) {
    // A >512-bit input's text channel is no longer lossless: a loud bold
    // dark-red "fingerprint of" marker precedes the standard #666 label. The
    // byte length is carried by the type parenthetical (e.g. hex(256)).
    el.child("tspan").set("fill", "#a00000").set("font-weight", "bold").text = "fingerprint of ";
    el.child("tspan").text = restText;
  } else {
    el.text = restText;
  }
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

export function drawEllipse(gridG: El, digest: Uint8Array, gridLeft: number, gridTop: number, gridW: number, gridH: number, cw: number, ch: number, grid: Grid, bgColor: string, clipId: string) {
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

// Structured channel readouts (comparisonText, describeChannels) — derived from
// the same render model, re-exported so they ship from the single @entviz/core
// entry point alongside render().
export * from "./describe.ts";

// Machine-comparison engines (compareValues, detectMedium, …) for <EntvizCompare>.
export * from "./compare.ts";

// The guided human walk (M2): check-plan builder + walk reducer.
export * from "./compare-walk.ts";
