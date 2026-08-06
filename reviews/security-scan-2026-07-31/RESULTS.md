# Claude Security results

Scanned `/home/daniel/code/me/entviz-js` at revision `557bcc82f6504bf1bcfbdaf15c770cf92111bd6b` (clean working tree) on 2026-07-31, in scan mode at **medium** effort, scoped to `packages/core`, `packages/react`, and `apps/playground` — 116 tracked files. Ten findings survived verification: **2 HIGH**, **7 MEDIUM**, **1 LOW**. Eight of the ten attack the same thing — the affirmative `identical` verdict, which is this library's entire reason to exist. Two are availability findings against the same unguarded quadratic decode. Nothing in this scan executed the repository's code: no tests were run, no exploit was fired, no proof-of-concept was validated. Every finding is derived from reading the source.

## Coverage

The scan was **scoped**, so it is not a whole-repository result. Eight components inside the scope were partitioned and reviewed:

| Component | Paths |
|---|---|
| core-parsers-render | `entviz.ts`, `characterize.ts`, `describe.ts`, `corners.ts`, `trust.ts`, `bytes.ts` |
| core-compare-engine | `compare.ts`, `compare-walk.ts`, `raster-compare.ts`, `live-ceremony.ts` |
| react-compare-acquisition | `EntvizCompare.ts`, `EntvizVoiceCompare.ts`, `EntvizWalk.ts`, `compare-messages.ts` |
| react-pill-entviz-components | `EntvizPill.ts`, `Entviz.ts`, `pill-icon.ts`, `role-icon.ts`, `pill-messages.ts`, `auto-color.ts` |
| react-clipboard-input-utils | `copy-actions.ts`, `keyboard.ts`, `rng-guard.ts`, `events.ts` |
| react-text-corners-scale | `raster-text.ts`, `text-scale.ts`, `corners.ts`, `index.ts` |
| apps-playground | `apps/playground/src` and its HTML/config |
| core-cli | `packages/core/src/cli.ts` |

**Not examined, because the scope excluded them.** Everything outside those three directories was never looked at: `.github/workflows/` (including `release.yml`, the npm publish path), `scripts/release.py`, `prompts/`, `reviews/`, `docs/`, `this.i`, and the root build and lint configuration. The supply-chain surface is therefore unassessed by this run. Because this was a scoped scan, the whole-tree completeness check does not apply (`completenessCheckOutcome: not-applicable`) — there is no claim here that the repository as a whole is accounted for.

**Not examined, by the componentizer's decision, inside the scope.** Four areas were deliberately set aside, each with its stated reason:

- `packages/core/test`, `packages/react/test`, `packages/react/e2e` — unit/integration/e2e suites and golden fixtures; not shipped attacker-reachable code.
- `packages/react/node_modules` — vendored third-party dependency tree (vitest and friends); not first-party code, and the componentizer's position is that it belongs to a dependency/SCA process rather than manual source review.
- `apps/playground/dist` — generated build artifact; reviewing `apps/playground/src` covers the same logic.
- READMEs, LICENSE and NOTICE files, `packages/react/docs`, `apps/playground/README.md` — documentation and license text, no executable logic.

**Category pruning.** The `memory-and-unsafe` category was skipped for five components (`core-parsers-render`, `core-compare-engine`, `core-cli`, `react-clipboard-input-utils`, `react-text-corners-scale`) on the grounds that TypeScript is a managed language.

**No cap truncated anything.** The full component matrix ran rather than the proportionate single-researcher shape; 28 researchers were dispatched and 28 returned; no components were dropped, no candidates were dropped by cap, and no candidate went unreviewed.

A reader should calibrate on one point above all: this report says nothing about the release and CI surface, because the scope did not include it.

## Findings

### F1 — Closed-profile validation of a pasted entviz SVG does not bind declared cell data to what the SVG actually paints (HIGH, confidence high)

> **FIXED** (2026-08-06). `validateClosedProfile` is now a cheap raw prescan plus a strict parse and a real grammar: `packages/core/src/svg-profile.ts` (new — `parseXml`, `validateEntvizProfile`, `extractEntvizChannels`, `recoverGeometry`, `treeEqual`) driven from `packages/core/src/compare.ts` (`rawPrescan`, `parseEntviz`, `referenceIsOurRendering`, `compareSvg`). Element sequence, nesting, per-position attribute allow-lists, child counts and cell-index uniqueness are pinned to the shape `render()` emits; the colour-bar scan is scoped to the colour-bar group; DOCTYPE and internal entity subsets are rejected; and no affirmative verdict is returned until the value is re-rendered through this library's own renderer and matches the reference tree. The forgeries are locked in `packages/core/test/unit/compare-svg-attacks.test.ts` (16 tests, every one of which reached `identical`/`similar` before the fix) with the grammar's rejection table in `packages/core/test/unit/svg-profile.test.ts`. Shipped behaviour and its residual limits are written up in `packages/react/docs/comparison-design.md` §6.2.1.
>
> Note on the fix as suggested: rejecting `transform`, `clip-path`, `fill-opacity` and `stroke-opacity` "anywhere in the document" would reject honest entvizes — the renderer emits all four on the ellipse overlay. They are pinned to that one position by the grammar instead. `opacity`, `display`, `visibility`, `mask` and `filter` appear nowhere in a conformant entviz and are rejected outright.

**Impact.** The machine `identical` verdict — the primary asset of the whole component, and the thing `comparison-design.md` §6.2 adjudication S3 explicitly names ("an SVG whose `<text>` says X while its ink shows Y could otherwise reach IDENTICAL with no preimage") — is forgeable with no hash work at all. A victim who recognizes the picture *and* gets a green `= Identical` chip is holding a value that is not the one the artifact depicts. That is precisely the substitution the tool exists to prevent.

**Where.** `packages/core/src/compare.ts:167` in `validateClosedProfile`

**What.** `validateClosedProfile` blesses attacker-authored SVG markup — arriving from paste, drop, file-pick, or URL-fetch via `EntvizCompare.classifyResult` → `compareSvg` — using only a tag whitelist plus checks for `on*=`, `style=`, `@font-face`, external `href`, and external `url()`. It never constrains paint order, `<defs>`, `opacity`/`display`/`visibility`/`fill`, `transform`, or duplicate per-cell content. So the `data-*` and `<text>` channels that `compare.ts` subsequently trusts need not be the channels a viewer actually renders, and `compareSvg` converts that trust into `{ state: "identical" }` at line 274.

**Exploit scenario.** The attacker generates `A = render(V_victim)` and `B = render(V_attacker)` with the public library at the same size and shape. In `B`, they rename the non-rendering annotation attributes (`data-channel="cell"` → `data-x="cell"`, `data-color-bar-band` → `data-x-band`) and drop `data-truncated` — changing no pixels. They then append B's inner content, an opaque `<rect>` cover plus B's `<g>/<rect>/<path>/<text>` groups (every tag is in `CLOSED_PROFILE_TAGS`), just before `</svg>` of `A`. `validateClosedProfile` returns true; `parseEntvizSvg` sees only A's genuine, self-consistent cell groups, so `refText`, surround bits and colour-bar letters all agree, and `compareSvg` returns `identical`. Every viewer paints B over A, so the human sees `entviz(V_attacker)` while the tool certifies it equal to `V_victim`. Cheaper variants exist: put A's cell groups inside the whitelisted `<defs>` (never painted), or give A's `<text>` `opacity="0"`, `display="none"`, or `transform="translate(-9999,0)"` — none of which are rejected, even though §6.2 item 1 explicitly requires rejecting `transform` on text and extra per-cell instances.

**Preconditions.**
- The attacker can supply the reference SVG the victim compares against (paste, drop, file, or a URL the victim fetches) — the documented threat assumption at `compare.ts:125-127`.
- The attacker knows the value the victim has entered (typically because they supplied it, or it is public).
- The victim's trust in the artifact comes from seeing it rendered, which is the artifact's purpose.

**Fix.** Do not treat a declared channel as trustworthy unless it is provably the one painted. Reject any element outside the exact structural shape of a conformant entviz rather than applying a flat tag whitelist: no content after or over the grid, no `<defs>` content other than the clipPath the renderer itself emits, no second `<g data-channel="cell">` for an index already seen, and no more than one `dominant-baseline="central"` `<text>` per cell group (`compare.ts:179-186` currently takes the first and ignores the rest). Reject presentation attributes that can hide or displace painted content — `opacity`, `fill-opacity`, `display`, `visibility`, `transform`, `clip-path` — anywhere in the document, and reject `<!DOCTYPE` and internal entity subsets. Scope the `data-color-bar-band` scan (`compare.ts:214`) to the colour-bar group instead of the whole string. If declared-versus-painted cannot be enforced by parsing alone, downgrade the SVG engine's ceiling from `identical` to `unknown·similar` and route to the human walk.

**Verification.** 3/3 lens verifiers confirmed.

### F2 — compareSvg blesses an attacker-authored SVG as `identical` (HIGH, confidence medium)

> **FIXED** (2026-08-06), by the same change as F1. The sink at `compare.ts:274` no longer derives an affirmative verdict from the reference's declarations: `compareSvg` reaches `identical` (≤512-bit) or `unknown`+`similar` (>512-bit, the green `≈` chip this finding also names) only after `referenceIsOurRendering` re-renders the user's value at the geometry the reference declares and finds the two documents to be the same drawing. Everything short of that is `unknown` — never a manufactured `different`. The >512-bit `≈` variant is covered by two dedicated tests in `packages/core/test/unit/compare-svg-attacks.test.ts`.

**Impact.** The tool's single security-bearing output can be forged. A reference SVG whose visible glyphs render value Y while its declared cells declare value X yields a green "= Identical" chip against X — or, for inputs over 512 bits, the green "≈" `unknownSvgSimilar` chip via `chipFor`. Because `EntvizCompare` deliberately never embeds the pasted markup ("The reference is ALWAYS re-rendered through our own `<Entviz>`", `EntvizCompare.ts:495-498`), the victim never sees the discrepancy inside the tool: they saw the attacker's picture elsewhere — mail, web page, PDF — and the tool certifies it as their value.

**Where.** `packages/core/src/compare.ts:274` in `compareSvg`

**What.** The untrusted source is the reference SVG acquired from an attacker via paste, file-drop, or URL-fetch (`EntvizCompare.ts:106-127` → `compareSvg`). The sink is the `identical` verdict at `compare.ts:274`, derived exclusively from the SVG's *declared* `<text dominant-baseline="central">` and its `data-surround-bits` / `data-color-bar-band` attributes (`parseEntvizSvg`, `compare.ts:192-218`). Nothing ties those declarations to what the document paints, and `validateClosedProfile` whitelists `rect`/`path`/`text`/`tspan`/`polygon`/`g` with arbitrary geometry, `fill`, `opacity`, `display` and `transform`, so both extra ink and hidden declarations pass.

**Exploit scenario.** Mallory takes the genuine `render(X)` output for a well-known value X, appends an opaque `<rect fill="#ffffff" .../>` over the grid plus fresh `<text>` elements drawing the tokens of her own value Y — or simply marks the honest cell groups `display="none"`. Every element and attribute is inside the closed-profile whitelist, so validation passes; `parseEntvizSvg` extracts the untouched declared cells for X; `refText === myText` and the recomputed surround bits and colour-bar letters agree, so `compare.ts:274` returns `identical`. Alice, who saw the artifact rendering Y on Mallory's page, drops the file into the comparator, is told it is identical to X, and accepts Y.

**Preconditions.**
- Victim uses the SVG reference path (paste, drop, file-pick, or URL-fetch) — the default, intended acquisition flow.
- Attacker knows the value the victim will compare against, e.g. a published key or address; this is the §2.4 attacker-chosen-reference threat the design already assumes.
- Value classifies as ≤512 bits for a flat `identical`; larger values still reach the green `≈` similar chip.

**Fix.** Implement the design's own §6.2 requirements: reject `transform`, `display`, `visibility` and `opacity` on cell text; reject any drawing element that is not part of the recognized cell or colour-bar structure ("extra per-cell instances"); and re-render the recovered value through the tool's own renderer, comparing the produced markup or its raster against the reference before any `identical` or `similar` verdict.

**Verification.** 2/3 lens verifiers confirmed.

### F3 — Unbounded quadratic BigInt decode in `characterize()`; the 64 KiB anti-DoS cap never applies on this path (MEDIUM, confidence high)

**Impact.** CPU exhaustion. A ~10 MB value pins one core for minutes to hours: in the browser it freezes the tab that was asked to display the attacker's identifier; in Node — a server rendering entvizes, or the conformance CLI — it stalls the process. Even at the `render()`-capped 65536 characters the loop is roughly 2×10⁸ limb operations, a greater-than-1000× amplification over the input size.

**Where.** `packages/core/src/characterize.ts:106` in `decodedBytesInteger`

**What.** `characterize(entropy)` (`characterize.ts:553`) takes a fully attacker-controlled identifier string and applies no length cap of its own, then feeds the whole `parsed.core` into this accumulator loop. BigInt multiply-by-small is O(limbs), so the loop is O(N²) in the input length.

**Exploit scenario.** An attacker supplies an "identifier" of ~10 MB consisting of `z1` repeated. Every specific parser in `PARSE_FUNCS` declines it — all are anchored and either length-bounded or prefix-bound — so `parse()` falls through to `detectAlphabetByDisproof`, which returns BASE58 (`z` rules out hex; `1` rules out base32 and bech32). `characterize()` then calls `sizeBitsFor` → `decodedBytesInteger`, which builds a ~59-million-bit BigInt one digit at a time. Because `<EntvizPill>` calls `characterize(value.trim())` at `EntvizPill.ts:307` *before* it calls `render(value, opts)`, the `MAX_INPUT_CHARS` guard at `entviz.ts:1854` never gets a chance to reject the input — the tab hangs first.

**Preconditions.**
- The host passes an untrusted value to `characterize()` or to `<EntvizPill value=...>` — precisely entviz's documented "wild / adversarial" use case (`trust.ts:1-23`).
- The value is composed only of base58 characters that are not all-hex, all-base32 and not all-bech32 (e.g. `z1` repeated), so `detectAlphabetByDisproof` labels it `base58`, which is in `INTEGER_DECODE_ALPHABETS`.

**Fix.** Enforce `MAX_INPUT_CHARS` at the top of `characterize()` — and of every public entry point — before `parse()` runs. Replace the digit-at-a-time BigInt accumulation with a size estimate: for base58, base36 and decimal, `ceil(core.length * log2(base) / 8)` gives the same byte count without materializing the integer; otherwise chunk the accumulation. Do not rely on `render()`'s cap to protect siblings that are called first.

**Verification.** 3/3 lens verifiers confirmed.

### F4 — Generic bech32 parser drops the HRP from the identity-bearing core, so `nsec1…` and `npub1…` render the same entviz and compare as `identical` (MEDIUM, confidence medium)

**Impact.** The entviz for `npub1<52 data chars><cksum>` and for the corresponding `nsec1<same 52 data chars><cksum'>` is identical in every fingerprint-driven channel — cells, nucleus colours, surround bits, ellipse, colour bar, blank map. `comparisonText()` and `describeChannels()` are byte-identical, and `compareValues`, `compareComparisonText` and `compareSvg` all return `identical`. Only the small grey top-label prefix slot differs. A user who relies on the glyph or on the tool's verdict to confirm "this is my public key, safe to publish" can be led to publish the secret key. The same collision covers cross-chain and role variants of one cosmos-style payload (`cosmos1…` vs `cosmosvaloper1…`), because the HRP is the only free variable and the 6-character checksum is trivially recomputable for any HRP the attacker picks.

**Where.** `packages/core/src/entviz.ts:1273` in `parseBech32`

**What.** Untrusted identifier text reaches `parseBech32`, which puts only `data.slice(0,-6)` in `core` and marks the human-readable part a presentation prefix (`prefixSemantic` omitted, so false). Everything the verification surface is built from — `computeFingerprint(fingerprintCore(core, prefix, prefixSemantic))` at `entviz.ts:1861`, the cell text, and `identityKey` in `compare.ts:46` — therefore ignores the HRP, so two distinct bech32 strings sharing a payload verify as the same value.

**Exploit scenario.** An attacker presents a bech32 string whose HRP differs from the expected one but whose data payload is identical — the victim's own `nsec1…` where an `npub1…` is expected, or `otherchain1<payload>` where `cosmos1<payload>` is expected. Constructing it needs no brute force: strip the last six characters, substitute the desired HRP, recompute the bech32 polymod using the same `bech32ChecksumConst` this file implements. The victim compares the two values with `<EntvizCompare>` or by glancing at the two pills; grids, colours, surround patterns and read-aloud text match exactly, the engine reports `identical`, and the substituted identifier is accepted.

**Preconditions.**
- The value is a generic bech32 string not claimed by an earlier parser — not `bc1`/`tb1`/`ltc1`/`addr1`/`stake1`, which keep the checksum inside the core and are unaffected.
- The two colliding values share the same data payload, which is the normal case for nostr `npub`/`nsec`/`note` and for one key expressed under different cosmos-SDK HRPs.
- The human or host relies on the glyph, `comparisonText`, or the `compareValues` verdict rather than on a byte comparison of the raw strings.

**Fix.** Make the HRP identity-bearing. Either return `prefixSemantic: true` so `fingerprintCore` folds `"<hrp>1" ‖ core` into the primary fingerprint — the treatment already given to `did`, `urn`, `gitoid` and `swhid` — or keep the full `data` including checksum in `core`, as `parseBitcoin`'s SegWit branch already does, since the checksum binds the HRP. Either fix propagates automatically to the cells, the fingerprint, `comparisonText`, and `identityKey`.

**Verification.** 2/3 lens verifiers confirmed.

### F5 — `identityKey` discards every non-semantic prefix, so `compareValues` returns `identical` for demonstrably different strings (MEDIUM, confidence medium)

**Impact.** `compareValues("nsec1<payload><ck>", "npub1<payload><ck'>")` returns `identical`. So does `compareValues("1220<digest>", "1b20<digest>")` — sha2-256 versus keccak-256 multihash of the same bytes. So does an SSH ed25519 body relabelled with the RSA structural header. The comparison engine is what the UI turns into a green affirmative verdict, so a wrong `identical` here is the exact failure the product exists to prevent. The finding is bounded: the attacker cannot substitute arbitrary key material, since the colliding pair always shares the victim's payload, so the achievable confusions are key-role (secret versus public), chain, and hash-algorithm.

**Where.** `packages/core/src/compare.ts:46` in `identityKey`

**What.** Both compared strings are fully attacker-supplied and flow into `classifyInput`. `identityKey` then deliberately drops the presentation prefix — bech32 HRP, multihash hash-function header, SSH algorithm header, base58 version character — so the equality test at `compare.ts:73` emits `identical`, the tool's strongest affirmative claim, for two different values. This is reported separately from F4 because the line is independently fixable: it could include `c.prefix` even while the render keeps its current keying.

**Exploit scenario.** A host embeds `<EntvizCompare>` or `compareValues` to let a user confirm a pasted value against a reference. The user pastes their nostr `nsec1…` where the reference is the matching `npub1…` — a well-known nostr footgun, and one an attacker can deliberately induce with "paste the key that matches this picture". The engine reports `identical` with no caveat, and the user proceeds to share the secret key.

**Preconditions.**
- Caller uses the exported `compareValues` / `compareComparisonText` / `compareSvg` API, re-exported from `@entviz/core`.
- The two values differ only in a prefix the parser classifies as presentation (bech32 HRP, multihash header, SSH algorithm header).

**Fix.** Include the literal presentation prefix in the identity key — `JSON.stringify([c.core, c.alphabet.name, c.prefix, c.prefixSemantic])` — or, preferably, fix the parsers so those prefixes are bound into the fingerprint. The latter keeps the invariant the comment relies on ("two inputs that render the same entviz compare identical") true in the safe direction rather than the unsafe one.

**Verification.** 2/3 lens verifiers confirmed.

### F6 — `compareComparisonText` affirms `identical` from the cell-text channel alone, which omits the identity-bearing prefix (MEDIUM, confidence high)

**Impact.** A machine-certified affirmative equality verdict — the product's primary security assertion — between two values the same module classifies as different. The victim accepts a substituted identifier.

**Where.** `packages/core/src/compare.ts:97` in `compareComparisonText`

**What.** The untrusted source is the pasted reference comparison-text (`referenceText`, arriving via `EntvizCompare.classifyResult:117` from paste, drop, file, or fetch). The sink is the affirmative `identical` at `compare.ts:97`, reached on a cell-text match alone. Cell text is derived solely from `core` and `alphabet` via `tokenizeEntropy`, while the engine's own identity definition (`identityKey`, `compare.ts:37-47`) also includes the semantic prefix — so a DID-method or URN-NID substitution produces the same comparison text and a false affirmative.

**Exploit scenario.** A vendor publishes the entviz comparison text for `did:good:AbCdEfGhIjKlMnOpQrStUvWx`. An attacker gets the victim to hold `did:evil:AbCdEfGhIjKlMnOpQrStUvWx` — same method-specific id, attacker-controlled method resolving to an attacker-controlled document. The victim pastes the published comparison text into `<EntvizCompare>`. `compareValues` correctly returns `different` (the semantic prefix differs), but `classifyResult` falls through to `compareComparisonText`, whose cell readout is byte-identical for both values: tokens come only from the core, and with an exactly-full grid there is no fingerprint permutation or blank pattern to disagree. The engine returns `identical`, the UI shows the green `=` verdict, and because `refValue: value` it re-renders the reference figure from the victim's *own* value — erasing the visual difference, since background colour, colour bar, ellipse and surround bits all actually differ.

**Preconditions.**
- The reference is acquired as text that is not itself a parseable value, so `compareValues` fails first and control falls through to the comparison-text branch at `EntvizCompare.ts:117`.
- The user's value and the attacker's value share the same normalized `core` and alphabet and differ only in an identity-bearing prefix (DID method, URN NID).
- The token count exactly fills the chosen grid (e.g. 4 or 6 tokens — the common 128-bit / UUID / 24-char-msid case), so `assignCellIndices` returns the identity map and no fingerprint-driven blank shifts appear in the readout.

**Fix.** The comparison text is not an identity proof, because it carries neither the prefix nor the alphabet. Either return `unknown` (routing to the human walk) whenever `classifyInput(value).prefixSemantic` is true; or make the canonical comparison text carry the rendered label or prefix and require it to match; or require a digest-derived channel — colour-bar letters or surround bits — to agree before affirming.

**Verification.** 3/3 lens verifiers confirmed.

### F7 — "Complete" walk plan drops every gestalt check for ≤512-bit values, so a prefix-only difference reaches "no difference found" (MEDIUM, confidence medium)

**Impact.** A human-verification affirmative — "you read every cell, a full visual check" — for two demonstrably different values, presented to the user as a *stronger* check than the machine verdict it contradicts.

**Where.** `packages/core/src/compare-walk.ts:296` in `buildCheckPlan`

**What.** `includeGestalt = d.truncated` means a Complete walk over a non-truncated value contains only text steps. The affirmative sink `liveVerdict` (`compare-walk.ts:347`) then reaches `no-difference` from cell-text agreement alone. Cell text is prefix-independent, since `tokenizeEntropy` uses only `core` and `alphabet`, while every channel that binds the identity-bearing prefix — background, colour bar, ellipse, quartiles, blank map, all SHA-512-digest driven — is exactly what was removed.

**Exploit scenario.** The victim pastes `did:evil:AbCdEfGhIjKlMnOpQrStUvWx` as the reference against their own `did:good:AbCdEfGhIjKlMnOpQrStUvWx`. The machine chip correctly reads "≠ Different", so the victim launches the offered guided walk to double-check. With six filled cells the value is `small`, so only "Complete" is offered, and its plan contains six text steps and nothing else. Each step spotlights one cell with a 50%-opacity scrim over everything outside the focus ring and asks only "Do the highlighted characters match?" — and every cell does match. After the third answer `liveVerdict` flips to `no-difference`, and the walk ends with "No difference found — you read every cell, a full visual check.", directly contradicting the correct machine verdict while hiding the genuinely different background, colour-bar and ellipse channels behind the scrim.

**Preconditions.**
- Reference and value share a core and alphabet and differ only in the identity-bearing prefix (DID method, URN NID).
- The value is ≤512 bits (`d.truncated === false`).
- The user runs the "Complete" walk — which is the *only* mode offered for a small value, since `EntvizCompare.ts:729-731` and `EntvizWalk.ts:325` both suppress spot-check when filled cells ≤ 6.

**Fix.** Do not treat the text channel as identity-complete. Include the gestalt dimensions in a Complete plan whenever the value carries an identity-bearing prefix (`classifyInput(value).prefixSemantic`), or unconditionally — gestalt is the only channel that binds prefix ‖ core.

**Verification.** 3/3 lens verifiers confirmed.

### F8 — Attacker-supplied comparison-text reference yields a false `identical` verdict at the acquisition layer (MEDIUM, confidence medium)

**Impact.** Defeats the component's primary asset. The UI shows the green `=` "Identical — the same value" chip (`chipFor`, `EntvizCompare.ts:207`) for two genuinely different identifiers, and because `refValue: value` is returned the tool re-renders *our own* figure as the reference (`EntvizCompare.ts:498, 798`) — so the human side-by-side cross-check and any subsequent guided walk compare the value against itself and cannot catch the difference.

**Where.** `packages/react/src/EntvizCompare.ts:118` in `classifyResult`

**What.** The untrusted reference string (pasted, dropped, or fetched) is routed to `compareComparisonText`, which compares only the grid cell text (`packages/core/src/compare.ts:93`) and returns `identical` for a non-truncated match. That channel omits the semantic prefix and the alphabet name that the module's own `identityKey` (`compare.ts:46`) treats as identity, so two values the engine itself calls `different` can produce byte-identical comparison text and be reported as the strongest affirmative verdict.

**Exploit scenario.** Alice holds `did:key:z6Mkha…` — a 48-character msid, 12 tokens, a full 3×4 grid with no blanks. Mallory mints `did:mallory:z6Mkha…` with the identical method-specific id and sends Alice the comparison text of his DID, the readout the tool itself promotes for out-of-band checking. Alice pastes it into `<EntvizCompare>`. `compareValues` correctly reports `different`, but `compareComparisonText` compares only the 12 cell tokens — derived from the shared core, and identical — and returns `identical`. Alice sees the green "Identical — the same value" banner plus two identical figures, and accepts Mallory's DID, which resolves to key material Mallory controls.

**Preconditions.**
- The attacker supplies the reference as comparison text — an officially supported reference format, promoted by "Copy comparison text", `pastePrompt`, and the read-aloud ceremony.
- The victim's value and the attacker's value share the same normalized core and tokenize identically (`did:key:<msid>` vs `did:<attacker-method>:<same msid>`, `urn:a:X` vs `urn:b:X`, or a bare base58 key vs `did:key:<same chars>`).
- The token count exactly fills the chosen grid, so there are no fingerprint-placed blank cells (12 tokens from a 45–48 character base64url msid; also 4, 6, 9, 16).
- The value is ≤512 bits; a truncated input returns `unknown` instead.

**Fix.** Do not let a comparison-text match alone reach `identical`. Either bind the compared channel to `identityKey`'s tuple — normalized core, alphabet name, semantic prefix — for instance by prefixing the canonical readout with the rendered label and comparing that; or demote a comparison-text match to `{state: "unknown", similar: true}` (walk-to-confirm) whenever `classifyInput(value).prefixSemantic` is true or the reference cannot be reconstructed into a value whose `identityKey` matches. Add a regression test for `did:a:X` versus `did:b:X`, and for a bare core versus `did:key:<core>`.

**Verification.** 3/3 lens verifiers confirmed.

### F9 — `EntvizPill` calls `characterize()` before `render()`'s cap, exposing the O(n²) decode to an unbounded string (MEDIUM, confidence medium)

**Impact.** Availability. A single pill rendering an attacker-chosen value freezes the browser's main thread, since React renders this memo synchronously, making the host page unresponsive; under SSR the same call blocks the rendering worker. The guard that was supposed to bound this — `MAX_INPUT_CHARS`, explicitly commented as an "Anti-DoS cap" — never runs, because `characterize` is invoked before `render`.

**Where.** `packages/react/src/EntvizPill.ts:307` in `EntvizPill`

**What.** The untrusted `value` prop, documented as content the host did not author, is handed to `characterize()` first, and `characterize` has no length guard. Core's anti-DoS cap at `entviz.ts:1854` only fires later inside `render()`, so the quadratic BigInt accumulator in `decodedBytesInteger` (`characterize.ts:97-110`) runs on strings the cap was written to reject.

**Exploit scenario.** An attacker publishes a credential or document whose identifier field is a ~1 MB run of base58-only characters that is not valid hex, base32 or bech32 — for example `9i` repeated. A viewer's app renders it in an `<EntvizPill>`. `characterize(value.trim())` classifies it as base58 (`entviz.ts:1327-1336`), and `sizeBitsFor` routes to `decodedBytesInteger`, which performs one BigInt multiply-add per character against an accumulator growing to roughly 6 million bits — about n²/2 limb operations. The tab hangs before `render()` ever reaches the 65536-character rejection. This code was not executed during the scan, so the wall-clock cost is reasoned from the algorithm, not measured.

**Preconditions.**
- Host renders `<EntvizPill value={...}>` with a value it does not control — the documented use case of identifiers pulled out of credentials or documents.
- The value is classified into a non-power-of-2 alphabet; base58 is reachable through the disproof detector, e.g. a long run containing both `9` and `i`, which disproves hex, base32 and bech32.
- No length pre-check by the host before passing the value.

**Fix.** Apply the `MAX_INPUT_CHARS` guard at the top of `characterize()` — and in `classifyInput`'s parsed branch, which today caps only the UTF-8 fallback path — or have `EntvizPill` reject or short-circuit an over-long `value` before the memo runs. Alternatively bound `decodedBytesInteger`, which only needs a byte length and can compute `ceil(len * log2(base) / 8)` for oversized inputs.

**Verification.** 3/3 lens verifiers confirmed.

### F10 — URL fetch follows redirects while the shown provenance origin is the pre-redirect origin (LOW, confidence medium)

**Impact.** The provenance string — which the component deliberately locks as non-overridable judgment-bearing copy (`VERDICT_LOCKED_KEYS`, lines 262-266) — and the `fetch.success` event both misreport where the reference bytes came from, so a user, or a host logging the event firehose, attributes attacker-controlled reference content to a trusted origin. The verdict engines are unaffected; the damage is limited to provenance and consent integrity.

**Where.** `packages/react/src/EntvizCompare.ts:557` in `onFetch`

**What.** `refOrigin` is parsed from the user-pasted URL and shown as the pre-fetch consent hint (line 676) and later as the locked provenance label, but `fetch()` uses the default `redirect: "follow"` and nothing re-derives the origin from `res.url`. Bytes returned from an arbitrary redirect target are therefore attributed to the origin the user approved.

**Exploit scenario.** A victim is told to fetch a reference entviz from `https://trusted.example/r?u=…`, an open redirect. The pre-fetch hint and the post-fetch label both read "From trusted.example", while the SVG or value actually served came from the attacker's host via the 302. The user believes a trusted party vouched for the reference they just compared against.

**Preconditions.**
- `allow.url` enabled (the default), and the user pastes a URL and clicks Fetch.
- The pasted URL's origin hosts a redirect the attacker controls — an open redirect, or an attacker-chosen URL the victim was talked into pasting.
- No host `fetchReference` is injected, so the built-in fetch path runs.

**Fix.** Re-derive the origin from the response (`new URL(res.url).origin`) and use that for `setRef({origin})` and the `fetch.success` event; or pass `redirect: "error"` or `"manual"` and require a fresh user confirmation showing the new origin before following a cross-origin redirect.

**Verification.** 3/3 lens verifiers confirmed.

## What was verified

An inventory partitioned the scope into eight components; a threat model was built per component; 28 researchers were dispatched across the component × category matrix and all 28 returned; one breadth sweep gap-filled what the matrix did not cover. That produced 44 raw candidates, deduplicated to 34. Every one of the 34 then faced a three-voter adversarial panel — 102 independent verifier votes in total — and 10 survived the 2-of-3 quorum; 24 were rejected, 16 of them unanimously. The confidence figures above are clamped by that vote: only findings a unanimous panel confirmed can claim `high`, which is why F2, F4 and F5 read `medium` regardless of how their researchers rated them. No candidate went unreviewed and no cap truncated the run. The revision stamp written alongside this report records the commit scanned, the effort tier, and the verification status the renderer derived from the vote record — read the status there rather than from this paragraph.
