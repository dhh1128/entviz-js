/**
 * Entropy characterization model (spec v13) + label projection (spec v15) — a
 * faithful TypeScript port of the Python reference `entviz/characterize.py`.
 *
 * The parser (`parse` in ./entviz.ts) produces a `Parsed` display record whose
 * `type` string fuses several orthogonal facts (scheme, semantic role, network/
 * variant, size). `characterize()` re-expresses that same recognition along
 * independent axes, so downstream consumers (labels, pills, dev APIs) read
 * structured fields instead of string-parsing the label.
 *
 * The characterization is REPORTING-ONLY. It changes no rendered pixel, no
 * fingerprint input, and no label string. The renderer emits the eight fields
 * onto the root <svg> as data-* attributes (see render() in ./entviz.ts), and
 * the conformance model extractor recovers them from THOSE attributes — so every
 * implementation, reference or port, is compared against its own
 * characterization rather than one recomputed in Python. The attributes add no
 * ink (the closed profile permits extra data-*), so the golden raster is
 * unaffected. See docs/spec.md -> "Entropy characterization".
 *
 * Axes (identical field set for every input):
 *  - encoding    — declared alphabet name (drives tokenization).
 *  - scheme      — recognizer/namespace that fired, or null for a bare encoding
 *                  / UTF-8 fallback.
 *  - role        — closed enum {key, signature, digest, address, identifier} or
 *                  null; asserted ONLY from the GENERIC recognizer (Wrinkle 3).
 *  - qualifiers  — independently-varying facets (network/variant/algorithm/
 *                  version/method/nid/...); {} when none.
 *  - sizeBasis   — "decoded" or "utf8"; SCHEME-driven, never inferred from
 *                  alphabet or content shape.
 *  - sizeBits    — value size in bits, always a multiple of 8, computed from the
 *                  CORE only (Resolution A). Reporting-only; NOT the >512-bit
 *                  truncation basis.
 *  - parts       — ordered [{text, bind}] with bind in {none, fold, core}.
 *  - entropyType — derived convenience = scheme ?? encoding.
 */
import { parse, BASE64URL, type Alphabet, type Parsed } from "./entviz.ts";
import { utf8ByteLength, bytesToBase64url, utf8Bytes } from "./bytes.ts";

// Closed role enum (spec v13). Nothing outside this set may appear.
export type Role = "key" | "signature" | "digest" | "address" | "identifier";
export type SizeBasis = "decoded" | "utf8";
export type Bind = "none" | "fold" | "core";

export interface Part {
  text: string;
  bind: Bind;
}

/**
 * The structured characterization of an entropy string (spec v13): the same
 * recognition the parser performs, re-expressed along independent axes so a
 * consumer reads typed fields instead of string-parsing the drawn label.
 * Reporting-only — it changes no rendered pixel, fingerprint input, or label.
 * Produced by {@link characterize}.
 */
export interface Characterization {
  /** Declared alphabet name that drives tokenization (e.g. `"hex"`,
   *  `"base58"`, `"base64url"`). Always present. */
  encoding: string;
  /** Recognizer / namespace that fired (e.g. `"did"`, `"btc"`, `"uuid"`,
   *  `"cesr"`), or `null` for a bare encoding or the UTF-8 fallback. */
  scheme: string | null;
  /** Semantic role from the closed enum {@link Role} (`key` | `signature` |
   *  `digest` | `address` | `identifier`), or `null` when unknown. Asserted
   *  only where the generic recognizer determines it. */
  role: Role | null;
  /** Independently-varying facets of the recognition (network / variant /
   *  algorithm / version / method / nid / …); `{}` when none apply. */
  qualifiers: Record<string, string | number>;
  /** How {@link sizeBits} is measured: `"decoded"` (bits of the decoded value)
   *  or `"utf8"` (bits of the core's UTF-8 bytes). Scheme-driven. */
  sizeBasis: SizeBasis;
  /** Value size in bits, always a multiple of 8, computed from the core only.
   *  Reporting-only; this is NOT the >512-bit truncation basis. */
  sizeBits: number;
  /** The value split into reading-order segments, each `{ text, bind }` with
   *  `bind` in {@link Bind} (`none` | `fold` | `core`) describing whether the
   *  segment binds the fingerprint. */
  parts: Part[];
  /** Convenience derivation: `scheme` when a recognizer fired, otherwise
   *  `encoding`. */
  entropyType: string;
}

// Non-power-of-2 alphabets whose true density is below the token-packing
// bitsPerChar convention. For these, sizeBits decodes the core as a big integer
// and takes its minimal byte length (Resolution A) — it MUST NOT use bitsPerChar
// (which overstates density: base58=6 vs true ~5.86, base36=6 vs ~5.17,
// decimal=4 vs ~3.32).
const INTEGER_DECODE_ALPHABETS = new Set(["base58", "base36", "decimal"]);

// Minimal byte length of `core` decoded as a big integer in its base. Used for
// the non-power-of-2 alphabets (base58/base36/decimal): decode the positional
// value and return ceil(bit_length / 8). Character lookup mirrors the
// tokenizer's case tolerance. An empty core (or a value of zero) is one byte,
// matching a single zero digit.
function decodedBytesInteger(core: string, alphabet: Alphabet): number {
  const chars = alphabet.chars;
  const lower = chars.toLowerCase();
  const base = BigInt(chars.length);
  let n = 0n;
  for (const c of core) {
    let v = chars.indexOf(c);
    if (v < 0) v = lower.indexOf(c.toLowerCase());
    if (v < 0) v = 0;
    n = n * base + BigInt(v);
  }
  if (n === 0n) return 1;
  return Math.floor((n.toString(2).length + 7) / 8);
}

// Value size in bits from the CORE only (Resolution A).
//
// `decoded` basis: power-of-2 alphabets take
// floor(len(core) * bitsPerChar / 8) * 8; the non-power-of-2 alphabets
// (base58/base36/decimal) decode the integer to its minimal byte length. This is
// approximate where the core is a base58check SUBSTRING (Resolution B).
//
// `utf8` basis: the core is inherently text (DID msi, URN NSS, UTF-8 fallback);
// sizeBits is len(core UTF-8 bytes) * 8.
function sizeBitsFor(core: string, alphabet: Alphabet, sizeBasis: SizeBasis): number {
  if (sizeBasis === "utf8") return utf8ByteLength(core) * 8;
  if (INTEGER_DECODE_ALPHABETS.has(alphabet.name)) {
    return decodedBytesInteger(core, alphabet) * 8;
  }
  return Math.floor((core.length * alphabet.bitsPerChar) / 8) * 8;
}

// CESR derivation-code role classification, keyed off the decoded primitive name
// the parser puts in `type` ("CESR <name>"). Seeds/keys -> key; digests
// (SAID/said hashes) -> digest; signatures -> signature.
const CESR_DIGEST_MARKERS = ["blake3", "blake2b", "blake2s", "sha3", "sha2", "sha"];

function cesrRole(name: string): Role {
  const low = name.toLowerCase();
  if (low.includes("sig")) return "signature";
  if (CESR_DIGEST_MARKERS.some((m) => low.includes(m))) return "digest";
  // seeds, public keys, ciphers, blinding factors, random numbers, tags ->
  // keying material.
  return "key";
}

interface Described {
  scheme: string | null;
  role: Role | null;
  qualifiers: Record<string, string | number>;
  sizeBasis: SizeBasis;
}

// Return {scheme, role, qualifiers, sizeBasis} for a Parsed record. sizeBasis is
// SCHEME-driven: did / urn / UTF-8-fallback are "utf8"; every recognized
// encoding scheme is "decoded".
//
// `role` is asserted ONLY where the GENERIC recognizer determines it (Wrinkle
// 3): did:/urn: fold an identity prefix -> identifier, NEVER the narrower
// per-method/namespace role (did:key is identifier, not key; did:pkh is
// identifier, not address; urn:isbn is identifier, not book).
function describeFromParsed(parsed: Parsed): Described {
  const typeName = parsed.type || "";
  const prefix = parsed.prefix;
  const q: Record<string, string | number> = {};

  // --- Folded identity prefixes: did / urn / gitoid / swhid ---
  if (prefix && parsed.prefixSemantic) {
    if (prefix.startsWith("did:")) {
      // Strip leading "did:" then trailing ":" -> the method.
      const method = prefix.slice("did:".length).replace(/:+$/, "");
      q.method = method;
      // Recover an independently-varying network segment for the handful of
      // methods that carry one at the head of the msi (did:ethr:<net>:<addr>).
      // Label-only recovery, not per-method decoding: role stays "identifier".
      if (method === "ethr") {
        q.network = parsed.core.split(":", 1)[0];
      }
      return { scheme: "did", role: "identifier", qualifiers: q, sizeBasis: "utf8" };
    }
    if (prefix.startsWith("urn:")) {
      q.nid = prefix.slice("urn:".length).replace(/:+$/, "");
      return { scheme: "urn", role: "identifier", qualifiers: q, sizeBasis: "utf8" };
    }
    if (prefix.startsWith("gitoid:")) {
      // gitoid:<object>:<algo>:
      const segs = prefix.replace(/^:+|:+$/g, "").split(":");
      if (segs.length >= 3) {
        q.object = segs[1];
        q.algorithm = segs[2];
      }
      return { scheme: "gitoid", role: "digest", qualifiers: q, sizeBasis: "decoded" };
    }
    if (prefix.startsWith("swh:")) {
      // swh:1:<type>:
      const segs = prefix.replace(/^:+|:+$/g, "").split(":");
      if (segs.length >= 3) q.object = segs[2];
      q.algorithm = "sha1";
      return { scheme: "swhid", role: "digest", qualifiers: q, sizeBasis: "decoded" };
    }
  }

  // --- CESR primitives: "CESR <decoded-name>" ---
  if (typeName.startsWith("CESR ")) {
    const name = typeName.slice("CESR ".length);
    q.algorithm = name;
    return { scheme: "cesr", role: cesrRole(name), qualifiers: q, sizeBasis: "decoded" };
  }

  // --- SSH public keys: "SSH <algorithm>" or "SSH key" ---
  if (typeName.startsWith("SSH")) {
    const rest = typeName.slice("SSH".length).trim();
    if (rest && rest !== "key") q.algorithm = rest;
    return { scheme: "ssh", role: "key", qualifiers: q, sizeBasis: "decoded" };
  }

  // --- Blockchain addresses ---
  if (typeName.startsWith("BTC")) {
    q.network = "mainnet";
    const low = typeName.toLowerCase();
    if (low.includes("legacy")) q.variant = "legacy";
    else if (low.includes("segwit")) q.variant = "segwit";
    return { scheme: "btc", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName === "BCH") {
    // bitcoincash: HRP present -> mainnet; bchtest: -> testnet.
    q.network = (prefix ?? "").toLowerCase().startsWith("bchtest") ? "testnet" : "mainnet";
    return { scheme: "bch", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName.startsWith("LTC")) {
    q.network = "mainnet";
    if (typeName.toLowerCase().includes("legacy")) q.variant = "legacy";
    return { scheme: "ltc", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName.startsWith("ADA")) {
    if (typeName.includes("Byron")) q.variant = "byron";
    else if (typeName.includes("Shelley")) q.variant = "shelley";
    return { scheme: "ada", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName === "ETH") {
    return { scheme: "eth", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName.startsWith("XLM")) {
    if (typeName.includes("muxed")) q.variant = "muxed";
    return { scheme: "stellar", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName === "XRP") {
    return { scheme: "xrp", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName === "EOS") {
    return { scheme: "eos", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }
  if (typeName === "bech32") {
    // Generic checksum-valid bech32; the HRP (before the '1') names the chain, an
    // independently-varying facet.
    if (prefix && prefix.endsWith("1")) q.hrp = prefix.slice(0, -1);
    return { scheme: "bech32", role: "address", qualifiers: q, sizeBasis: "decoded" };
  }

  // --- Content identifiers (IPFS CID) ---
  if (typeName.startsWith("CIDv")) {
    if (typeName.startsWith("CIDv0")) {
      q.version = 0;
      q.codec = "dag-pb";
      q.hash = "sha2-256";
    } else {
      q.version = 1;
      const rest = typeName.slice("CIDv1".length).trim();
      if (rest) {
        if (rest.includes("/")) {
          const slash = rest.indexOf("/");
          q.codec = rest.slice(0, slash);
          q.hash = rest.slice(slash + 1);
        } else {
          q.codec = rest;
          q.hash = "sha2-256";
        }
      }
    }
    return { scheme: "cid", role: "identifier", qualifiers: q, sizeBasis: "decoded" };
  }

  // --- Structured identifiers ---
  if (typeName === "UUID") return { scheme: "uuid", role: "identifier", qualifiers: q, sizeBasis: "decoded" };
  if (typeName === "ULID") return { scheme: "ulid", role: "identifier", qualifiers: q, sizeBasis: "decoded" };
  if (typeName === "LEI") return { scheme: "lei", role: "identifier", qualifiers: q, sizeBasis: "decoded" };
  if (typeName === "snowflake") return { scheme: "snowflake", role: "identifier", qualifiers: q, sizeBasis: "decoded" };
  if (typeName.startsWith("multihash") || typeName.includes("multihash")) {
    return { scheme: "multihash", role: "digest", qualifiers: q, sizeBasis: "decoded" };
  }

  // --- Bare encodings (hex / base64 / base64url / disproof fallbacks) ---
  // No recognizer fired beyond the alphabet; scheme is null, role unknown.
  return { scheme: null, role: null, qualifiers: q, sizeBasis: "decoded" };
}

// Reading-order [{text, bind}] parts (Wrinkle 4).
//  - A folded identity prefix (did:/urn:/gitoid:/swh: scheme, prefixSemantic) ->
//    bind="fold".
//  - Any other shown prefix (presentation framing: 0x, Qm, b, G, 1, HRP, SSH
//    structural bytes, bech32 <hrp>1) -> bind="none".
//  - The core (incl. in-core discriminators like a CESR code) -> bind="core".
//  - A shown suffix (base58check/LEI checksum) -> bind="none".
function partsFromParsed(parsed: Parsed): Part[] {
  const parts: Part[] = [];
  if (parsed.prefix) {
    parts.push({ text: parsed.prefix, bind: parsed.prefixSemantic ? "fold" : "none" });
  }
  parts.push({ text: parsed.core, bind: "core" });
  if (parsed.suffix) parts.push({ text: parsed.suffix, bind: "none" });
  return parts;
}

// ---------------------------------------------------------------------------
// Label projection (spec v15).
//
// The visible top/bottom label strips are a PURE PROJECTION of the eight
// characterization fields through one grammar — no per-parser string fusing.
// Every implementation renders the same strips by running this same function
// over the shared fields. Faithful port of Python's render_label in
// entviz/characterize.py. See docs/spec.md -> "Label strips" and
// reviews/v14-label-redesign.md.
//
//   top    = [+hash ]PRIMARY[, MOD]...[, SIZE][, PREFIX]
//   bottom = ...<suffix>[ (<note>)]
//
// Slot separator is ", " (comma-space); no trailing ':' or '...'.
// ---------------------------------------------------------------------------

// v15: large-input truncation marker. Prepended (bold dark-red, by the renderer)
// to the top label when the text channel is a head/fingerprint-middle/tail
// readout rather than a linear scan. Reads as "the value, augmented with a hash
// of the parts that didn't fit" — the leading "+" is additive, not substitutive.
// Replaces v14's "fingerprint of ". Kept in sync with drawLabels in entviz.ts
// (which splits on it to style the marker tspan) by re-exporting this constant.
export const TRUNC_MARKER = "+hash ";

// ASCII elision marker for a truncated prefix slot (matches the bottom strip's
// "...<suffix>" convention; no Unicode ellipsis, so the printable-ASCII / unicode
// guard is satisfied and cross-implementation font behavior is uniform).
const PREFIX_ELLIPSIS = "...";

// Minimum number of LEADING prefix characters kept when the prefix is truncated.
// The label-line budget can leave a big prefix (only SSH's ~24-52 char structural
// header is ever this long) almost no room; without a floor it would collapse to
// a bare "..." that shows nothing. Keeping a few head chars honors "show the
// first few characters, then an ellipsis".
const PREFIX_MIN_HEAD = 4;

// The literal front prefix that was stripped from the visualized core, or null.
// This is a leading bind="none" part — a presentation sigil peeled off the front
// (0x, bc1, cosmos1, Stellar G, the SSH structural header, …). A folded identity
// prefix (bind="fold": did/urn/gitoid/swhid) is NOT returned — it is already
// shown verbatim as the PRIMARY slot. A bind="core" leading part (e.g. a CESR
// derivation code, in the first cell) is likewise not a stripped prefix.
function strippedPrefix(ch: Characterization): string | null {
  const parts = ch.parts || [];
  if (parts.length > 0 && parts[0].bind === "none") return parts[0].text;
  return null;
}

// Truncate the literal prefix slot to `avail` characters with a trailing "..."
// elision marker. The prefix is the sole ELASTIC label element (v15):
// PRIMARY/MOD/SIZE are never truncated. When the prefix does not fit it is cut to
// <head> + "..."; the head length is floored at PREFIX_MIN_HEAD so a long prefix
// on a tight line still shows a few leading characters rather than a bare "...".
function fitPrefix(prefix: string, avail: number): string {
  if (prefix.length <= avail) return prefix;
  const keep = Math.max(avail - PREFIX_ELLIPSIS.length, PREFIX_MIN_HEAD);
  return prefix.slice(0, keep) + PREFIX_ELLIPSIS;
}

// Bare-encoding display shortenings for the PRIMARY slot when scheme is null and
// the basis is decoded (the encoding name IS the primary). Mirrors the pre-v14
// pipeline renaming base64->b64, base64url->b64url; the other alphabet names
// (hex, base32, base58, bech32, crockford32, decimal) show verbatim.
const ENCODING_PRIMARY: Record<string, string> = {
  base64: "b64",
  base64url: "b64url",
};

// scheme -> visible PRIMARY short-name for the non-self-describing schemes. The
// characterization `scheme` field is lowercase (btc/eth/...); the label uses the
// conventional display casing (BTC/ETH/UUID/...). CID is special-cased (CIDv0 /
// CIDv1 from qualifiers.version); the self-describing prefix schemes
// (did/urn/gitoid/swhid) reconstruct their prefix from qualifiers and never
// reach this map.
const SCHEME_PRIMARY: Record<string, string> = {
  eth: "ETH",
  btc: "BTC",
  ltc: "LTC",
  bch: "BCH",
  ada: "ADA",
  xrp: "XRP",
  stellar: "XLM",
  eos: "EOS",
  uuid: "UUID",
  ulid: "ULID",
  lei: "LEI",
  snowflake: "snowflake",
  ssh: "SSH",
  cesr: "CESR",
  bech32: "bech32",
  multihash: "multihash",
};

// Blockchain schemes whose network qualifier, when it departs from mainnet,
// surfaces as a MOD (testnet loud; mainnet silent). The legacy/segwit `variant`
// is DROPPED entirely (v14).
const BLOCKCHAIN_SCHEMES = new Set([
  "btc", "ltc", "bch", "ada", "eth", "xrp", "stellar", "eos", "bech32",
]);

// The PRIMARY slot: the always-present head of the top label.
function labelPrimary(ch: Characterization): string {
  const scheme = ch.scheme;
  const q = ch.qualifiers;
  if (scheme === null) {
    // Bare encoding or UTF-8 fallback.
    if (ch.sizeBasis === "utf8") return "text";
    const enc = ch.encoding;
    return ENCODING_PRIMARY[enc] ?? enc;
  }
  if (scheme === "did") return `did:${q.method}`;
  if (scheme === "urn") return `urn:${q.nid}`;
  if (scheme === "gitoid") return `gitoid:${q.object ?? ""}:${q.algorithm ?? ""}`;
  if (scheme === "swhid") return `swh:1:${q.object ?? ""}`;
  if (scheme === "cid") return q.version === 0 ? "CIDv0" : "CIDv1";
  return SCHEME_PRIMARY[scheme] ?? scheme;
}

// The MOD slots (zero or more): silent-default / loud-departure facets.
function labelMods(ch: Characterization): string[] {
  const scheme = ch.scheme;
  const q = ch.qualifiers;
  const mods: string[] = [];
  if (scheme === "cesr") {
    // The primitive with the redundant role word dropped: strip a trailing
    // " pubkey" (role=key/digest is implied by the primitive).
    let algo = String(q.algorithm ?? "");
    if (algo.endsWith(" pubkey")) algo = algo.slice(0, -" pubkey".length);
    if (algo) mods.push(algo);
  } else if (scheme === "ssh") {
    const algo = q.algorithm;
    if (algo) {
      // v15: shorten the ECDSA curve to its common short name for the label —
      // "ecdsa-nistp256" -> "ecdsa-p256" (there is no rival non-NIST "p256"; only
      // the redundant standards-body prefix drops). The data-qualifiers
      // `algorithm` field keeps the faithful SSH curve id ("ecdsa-nistp256").
      mods.push(String(algo).replace("nistp", "p"));
    }
  } else if (scheme === "cid") {
    // CIDv0 is dag-pb/sha2-256 by definition -> no MOD. CIDv1: codec always,
    // hash only on departure from sha2-256.
    if (q.version !== 0) {
      const codec = q.codec;
      if (codec) mods.push(String(codec));
      const hashName = q.hash;
      if (hashName && hashName !== "sha2-256") mods.push(String(hashName));
    }
  } else if (scheme === "multihash") {
    const hashName = q.hash;
    if (hashName && hashName !== "sha2-256") mods.push(String(hashName));
  } else if (BLOCKCHAIN_SCHEMES.has(scheme)) {
    // Network only on departure (testnet); mainnet silent. Variant dropped.
    const network = q.network;
    if (network && network !== "mainnet") mods.push(String(network));
  }
  return mods;
}

// The SIZE slot (zero or one), or null when omitted.
function labelSize(ch: Characterization): string | null {
  const scheme = ch.scheme;
  const sizeBits = ch.sizeBits;
  if (scheme === null) {
    if (ch.sizeBasis === "utf8") return `${Math.floor(sizeBits / 8)}-byte`;
    return `${sizeBits}-bit`;
  }
  if (scheme === "ssh" || scheme === "multihash") return `${sizeBits}-bit`;
  return null;
}

/**
 * Project a characterization into the (top, bottom) label strips (v15).
 *
 * Pure function of the eight characterization fields (plus the presentation
 * facts the fields don't carry: whether the input was >512-bit `truncated`, the
 * bound `suffix` checksum, the out-of-band user `note`, and the monospace
 * `lineChars` budget the grid leaves for the top strip — used only to truncate
 * the elastic prefix slot; `null` = do not truncate).
 *
 *  - top    = `[+hash ]PRIMARY[, MOD]...[, SIZE][, <prefix>]` — ", " joined, no
 *    trailing `:`. The `+hash ` marker is reflected here so a text-only consumer
 *    still sees it (the renderer styles it as a bold-red tspan). The trailing
 *    `<prefix>` slot (v15) echoes a front prefix stripped from the visualized
 *    core (a bind="none" leading part); it is the only slot that may be truncated
 *    (to `lineChars`) and may then end in `...`. Fold-prefix schemes
 *    (did/urn/gitoid/swhid) show their prefix as PRIMARY and get no extra slot.
 *  - bottom = `...<suffix>` then ` (<note>)` — the bound (now-verified) checksum
 *    and the user caption. Empty string when neither is present.
 *
 * Returns plain strings; the renderer maps top/bottom onto the SVG label strips.
 */
export function renderLabel(
  ch: Characterization,
  truncated = false,
  suffix: string | null = null,
  note: string | null = null,
  lineChars: number | null = null,
): { top: string; bottom: string } {
  const slots = [labelPrimary(ch), ...labelMods(ch)];
  const size = labelSize(ch);
  if (size !== null) slots.push(size);

  let prefix = strippedPrefix(ch);
  if (prefix) {
    if (lineChars !== null) {
      // Budget left for the prefix = the line budget minus the marker and the
      // fixed PRIMARY/MOD/SIZE core (which never truncate) and the ", " that
      // joins the prefix slot.
      const markerLen = truncated ? TRUNC_MARKER.length : 0;
      const coreLen = slots.join(", ").length;
      const avail = lineChars - markerLen - coreLen - ", ".length;
      prefix = fitPrefix(prefix, avail);
    }
    slots.push(prefix);
  }

  let top = slots.join(", ");
  if (truncated) top = TRUNC_MARKER + top;

  let bottom = "";
  if (suffix) bottom = `...${suffix}`;
  if (note) bottom = bottom ? `${bottom} (${note})` : `(${note})`;
  return { top, bottom };
}

/**
 * Characterize an entropy string into the structured model (spec v13).
 *
 * Returns a plain object with keys: encoding, scheme, role, qualifiers,
 * sizeBasis, sizeBits, parts, entropyType. Never throws for an in-range input:
 * an unrecognized input falls back to the UTF-8 -> base64url path (scheme=null,
 * role=null, sizeBasis="utf8", size measured over the ORIGINAL input bytes).
 */
export function characterize(entropy: string): Characterization {
  const raw = entropy.trim();
  const parsed = parse(raw);

  if (parsed === null) {
    // UTF-8 fallback: the value IS the text; size over the original input.
    const core = bytesToBase64url(utf8Bytes(raw));
    return {
      encoding: BASE64URL.name,
      scheme: null,
      role: null,
      qualifiers: {},
      sizeBasis: "utf8",
      sizeBits: utf8ByteLength(raw) * 8,
      parts: [{ text: core, bind: "core" }],
      entropyType: BASE64URL.name,
    };
  }

  const { scheme, role, qualifiers, sizeBasis } = describeFromParsed(parsed);
  const sizeBits = sizeBitsFor(parsed.core, parsed.alphabet, sizeBasis);
  const encoding = parsed.alphabet.name;
  return {
    encoding,
    scheme,
    role,
    qualifiers,
    sizeBasis,
    sizeBits,
    parts: partsFromParsed(parsed),
    entropyType: scheme !== null ? scheme : encoding,
  };
}

// Compact JSON exactly matching Python's json.dumps(..., separators=(",",":"),
// ensure_ascii=False) — no spaces, non-ASCII passed through. The El.set escaper
// XML-escapes the result on the way onto the attribute.
export function compactJson(value: unknown): string {
  return JSON.stringify(value);
}
