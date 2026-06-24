# Maintainability Review: entviz-js

**Date:** 2026-06-19
**Effort level:** medium
**Run label:** port-review-2026-06-19
**Mode:** unattended
**Context sources used:** `README.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
`copilot-instructions.md`, `.cursorrules`, `packages/core/src/entviz.ts` (full),
`packages/core/src/cli.ts`, `packages/react/src/Entviz.tsx`,
`packages/core/package.json`, `packages/react/package.json`, root `package.json`,
all test files under `packages/core/test/`, `scripts/release.py`,
`.github/workflows/ci.yml`, `.github/workflows/release.yml`,
`.github/instructions/docs.instructions.md`, `.github/instructions/infra.instructions.md`,
`CERTIFICATION.md`, `.tick/` ledger (all four open items),
`docs/spec.md` (Python reference repo, §§ Geometry, Palette, Fingerprint),
`src/entviz/colors.py` (Python reference, palette and selectVisualStyle),
prior reviews in `reviews/` (read after forming own view).
No `this.i` exists in this repo (absence noted and is a top finding).

---

## Evidence Inventory

**What exists:**

- `packages/core/src/entviz.ts` — 1,035-line single-file implementation of the
  full render pipeline. Well-commented with per-layer annotations, version context
  on each v9/v10 channel, and a clear section header structure. 38 exported
  symbols. `render()` is ~196 lines but is mostly thin orchestration over extracted
  helpers, not a monolith.
- `packages/core/test/` — 9 test files across `unit/` and `integration/`, with
  enforced 80 %/100 % coverage floors. Structure is sound.
- `scripts/release.py` — Python release script, guards and warns appropriately.
  Does NOT update `LIB_VERSION` in `entviz.ts` (confirmed by code read).
- `AGENTS.md` — authoritative method: `tick`-based task tracking, TDD,
  "do not run the release script."
- `copilot-instructions.md` — a Copilot PR reviewer config that mandates a
  `// TECH_DEBT: <name> [TICKET-NNN]` comment convention that AGENTS.md does
  not recognize or mention. These two files contradict each other.
- `this.i` — **absent**. The reference Python repo has a rich `this.i`; this JS
  port has none. The domain-tag freeze comment references `this.i:b4rm4rks` — a
  node that exists only in the sibling repo. From the perspective of a developer
  who only has the JS repo, this cross-repo reference is a dead link.

**Quality and currency of docstrings/comments:**

- The code is well-commented for a port. Per-layer annotations in `render()` are
  accurate and current (v10). The frozen `v6` domain tag carries the correct
  freeze warning and cross-references both `docs/spec.md` and `this.i:b4rm4rks`.
- `SPEC_VERSION = "v10"` is the single version stamp; it is stamped on every
  SVG. No stale version string found in any docstring.
- `LIB_VERSION = "0.10.0"` (line 16) is a second copy of the library version
  that diverges from `package.json` on every release because `release.py` does
  not update it. This is the most dangerous duplication.

**Intent-layer coverage:**

- No `this.i` exists. The persona prompt explicitly notes that the Python repo's
  `this.i` is the primary defense against intent-boundary failures. This port
  loses that defense entirely.
- The most critical security property — `computeFingerprint` hashes the
  normalized *text*, not the decoded bytes — has no comment at its callsite. This
  is the JS equivalent of the `h4shtext` node from the Python `this.i`.
- The `& 0x03` mask in `selectVisualStyle` (line 217) that keeps black out of
  the background role has no comment explaining why. The spec devotes an
  explicit sentence to it; the code is silent.
- The `v6` freeze IS commented (lines 96–98). This is the one high-stakes
  intent boundary that is protected.

---

## Executive Summary

This is a clean, well-structured TypeScript port: the render pipeline is broken
into tested pure helpers, comments explain the v9/v10 channel changes, and the
frozen `v6` domain tag carries its freeze warning. The two most urgent issues are
(1) `LIB_VERSION` in `entviz.ts` is a duplicate of the `package.json` version
that `release.py` silently skips — it will diverge on every release, corrupting
the `data-entviz-lib` stamp on rendered SVGs; and (2) there is no `this.i` in
this repo, meaning the cross-repo reference `this.i:b4rm4rks` in the code is a
dead link to a developer who has only the JS repo, and two additional
load-bearing constraints (`h4shtext`, `black-never-bg`) have no protection at
all.

---

## Top Findings

Ordered by bang-for-buck.

### F1: `LIB_VERSION` in `entviz.ts` is not updated by `release.py` — will silently diverge

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:16`, `scripts/release.py:65–77`
- **Finding:** `entviz.ts` line 16 declares `export const LIB_VERSION = "0.10.0"` and
  stamps it on every rendered SVG as `data-entviz-lib`. The `release.py` script
  calls `set_version()` which updates `packages/core/package.json` and
  `packages/react/package.json` but does NOT read or rewrite `entviz.ts`. After
  the next patch or minor release, `LIB_VERSION` stays at `"0.10.0"` while
  `package.json` advances. Every SVG emitted by the released package will carry
  a stale version stamp — the one attribute specifically intended to identify
  the library version. The divergence is silent: tests pass, CI passes, the
  package installs and renders correctly, but `data-entviz-lib` lies.
- **Recommendation:** Either (a) read `LIB_VERSION` from `package.json` at module
  load time (one-liner: `import pkg from "./package.json" assert { type: "json" }`
  then `export const LIB_VERSION = pkg.version` — Node's type-stripping supports
  this), or (b) have `release.py` also rewrite the constant in `entviz.ts` via
  regex (mirroring how it already reads `SPEC_VERSION`). Option (a) makes
  `package.json` the single source of truth without any two-place maintenance.

### F2: `computeFingerprint` hashes text, not decoded bytes — no comment at the callsite

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:89–91`
- **Finding:** `computeFingerprint` calls `.update(core, "utf8")` — it hashes the
  normalized *text characters* of the core value, not the byte sequence the text
  encodes. This is the JS analog of `this.i:h4shtext` in the Python repo. A
  future developer who reads "hashing a hex or UUID string" will instinctively
  want to "optimize" it to hash the decoded bytes (feeding a `Buffer.from(core,
  "hex")` to the hash), which would rekey every entviz ever rendered for
  hex/UUID inputs. The callsite has no comment; the function signature gives no
  signal. A developer has to read the spec, trace the Python reference, and know
  to look for `h4shtext` to understand why this is deliberate. The `v6` domain
  tag comment (lines 96–98) correctly cross-references `this.i:b4rm4rks`, but
  `b4rm4rks` is in the sibling Python repo — a developer with only the JS repo
  cannot resolve that reference.
- **Recommendation:** Add a one-line comment at the `computeFingerprint` callsite
  or body: `// Hashes the normalized text, not the decoded bytes — intentional;`
  `// changing this re-keys every entviz ever rendered. See spec §Fingerprint.`
  Also consider whether a `this.i` for this repo should capture this node
  locally (not just cross-reference the Python repo's node).

### F3: `selectVisualStyle` masks to `& 0x03` — black-never-background rule invisible

- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:216–221`
- **Finding:** `POSSIBLE_EDGE_COLORS` has 5 entries (indices 0–4); black is at
  index 4. `selectVisualStyle` uses `medianFtok.quant & 0x03` — capping the
  index at 3 — so black can never be chosen as the background color. This is
  spec-mandated: spec §Palette (line 370 of spec.md) states explicitly "black at
  index 4 is *always* an edge color and is never selected as the entviz
  background … black is too visually heavy to serve as a background." But the
  code carries zero comment explaining this. The `& 0x03` mask looks like an
  arbitrary bit operation; a future developer who "fixes" it to `% 5` or removes
  it to allow the full palette opens a subtle correctness bug — the entviz can
  produce a black background — and the mistake is invisible until someone
  compares against a reference render.
- **Recommendation:** Add a comment above or on line 217:
  `// & 0x03 caps at index 3: black (#000000, index 4) is permanently an edge`
  `// color and MUST NOT be a background (spec §Palette). Do not change to % 5.`

### F4: `LIB_VERSION` duplication aside — `this.i` is absent; cross-repo reference is a dead link

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `packages/core/src/entviz.ts:98`, repo-wide
- **Finding:** The domain-tag freeze comment (line 98) reads `"see docs/spec.md /
  this.i:b4rm4rks"`. The `this.i:b4rm4rks` node lives in the sibling Python
  repo (`../entviz/this.i`), not in this repo. A developer who checks out only
  `entviz-js` and follows the cross-reference finds nothing: `this.i` does not
  exist here. More broadly, the intent layer that the Python repo uses to protect
  its load-bearing decisions — `h4shtext`, `c4s3norm`, `3ip55rj1`, `b4rm4rks`
  — has no local counterpart in the JS port. The `.tick/` ledger covers
  four open work items (webapp, Playwright tests, random walk, social card), but
  none of the architectural intent captured in the Python `this.i` is replicated.
  A maintainer of the JS repo has half the context the Python maintainer has.
- **Recommendation:** Either (a) create a `this.i` in the JS repo that mirrors the
  high-stakes Python nodes (at minimum `h4shtext`, `b4rm4rks`, and a new
  `black-never-bg` node), or (b) resolve each in-code cross-reference by
  replacing `this.i:<id>` with an inline sentence that captures the material
  content, so a developer can understand the constraint without cloning the
  Python repo. In **unattended** mode: recommend filing a GitHub Issue to track
  this; do not file it yourself.

### F5: Conflicting tech-debt conventions: `copilot-instructions.md` mandates `TECH_DEBT:` format; `AGENTS.md` mandates `tick`

- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Location:** `copilot-instructions.md:28`, `AGENTS.md:12–28`
- **Finding:** `copilot-instructions.md` (full-review mode, applied to every PR)
  mandates: "Bare TODO/FIXME/HACK is a finding. Required format: `// TECH_DEBT:
  <name> [TICKET-NNN]`." `AGENTS.md` — the file `.cursorrules` and `CLAUDE.md`
  both identify as the **authoritative** instruction source — makes no mention of
  `TECH_DEBT:` comments and instead directs agents to use `tick add "<title>"` to
  capture work items in the `.tick/` ledger. The two conventions are
  contradictory: following `AGENTS.md` produces bare `tick`-marked code with no
  `TECH_DEBT:` syntax; following `copilot-instructions.md` produces
  `TECH_DEBT:`-annotated comments that `tick` ignores. An agent (Copilot,
  Claude, Gemini) reading both will get conflicting signals. So will a human
  contributor reviewing a Copilot comment that says their `tick` usage is a
  finding.
- **Recommendation:** Align the two files. The simplest fix: add a paragraph to
  `copilot-instructions.md` stating that this repo uses `tick`-based task
  tracking (see `AGENTS.md`), and that `tick`-marked code is not a finding.
  Remove the `// TECH_DEBT: [TICKET-NNN]` requirement, or scope it to PRs that
  predate the tick ledger. `AGENTS.md` is the authoritative file and should
  remain unchanged.

---

## Additional Patterns Noted

- **`interface TC` declared inside `render()`** (`entviz.ts:717`). TypeScript
  allows local interface declarations, but this one — a record of per-token cell
  geometry — is invisible outside the function and cannot be tested independently.
  The type exists because `tokenCells` is a local collection used in three
  subsequent loops inside `render()`. Extracting it to file scope as
  `interface TokenCell` would improve navigability and allow callers of any
  future extraction of those inner loops to share the type. Low-bang, low-buck
  cleanup.

- **`nucleusBg` field computed but used only once** (`entviz.ts:727–744`).
  `tokenCells` carries `nucleusBg` (the background color string), which is used
  only in the edge-color computation at line 744. The same value could be
  computed lazily inside the loop body. Not a real bug, but the field name
  `nucleusBg` is slightly inconsistent with the rest of the interface's
  abbreviation style (`nx`, `ny`, `ci` vs. `nucleusBg` spelled out). Low priority.

- **`render()` is ~196 lines** but is thin orchestration — the dominant concern
  (a monolith mixing concerns) is substantially resolved by the extracted helpers.
  No significant extraction seam is missing. The Python-repo MNT-F3 concern does
  not apply here.

- **No `globals()` parser dispatch.** The Python-repo MNT-F4 concern (invisible
  ordering constraint in a `globals()` scan) does not exist in the JS port: the
  ported parsers are three explicit conditionals inside `parse()` (lines 299–314),
  in a clear order that matches the spec. When new parsers are added, this
  structure will stay readable.

- **`Geometry.fs` field** (`entviz.ts:443`): `fs` stands for "font size in
  pixels," derived from the point size. The abbreviation is compact and used
  consistently within the file, but a developer new to the codebase might not
  immediately know what `fs` means. A comment `// fs: font_size_px` on the
  interface field or a rename to `fontSizePx` would be a small readability win.
  The geometry computation comment (line 450) says "see the spec's geometry
  section" which helps, but doesn't name `fs`. Low priority.

- **`gm` field in `Geometry`** (`entviz.ts:446,460`): `gm` is the spec's "GM"
  (grid margin = `box_height / 2`). The derivation is clear from `computeGeometry`
  line 460, and the spec abbreviation is used consistently. Fine as-is, but a
  JSDoc comment saying `// gm: grid margin (spec GM)` on the interface field
  would help a new developer reading only the interface.

- **The `OVERLAY_BY_BG` magic-number table** (`entviz.ts:399–404`): the overlay
  colors and opacity pairs are hardcoded without a reference to the spec section
  that defines them (spec §Ellipse overlay, which explains the rationale — blue
  background lightens, others darken, split fill vs. edge opacity). A one-line
  `// see spec §"Ellipse overlay"` above the constant would anchor it.

- **`.github/instructions/` files mandate conventions** (`docs.instructions.md`,
  `infra.instructions.md`) that are written as Copilot PR instructions. They are
  well-scoped and do not conflict with `AGENTS.md` on anything substantive. The
  only friction is the `TECH_DEBT` convention noted in F5.

- **`decodedByteLength` is placed after `render()`** (line 835), even though
  `render()` calls it at line 656. In JavaScript/TypeScript, `export function`
  declarations are hoisted, so this is not a runtime issue — but reading
  `render()` before reading `decodedByteLength` means a top-to-bottom reader
  encounters an undefined-at-read-time call. Moving it above `render()` would
  improve top-to-bottom readability. Very low priority.

- **`selectVisualStyle` test** (`test/unit/colors.test.ts:49`): tests `idx < 4`
  (four iterations over 0..3), which is exactly the number that confirms the
  `& 0x03` contract — but the test never names or asserts the "black is never bg"
  property. A comment or a fifth test case asserting black is always in the
  `edgeColors` array for any input would make the behavioral contract visible.

---

## Future Developer FAQ

1. **Why does `computeFingerprint` hash the text string rather than decoding and
   hashing the bytes?** Because the spec mandates it — the comparison semantic
   requires that the same textual representation always hashes the same way,
   regardless of how it was decoded. Changing this would silently rekey every
   entviz ever rendered. (See spec §Fingerprint; also see `this.i:h4shtext` in
   the sibling Python repo.)

2. **Why is there a `v6` in the middle domain tag when the spec is at v10?**
   It is a fixed construction-version constant, not a spec version. It was
   introduced in spec v6, has been unchanged since, and MUST NOT track
   `SPEC_VERSION` — changing it alters the middle cells of every >512-bit
   entviz ever rendered. (See `entviz.ts:96–98`.)

3. **Why does `selectVisualStyle` mask with `& 0x03` rather than using `% 5`?**
   Black (`POSSIBLE_EDGE_COLORS[4]`) must never be the background color. The
   `& 0x03` cap is intentional and spec-mandated. (No comment in the current code
   — see F3 above.)

4. **Why is there no `this.i` in this repo, and what is `this.i:b4rm4rks`?**
   The sibling Python repo (`entviz`) maintains a structured intent layer in a
   file called `this.i`. The JS port has no local equivalent. `b4rm4rks` is a
   node ID in the Python `this.i` that explains the color-bar marker design. A
   developer with only the JS repo cannot resolve the reference. (See F4 above.)

5. **Why is `LIB_VERSION` a constant in `entviz.ts` when `package.json` also
   holds the version?** It stamps `data-entviz-lib` on every rendered SVG.
   Unfortunately `release.py` does not update it, so after any release it will
   diverge. (See F1 above for the fix.)

---

## Residual Unknowns

- Whether the Python `this.i` nodes `c4s3norm` (case normalization is load-bearing)
  and `3ip55rj1` (EIP-55 reject-not-relax) have JS-side analogs to protect. The
  case-normalization path exists in `parse()` (lines 302, 309, 312) but lacks
  a comment. The EIP-55 parser is not yet ported.
- Whether `@entviz/react`'s lack of tests is accepted risk or a gap. The package
  ships as "held back until proven" per the release workflow, but there are no
  unit tests for `Entviz.tsx`.
- Whether any test file for the React component is planned. The `.tick/` ledger
  has `2sky.md` ("playwright tests on the react"), which is tagged `idea` —
  no committed timeline.

---

## Decisions Needed

- **Should `LIB_VERSION` be read dynamically from `package.json`?** (F1) The
  alternative is teaching `release.py` to also rewrite it, but that adds a
  maintenance step that can be forgotten. Reading from `package.json` is simpler
  and removes the duplication.
- **Should a local `this.i` be created for `entviz-js`?** (F4) Or should the
  policy be to resolve every cross-repo `this.i:<id>` reference inline? The
  current state (dead cross-repo links and missing local coverage) is the
  worst option.
- **Which tech-debt convention governs this repo?** (F5) `tick` (per `AGENTS.md`)
  or `TECH_DEBT:` (per `copilot-instructions.md`)? The two files need to be
  reconciled so Copilot PR review does not flag tick-marked code as a finding.

---

## Findings Manifest

```yaml
findings:
  - id: MNT-F1
    persona: maintainability-expert
    title: LIB_VERSION in entviz.ts not updated by release.py — diverges silently on every release
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:16
    dedupe_key: lib-version-duplicated
    recommended_disposition: recommend-fix
    rationale: >
      release.py bumps only package.json; LIB_VERSION in entviz.ts is a second copy that silently
      stays stale, corrupting the data-entviz-lib stamp on every rendered SVG after a release.
    revisit_condition: null
    fix_effort: small

  - id: MNT-F2
    persona: maintainability-expert
    title: computeFingerprint hashes text not bytes — no callsite comment, invisible intent boundary
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:89
    dedupe_key: fingerprint-missing
    recommended_disposition: recommend-fix
    rationale: >
      The "hash text not decoded bytes" property is load-bearing and rekeying; it has no callsite
      comment in the JS port, so a future developer can silently break every pre-existing entviz
      by "optimizing" the hash to consume decoded bytes.
    revisit_condition: null
    fix_effort: small

  - id: MNT-F3
    persona: maintainability-expert
    title: black-never-background constraint (& 0x03 mask in selectVisualStyle) has no comment
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:217
    dedupe_key: palette-missing
    recommended_disposition: recommend-fix
    rationale: >
      The spec-mandated constraint that black (#000000, index 4) must never be the background is
      invisible in the code. A developer who changes & 0x03 to % 5 introduces a silent
      spec-violation that is hard to detect in test output.
    revisit_condition: null
    fix_effort: small

  - id: MNT-F4
    persona: maintainability-expert
    title: No this.i in entviz-js — cross-repo intent reference is a dead link
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:98
    dedupe_key: this-i-missing
    recommended_disposition: recommend-fix
    rationale: >
      The domain-tag freeze comment references this.i:b4rm4rks (in the Python repo), which is
      unresolvable from this repo alone. No local this.i exists. Load-bearing constraints from the
      Python this.i (h4shtext, c4s3norm, b4rm4rks) have no protected JS-side equivalents.
    revisit_condition: null
    fix_effort: medium

  - id: MNT-F5
    persona: maintainability-expert
    title: Conflicting tech-debt conventions between copilot-instructions.md and AGENTS.md
    severity: MEDIUM
    confidence: CONFIRMED
    location: copilot-instructions.md:28
    dedupe_key: copilot-instructions-divergent
    recommended_disposition: recommend-fix
    rationale: >
      copilot-instructions.md mandates TECH_DEBT: comment syntax; AGENTS.md (authoritative) mandates
      tick-based task tracking and never mentions TECH_DEBT. Copilot will flag tick-marked code as
      a finding, confusing contributors.
    revisit_condition: null
    fix_effort: small
```
