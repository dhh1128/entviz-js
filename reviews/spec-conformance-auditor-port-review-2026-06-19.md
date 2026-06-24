# Spec-Conformance & Determinism Review: entviz-js

**Date:** 2026-06-19
**Effort level:** deep
**Conformance frame:** code `SPEC_VERSION = "v10"` (packages/core/src/entviz.ts:15)
matches `docs/spec.md` header (**Version: 10**) in the entviz reference repo;
`LIB_VERSION = "0.10.0"` matches `packages/core/package.json` version. A golden
corpus exists in the reference repo (`compliance/corpus/`, 53 vectors), and a
Tier A+B checker (`compliance/runner.py`) runs against the JS CLI via
`--impl-cmd`. The port is a deliberate **subset** implementation: only hex, UUID
(dashed/undashed), and the UTF-8→base64url fallback parsers, plus note and
font-size error handling, are ported. The remaining parsers and the >512-bit
large-input branch are explicitly out of scope per `README.md` and
`CERTIFICATION.md`.
**Implementation commit:** 81a55ea5d78de25fcdc12a69d540748dc01fe496
**Context sources used:** `docs/spec.md` (full, both repos), the entviz-js core
(`packages/core/src/entviz.ts`, `cli.ts`), the React wrapper, the Python
reference (`src/entviz/{pipeline,layout,colors,fingerprint,entropy}.py`), the
shared conformance runner. **The renderer was run**: cross-process determinism
diff (identical), the full conformance runner against all 53 corpus vectors, the
24 ported vectors run in isolation (24/24 Tier A+B pass), bit-extension /
grid-selection / round-half-even unit probes, and a JS-vs-Python render-model
diff on four hand-picked inputs beyond the corpus (all MODEL_MATCH).

---

## Evidence Inventory

- **Determinism — confirmed (single-process and cross-process).** Two `render()`
  calls in one process and two separate `node` invocations of `cli.ts` on the
  same input produced byte-identical SVG. A grep of `entviz.ts`/`Entviz.tsx` for
  `Date|Math.random|toLocale|Intl|process.env|performance|hash()`-equivalents
  returned nothing. JS `Map`/`Set` iteration is insertion-ordered by spec, and
  every iteration site (`chooseGrid`'s `tightest` map, `assignCellIndices`,
  `twoBitFirstAppearance`, color-bar sort) is fed in a fixed scan order matching
  the Python reference. No nondeterminism leak found.
- **Crypto / fingerprint — confirmed correct.** `computeFingerprint` is
  SHA-512 over the **UTF-8 bytes of the normalized core text** (not decoded
  bytes); `fingerprintMiddleDigest` uses the exact domain tag
  `"entviz/fingerprint-middle/v6\0"` with the trailing NUL (latin1-encoded, so
  the bytes are literal). `tokenizeFingerprint` produces exactly 22 ftoks. The
  bit-extension worked examples all reproduce (`0x5→0x555555`, `0xAB→0xABABAB`,
  `0xABC→0xABCABC`). The second digest correctly drives both color-bar markers.
- **Spec MUST-conformance — confirmed for the ported surface.** Oklab L
  threshold is `0.6`; weighted RGB distance is `sqrt(2Δr²+4Δg²+3Δb²)`; grid
  selection returns 3×4 for 11 tokens and 2×2 minimum; round-half-even matches
  Python's banker's rounding. The 24 ported corpus vectors pass Tier A (render
  model) **and** Tier B (canonical raster) — so the surround pattern, nucleus
  colors, edge colors, fingerprint-edge cells, blank-map, quartile marks, color
  bar (incl. v9 first-appearance band order + markers), ellipse, and v10 blank
  fills are all proven byte-equivalent to the reference for those inputs.
- **Error conditions — partially confirmed.** Font-size out of `[6,30]` and
  note violations are rejected correctly (Tier confirms the 5 error vectors).
  The EIP-55 reject is **not** enforced (see F1).
- **Skipped / out of scope:** the unported parsers and the large-input branch
  (no code to audit); Tier C (browser); the React component's runtime behavior
  beyond static review of its inner-HTML injection of the rendered SVG.

---

## Executive Summary

For the surface it claims, this is a faithful, deterministic port: I am highly
confident a third implementation following the same spec would agree with it on
every ported input, and the conformance corpus proves it field-for-field and
pixel-for-pixel on 24 vectors. The fingerprint construction, domain tag,
bit-extension, and all the v9/v10 channel changes are reproduced exactly, with
no nondeterminism leak. The single most consequential gap is not a wrong
computation but a **silent acceptance of an input the spec says MUST be
rejected**: a mixed-case Ethereum address that fails its EIP-55 checksum is not
recognized by any ported parser, so it falls through to the UTF-8→base64url
fallback and renders a (wrong) entviz instead of erroring — meaning a corrupted
address and the legitimate one can both produce plausible, *different*-looking
entvizes rather than the corrupted one being refused. This is documented as
out-of-scope in `CERTIFICATION.md`, but it is the one scope gap that changes
*output* rather than merely *coverage*, so the most urgent action is to either
port the EIP-55 reject or have the fallback refuse `0x`-prefixed mixed-case hex.

---

## Top Findings
Ordered by bang-for-buck.

### F1: A bad-EIP-55 Ethereum address is silently rendered (via the UTF-8 fallback) instead of rejected
- **Class:** CODE (with a CRYPTO/security dimension)
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:298-315` (`parse` returns null for
  `0x…`), `:422-441` (`classifyInput` fallback); `docs/spec.md` §Error
  conditions ("a mixed-case Ethereum (EIP-55) address whose case pattern fails
  the EIP-55 checksum … MUST reject"); corpus vector `err-eip55-bad-checksum`.
- **Finding:** The spec names EIP-55 checksum failure as a normative
  MUST-reject. No ported parser claims `0x…`, so `parse()` returns null and
  `classifyInput()` routes the address into the UTF-8→base64url fallback,
  emitting an SVG. The runner reports `expected rejection (eip55-checksum), got
  an SVG`. Beyond failing to reject, the fallback hashes the *raw* string
  (including the `0x` prefix and the input's exact mixed-case pattern) as opaque
  text, so two different mixed-case spellings of the same 20 bytes — one valid,
  one corrupted — render as two different, individually-plausible entvizes. The
  fail-safe the spec intends (refuse the corrupted address) is replaced by a
  silent, wrong visualization.
- **Evidence / example:** input `0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed`
  (the corpus's bad-checksum vector): `parse()` → `null`; `render()` returns a
  22,713-byte SVG with no error. Confirmed via the conformance runner
  (`FAIL [error] err-eip55-bad-checksum`).
- **Recommended action:** Fix in code. Cheapest compensating control short of
  porting the whole EIP-55 parser: in the fallback (or a guard ahead of it),
  detect a `0x`-prefixed mixed-case 40-hex string and reject it (the spec
  requires naming the first mismatched-case digit). Until then,
  `CERTIFICATION.md` already discloses this, so it is a known limitation, not a
  hidden one — but it is the one unported case that yields *wrong rendered
  output* rather than a missing feature, which is why it ranks above the other
  scope gaps. No blast radius on already-rendered entvizes (no ported input
  changes).

### F2: `data-entviz-lib` has two sources of truth with no drift guard
- **Class:** CODE (conformance / maintainability)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:16` (`LIB_VERSION = "0.10.0"`) vs
  `packages/core/package.json` `"version": "0.10.0"`; `docs/spec.md` §SVG
  profile (`data-entviz-lib` REQUIRED).
- **Finding:** The library-version stamp emitted as `data-entviz-lib` is a
  hardcoded string constant, independent of the package's published `version`.
  No test asserts they agree (`render.test.ts` only checks
  `data-entviz-version` against `SPEC_VERSION`). A future `npm version` bump
  that forgets to edit the constant will publish a package whose SVGs stamp the
  *previous* library version — a silent conformance-metadata drift. The spec's
  intent ("does a corpus/figure check fail when they drift?") is met for the
  spec version but not the lib version.
- **Evidence / example:** `grep version packages/core/src/entviz.ts` shows the
  literal; the only version test is `render.test.ts:14` and it covers
  `SPEC_VERSION` only.
- **Recommended action:** Fix in code/test. Either derive `LIB_VERSION` from
  `package.json` at module load (read `../package.json`) or add a unit test that
  asserts `LIB_VERSION === <package.json version>`. Small effort, removes a
  whole class of silent-drift bug.

### F3: Unported render vectors throw an opaque generic error, conflated with a spec-mandated rejection
- **Class:** CODE
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:656-658` (`byteLen > 64` →
  `throw new Error("large-input … not yet ported")`); also the implicit reject
  of any non-hex/UUID format via the fallback.
- **Finding:** A >512-bit input (`hex-1024`, `b64-large`) throws a generic
  error, which the CLI maps to exit-non-zero — indistinguishable, to the
  checker, from a *spec-mandated* rejection. For these two vectors the spec
  expects a *render*, not a reject, so the runner correctly flags them as
  failures ("render raised"). This is harmless today (they are out of scope and
  the runner is scoped with `--only`), but it means "the impl rejected this" no
  longer reliably signals "the spec says reject this." If a future caller treats
  any non-zero exit as a valid rejection, an unported-but-renderable input would
  be mistaken for an intentionally-refused one.
- **Evidence / example:** runner output `render raised: RuntimeError
  ('implementation rejected a render vector')` for `hex-1024`, `b64-large`,
  `gitoid-blob-sha256`, `ssh-ed25519`.
- **Recommended action:** Document (already partly done in `CERTIFICATION.md`).
  Optionally distinguish "unsupported format" from "spec rejection" with a typed
  error so downstream tooling can tell a TODO from an enforced error condition.
  Low priority; purely a clarity/forward-compat concern.

### F4: SVG coordinates emitted via `String(x)` can use exponential notation
- **Class:** SPEC (under-specification) / DETERMINISM-adjacent
- **Severity:** LOW
- **Confidence:** LIKELY
- **Location:** `packages/core/src/entviz.ts:344-348` (`n(x) = String(x)`).
- **Finding:** Numbers are serialized with `String()`, which yields exponential
  notation for magnitudes ≤ 1e-6 (`String(1e-7) === "1e-7"`). SVG accepts
  scientific notation, so this is not a hard break, and current geometry never
  reaches that magnitude (smallest value is `stroke-width = cell_height/20 ≈
  1.0` even at 6 pt). But the spec's equivalence relation says formatting that
  "denotes the same value" is ignorable — it does **not** pin a canonical
  numeric format, so two conformant impls could legitimately emit `1e-7` vs
  `0.0000001` and a naive string-diff checker would call them divergent. The
  reference uses Python `str(float)` which also differs from JS for some values.
  Tier A/B both normalize through value comparison, so the corpus is unaffected;
  this is a latent cross-impl landmine for any *textual* SVG comparison.
- **Evidence / example:** `String(1e-7)` → `"1e-7"`; `String(0.1+0.2)` →
  `"0.30000000000000004"` (matches Python repr, so not a divergence there).
- **Recommended action:** Fix in spec (add a canonical numeric-serialization
  rule to the equivalence relation, or explicitly bless scientific notation) and
  optionally clamp/format coordinates in code (`Number(x.toFixed(6))`-style) for
  belt-and-suspenders. No corpus impact.

### F5: `data-input-bytes` is emitted but not enumerated in the spec's SVG profile
- **Class:** SPEC (under-specification)
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:693`; `docs/spec.md` §SVG profile;
  the reference also emits it (`src/entviz/pipeline.py`) and the checker reads it
  (`compliance/model.py` → `input_bytes`).
- **Finding:** The render model's "normalized byte length of the input" is
  carried in `data-input-bytes`, which both impls emit and the Tier-A checker
  consumes — yet the spec's SVG-profile bullet list never names this attribute
  (it lists `data-entviz-version`, `-lib`, `-cols`, `-rows`, the per-cell and
  color-bar and ellipse attrs, `data-truncated`, `data-user-note`, but not
  `data-input-bytes`). A clean third implementation reading only the profile
  list would omit it and fail Tier A for a reason the normative text does not
  state. (entviz-js gets it right only because it followed the reference, not
  the spec.)
- **Evidence / example:** the attribute is required by `extract_model`'s
  `input_bytes` field but absent from §SVG profile's enumerated set.
- **Recommended action:** Fix in spec (add `data-input-bytes` to the SVG-profile
  attribute list, mapping it to the render model's "input metadata: normalized
  byte length"). Document fix in the reference repo's `docs/spec.md`; no code
  change in entviz-js.

---

## Additional Patterns Noted

- **`esc()` does not escape `'`** (`entviz.ts:349-355`). Safe today because all
  attributes are double-quoted and text content never contains a bare `'` in a
  context where it matters, but if any attribute serialization ever switches to
  single quotes this becomes an injection vector. Low risk; note for the
  security lens.
- **React inner-HTML injection of the rendered SVG** (`Entviz.tsx`) is sound:
  the SVG is produced entirely by the escaping renderer, the user note is
  sanitized to `[A-Za-z0-9]{1,8}`, and token text derives only from
  hex/base64url alphabets or a base64url re-encoding of arbitrary input — no
  caller markup reaches the DOM. No XSS path found.
- **`decodedByteLength` uses `floor`, the spec says "decode … under its declared
  alphabet."** For hex (`len*4/8`) and base64url (`len*6/8`) `floor` matches the
  reference and the >512-bit threshold is checked correctly; this only matters
  on the (unported) large-input boundary, so it is currently untestable here but
  worth a golden test when the large-input branch lands.
- **No determinism test across alphabets in the JS suite** — `render.test.ts`
  asserts determinism on one input. The cross-process check I ran passed, but a
  permanent test that renders the same input twice and asserts byte-equality
  (already present) plus one that diffs against a committed golden SVG would
  lock it in. Hand to the testability lens.

---

## Under-Specification Ledger

These are spec-document gaps (fix the reference repo's `docs/spec.md`), surfaced
by porting — each is a place a second implementation could legitimately diverge
and the equivalence relation does not list it as ignorable:

1. **No canonical numeric-serialization rule** (F4). The equivalence relation
   forgives `60` vs `60.0` but never states a canonical format, leaving
   exponential-vs-fixed and trailing-digit choices open. A purely-textual SVG
   comparator would flag conformant impls as divergent.
2. **`data-input-bytes` is required-in-practice but unlisted** (F5). The SVG
   profile's enumerated attribute set omits an attribute the Tier-A checker
   depends on.
3. **The EIP-55 rejection's error-channel surface for the fallback** (related to
   F1). The spec mandates rejecting bad EIP-55 *and* naming the first mismatched
   digit, but does not say what a *partial* implementation (no eth parser)
   should do with a `0x`-mixed-case input — the spec implicitly assumes every
   conformant impl ports every format. A note that "an implementation that does
   not support a format MUST still reject inputs that format's rules require
   rejecting, or decline the input" would close the gap.

---

## Residual Unknowns

- **Cross-platform determinism (macOS/Windows).** Only Linux/Node 24 was
  exercised. SHA-512 and integer/float math are platform-independent in V8, and
  the geometry uses no platform APIs, so divergence is very unlikely — but the
  smallest experiment that settles it is a CI matrix that diffs the SVG of a
  fixed input across OSes.
- **The unported branches (large-input, all non-hex/UUID parsers).** Their
  correctness is unknowable until ported; the shared core they will sit on is
  proven by the 24 vectors, so the risk is localized to each parser's
  normalization/alphabet declaration.
- **Tier C (browser).** Not run; the React wrapper's actual rendered output in a
  headless browser was not screenshot-compared.

---

```yaml
findings:
  - id: SPEC-F1
    persona: spec-conformance-auditor
    title: Bad-EIP-55 Ethereum address silently rendered via UTF-8 fallback instead of rejected
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:298-315 and docs/spec.md §Error conditions
    dedupe_key: eip55-unhandled
    recommended_disposition: recommend-fix
    rationale: A spec MUST-reject input produces wrong rendered output (fallback hashes 0x + case as opaque text); documented as out-of-scope but it is the one gap that changes output, not just coverage.
    revisit_condition: null
    fix_effort: small
  - id: SPEC-F2
    persona: spec-conformance-auditor
    title: data-entviz-lib stamp has two sources of truth (hardcoded LIB_VERSION vs package.json) with no drift guard
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:16 vs packages/core/package.json
    dedupe_key: lib-version-divergent
    recommended_disposition: recommend-fix
    rationale: A version bump that forgets the constant silently stamps the wrong library version into every SVG; no test asserts agreement.
    revisit_condition: null
    fix_effort: small
  - id: SPEC-F3
    persona: spec-conformance-auditor
    title: Unported render vectors throw a generic error indistinguishable from a spec-mandated rejection
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:656-658
    dedupe_key: large-input-unhandled
    recommended_disposition: recommend-defer
    rationale: Harmless today (scoped corpus run, documented), but conflates "unsupported format" with "spec rejection" for any future caller treating non-zero exit as a valid reject.
    revisit_condition: When the large-input branch or additional parsers are ported, give unsupported-format a typed/distinct error.
    fix_effort: small
  - id: SPEC-F4
    persona: spec-conformance-auditor
    title: SVG coordinates serialized via String() can emit exponential notation; spec pins no canonical numeric format
    severity: LOW
    confidence: LIKELY
    location: packages/core/src/entviz.ts:344-348 and docs/spec.md §Equivalence relation
    dedupe_key: spec-missing-numeric-format
    recommended_disposition: recommend-defer
    rationale: Current geometry never reaches the exponential range and Tier A/B compare by value, so the corpus is unaffected; it is a latent cross-impl landmine for textual SVG comparison and a spec under-specification.
    revisit_condition: If any consumer compares SVG textually, or geometry ever produces sub-1e-6 coordinates.
    fix_effort: small
  - id: SPEC-F5
    persona: spec-conformance-auditor
    title: data-input-bytes is required by the Tier-A checker but not enumerated in the spec's SVG profile
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:693 and docs/spec.md §SVG profile
    dedupe_key: spec-missing-input-bytes-attr
    recommended_disposition: recommend-fix
    rationale: A clean reimplementation reading only the profile list would omit the attribute and fail Tier A for a reason the normative text never states; entviz-js is correct only by following the reference, not the spec.
    revisit_condition: null
    fix_effort: small
```
