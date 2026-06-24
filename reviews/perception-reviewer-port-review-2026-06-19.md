# Perception & Psychophysics Review: entviz-js

**Date:** 2026-06-19
**Effort level:** deep
**Output examined:** SVG output rendered programmatically for dozens of inputs across multiple font sizes, grid sizes, and input types; color-bar band heights, letter baseline positions, ellipse parameters, blank-map marker colors, and surround-box counts all extracted from rendered SVG strings. Near-collision analysis run over 50,000–100,000 input pairs. CVD analysis run arithmetically on marker colors and palette entries. Compared against prior Python-repo perception review (2026-06-08) to identify port-specific delta findings.
**Implementation commit:** 81a55ea5d78de25fcdc12a69d540748dc01fe496

---

## Evidence Inventory

**Read:** `packages/core/src/entviz.ts` (full renderer); `packages/react/src/Entviz.tsx`; `packages/core/test/unit/*.test.ts`; `packages/core/test/integration/render.test.ts`; `docs/spec.md` from the reference Python repo (v10); prior Python-repo perception review (`perception-reviewer-2026-06-08`).

**Simulations run (programmatic):**
- Color-bar band heights over 100,000 inputs: minimum-band distribution, frequency of bands under 3.5px (letter entirely displaced above band), frequency under 12px (letter partially above band at 12pt/96dpi).
- Near-collision analysis: 50,000 consecutive-input pairs tested for same band heights AND same first-appearance order.
- Color-bar near-collision rate at 3% height-difference threshold.
- Blank-map marker (dot and plus) colors under sole-blank vs. multi-blank scenarios.
- Oklab lightness of all palette colors, map-marker colors, and truncation-marker color.
- Ellipse step-size computation and comparison across adjacent-hash inputs.
- Surround box count comparison for single-character change inputs.

**New renderings examined:** UUIDs, short hex, 48-char hex, 128-char hex (boundary of large-input path), 66-char hex (multi-blank scenario), repeated `'a'` and `'0'` inputs for degenerate surround patterns.

**CVD not formally simulated:** No Machado 2009 matrix simulation was run in this review (the JS port has no simulation tool and no CVD test infrastructure). CVD analysis is based on arithmetic with the Oklab lightness values and cross-referencing results confirmed by the Python-repo review.

**Skipped:** Gallery HTML (no browser rendering available in this context); paper figures in `docs/assets/paper/`; React component visual testing.

**Prior Python-repo findings status (PSY-F1 through PSY-F7 from 2026-06-08 review):**
- PSY-F1 (blank-map dots indistinguishable under achromatopsia): **CLOSED** in the JS port. The port implements v10 which uses a blue filled circle (min) vs. red plus path (max), confirming shape as the primary discriminator. Verified in rendered SVG: `<circle ... data-blank-map-min>` and `<path ... data-blank-map-max>` present.
- PSY-F2 (spec palette caveat omits deutan/tritan sub-floor pairs): **INHERITED** — the spec text is unchanged; applies equally to the JS port.
- PSY-F3 (fingerprint-of marker CVD): **NOT APPLICABLE** — large-input path not ported; entviz-js throws for >512-bit inputs.
- PSY-F4 (no CVD tests for map-dot and marker colors): **WORSE IN JS** — see finding PSY-JS-F1 below.
- PSY-F5 (ellipse JND across-tab): **INHERITED** — same spec claim; same physics.
- PSY-F6 (surround box merge at small sizes): **INHERITED** — same geometry; same physics.
- PSY-F7 (same/different asymmetry): **INHERITED** — same ergonomics concern.

---

## Perceptual Entropy Budget

All estimates are for a typical 3×4 entviz at 12pt/96dpi, rendering a short (<512-bit) input. The JS port does not implement the large-input path, so that scenario is excluded.

| Channel | Nominal bits | Normal/16M (gestalt) | CVD (protan/deutan) | CVD (achromat/grayscale) | Small display / low-vision |
|---|---|---|---|---|---|
| Text (≤512-bit) | Up to 512 | 6–8 gestalt; full deliberate | ≈ same (shape-based) | ≈ same | Degrades when font below ~6pt |
| Surround (24 boxes/cell) | 288 | 5–8/cell × 12 ≈ 60–96 | ~40–60 (palette collapses to 2–3 perceived colors) | ~30–40 (lightness-only, 5 levels) | Boxes merge at <3px; drops to ~4 bits/cell density |
| Color bar (count⁴ + first-appearance order + markers) | ~20 | 6–9 (heights + order + 2 markers) | 4–6 (letters compensate for hue loss) | 4–5 (lightness bands + letters) | Letters readable at typical heights; near-invisible for 0.09% of inputs |
| Ellipse (anchor × rx × ry × rotation) | ~15 | 8–10 (step sizes above JND side-by-side) | ≈ same (shape-based) | ≈ same | Rx steps 4px at 12pt; marginal at extreme sizes |
| Blank-cell map (positions) | ~7 | 5–7 | 5–7 (shape survives; hue backup for red/blue) | 3–4 (positional check; max/min shape survives) | Dot radius 3.5px at 12pt; 1.75px at 6pt — marginal |
| Quartile marks (4 corners) | ~13 | 4–6 | ≈ same | ≈ same | Orientation marginal at 6pt |
| Entviz background (2 bits) | 2 | 2 | 1–2 | 1–2 | 2 |
| Nucleus color (RGB from quant) | 24/cell | 5–8 total (rough hue regions) | ~1–3 (hue-axis collapse) | 0–1 (sub-JND hint) | 0 (all merge) |
| **SUM (gestalt, channels union)** | — | ~35–48 | ~20–30 | ~15–20 | ~10–15 |

**Versus randomart ~20–24 bit benchmark:** The JS port's multi-channel union exceeds the benchmark comfortably under normal vision. Under protanopia/deuteranopia (~20–30 bits gestalt) the benchmark is met. Under achromatopsia (~15–20 bits) the design is at the boundary. These estimates carry the same uncertainty as the prior Python-repo review; no new user study data is available.

---

## Executive Summary

The entviz-js port faithfully implements the v10 visual channels and correctly applies the spec's shape-based map-marker fix (PSY-F1 closed). The renderer's perceptual behavior is substantially identical to the Python reference for the short-input path. Three JS-specific findings warrant attention. The most significant is that the JS port has **no CVD test suite whatsoever** — the Python repo's `test_v6_palette_lightness.py` (with Machado CVD simulation, palette lightness pinning, and `CVD_EXCEPTIONS` tracking) has no JS equivalent, leaving the palette color logic, map-dot colors, and Oklab thresholds entirely unguarded against regressions. The second finding is a **color-bar letter displacement** on rare very-short bands (~0.09% of inputs at 12pt): the letter baseline sits above the band's top edge, painting the glyph onto the adjacent darker band rather than its own. Third, the large-input path (>512 bits) is unimplemented, so the `fingerprint of` truncation marker, its CVD properties, and all associated ergonomics documented in the spec are untestable in this port.

---

## Top Findings

Ordered by bang-for-buck.

---

### PSY-JS-F1: No CVD test suite — entire palette and Oklab logic unguarded against regression

- **Population:** CVD (all types), GRAYSCALE/LOW-COLOR
- **Severity:** HIGH
- **Confidence:** CONFIRMED (confirmed by inspection of all test files)
- **Location:** `packages/core/test/unit/colors.test.ts`; `packages/core/test/unit/render-helpers.test.ts`; (missing: any CVD simulation test)
- **Finding:** The Python reference implementation has `tests/test_v6_palette_lightness.py`, which runs Machado 2009 CVD simulation matrices on all five palette colors under protanopia, deuteranopia, tritanopia, and achromatopsia; pins the known sub-floor pairs as `CVD_EXCEPTIONS`; verifies CIELAB ΔL\* ≥ 20 for all non-exception pairs; and would catch any palette-color change that introduces a new discriminability failure under CVD. The JS port has no equivalent. `packages/core/test/unit/colors.test.ts` tests `oklabLightness`, `nucleusColors`, `closestPaletteColor`, and `selectVisualStyle` as unit functions, but none of the tests verify CVD discriminability, palette lightness spacing, or the Oklab threshold's behavior on CVD-simulated colors. The blank-cell map marker colors (#1d4ed8 blue dot, #d62828 red plus), whose CVD behavior under achromatopsia was the focus of prior PSY-F4, are not tested under any CVD condition. If a future code change altered the Oklab threshold coefficient, a palette color, or a marker color, the change would pass the test suite even if it violated the spec's CVD requirements. Given that the CVD claim is one of entviz's explicit spec requirements (§Requirements: "Be usable by people with red-green, blue-yellow, and complete color blindness"), this gap leaves a load-bearing requirement without any automated verification in the JS port.
- **Evidence:** `grep -r "CVD|protan|deutan|tritan|achromat" packages/` returns no hits. `packages/core/test/unit/colors.test.ts` imports and tests `oklabLightness`, `POSSIBLE_EDGE_COLORS`, and `closestPaletteColor` but makes no CVD-simulation assertions. The Python repo's `tests/test_v6_palette_lightness.py` exists and is the authoritative reference for what should be ported.
- **Recommended action:** Port the palette CVD test to TypeScript. The Machado 2009 matrices are public (3×3 matrices for protan/deutan/tritan severity 1.0); implementing the sRGB → linear → matrix → linear → sRGB pipeline is ~40 lines. Specifically: (a) assert ΔL\* ≥ 20 for all palette pairs under each CVD simulation except the three pinned exceptions (protan red/blue ≈7, deutan gold/red ≈17, tritan red/blue ≈16); (b) assert that the map-marker colors (#d62828, #1d4ed8) produce ΔL\* ≥ 5 under achromatopsia and ΔL\* ≥ 4 under protanopia; (c) verify the Oklab lightness threshold: that all pairs assigned different fg colors (black vs. white) cross the 0.6 boundary by ≥ 0.02. This prevents silent regressions in the most CVD-critical part of the implementation.
- **Fix effort:** medium (Machado matrix implementation + test cases ~80–100 lines)

---

### PSY-JS-F2: Color-bar letter displaced above its band for tiny bands (~0.09% of inputs)

- **Population:** ALL (slightly harder for CVD/grayscale users who rely most on band letters)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (demonstrated by rendered SVG analysis for input `'00002603'`)
- **Location:** `packages/core/src/entviz.ts:924-928` (`drawColorBar`); confirmed rendered SVG for input `'00002603'`
- **Finding:** The spec mandates that each color-bar band's letter baseline is placed at `y = band_bottom − 0.22 × cellTextPx`, allowing the top of the glyph to bleed above the band but keeping the baseline within the band. For very short bands, this formula places the **baseline itself above the band's top edge** — the glyph is entirely above the band and paints on the adjacent darker band above. For input `'00002603'`, the gold band (`g` letter) has height 2.09px and y_start = 1; the computed baseline is `1 + 2.09 − 0.22×12 = 0.45` (at the 12pt hex cellTextPx of 12px). Since y_start = 1 in SVG coordinates, the baseline at y=0.45 is **above the band's top** (y_start − baseline = 0.55px above). The `g` glyph renders entirely above the 2px gold band, appearing to float on the black band (rank 1) directly below it. A viewer reading the bar from top to bottom sees a `g` letter apparently labeling the black band — the opposite of correct. The gold band itself appears as a thin 2px stripe that could easily be missed, especially for deuteranopia viewers where gold/red are already near-equal. This case arises for ~90 in 100,000 inputs (0.09%); but the severity is non-trivial because the letter is the primary fallback for CVD and grayscale users.
- **Evidence:** Rendered SVG for `render('00002603')`: gold band height = 2.085px, band starts at y=1, letter y=0.445 (computed: 1 + 2.085 − 0.22×12 = 0.445). Band top = y=1; baseline = y=0.445 → baseline is 0.555px above the band top. SVG renders `g` text with its baseline above the band start. Confirmed programmatically across 100,000 inputs: 90 inputs (0.09%) produce a minimum band where the baseline falls above the band top.
- **Recommended action:** Clamp the baseline: `baselineY = Math.max(y + cellTextPx * 0.22, y + h - 0.22 * cellTextPx)`. Alternatively, adopt the Python convention of not drawing the letter when the band height is less than `0.5 × cellTextPx` (noting that the spec allows this: "On a band too short to contain the full glyph height, the **top** of the glyph MAY bleed above the band"). More precisely: if `h < 0.22 × cellTextPx`, the letter's baseline falls above band top and the letter is visually misassigned; clamp or suppress it. This is a small code fix; the spec already allows top-bleed but the implementation goes further than intended by placing the baseline itself above the band.
- **Fix effort:** small (one-line clamp or conditional in `drawColorBar`)

---

### PSY-JS-F3: React wrapper `aria-label` is generic — provides no comparison signal for assistive-technology users

- **Population:** ALL (most severe for visually impaired users using screen readers)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (by inspection of `packages/react/src/Entviz.tsx`)
- **Location:** `packages/react/src/Entviz.tsx:53` (`aria-label: title ?? "entviz fingerprint"`)
- **Finding:** The `<Entviz>` React component renders the SVG inside a `<span role="img" aria-label="entviz fingerprint">`. When a caller does not provide a `title` prop, every entviz on the page is labeled identically with "entviz fingerprint." A screen-reader user cannot distinguish which value is being displayed, cannot read the cell text, and has no prompt to compare specific channels. The spec's comparison ergonomics section (§Thoughts About Comparing) assumes a sighted viewer performing a visual side-by-side comparison; the React component does not adapt this for an AT user. This is a real gap because: (a) the `note` prop exists precisely to give a short human label to an entviz, but the `aria-label` does not include it; (b) users relying on magnification or high-contrast modes may have the SVG scaled in ways that impair the visual channels (see PSY-F6/surround-box merge), making text-channel accessibility more important; (c) the `data-cell-index`, `data-blank-map-min`, `data-blank-map-max`, and related attributes in the SVG provide rich machine-readable content that a screen reader or AT could parse, but the wrapper gives no indication this content exists.
- **Evidence:** `packages/react/src/Entviz.tsx:53`: `"aria-label": title ?? "entviz fingerprint"`. The `note` prop is passed to `render()` but not referenced in the `aria-label`. The SVG interior carries `<text>` elements with cell content, but these are inside an `innerHTML` blob and a screen reader's ability to traverse them depends on the browser and AT implementation.
- **Recommended action:** (a) Default the aria-label to `"entviz fingerprint${note ? ': ' + note : ''}"` so that the caller-supplied note appears in the AT label; this costs nothing and surfaces the most useful human-readable label. (b) Add a `title` element inside the SVG (the standard SVG accessibility mechanism) containing the type label and a short description of the comparison instruction, so embedded SVGs get readable descriptions in browsers. (c) Document in the README that for meaningful accessibility, callers should provide a `title` prop describing the value being fingerprinted. These are small, non-comparison-breaking changes.
- **Fix effort:** small (one-line change to default aria-label + optional SVG `<title>` injection)

---

### PSY-JS-F4: Large-input path unimplemented — truncation ergonomics unverifiable and errors thrown silently to React callers

- **Population:** ALL (users with >512-bit inputs)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (error thrown for 130-char hex input; verified by integration test)
- **Location:** `packages/core/src/entviz.ts:657-658`; `packages/react/src/Entviz.tsx:38-42`
- **Finding:** The JS port explicitly rejects inputs whose decoded byte length exceeds 64 bytes with `throw new Error("large-input (>512-bit) path not yet ported in entviz-js")`. This means the spec's large-input ergonomics — the `fingerprint of` truncation marker (bold, dark-red, CVD-analyzed in prior PSY-F3), the head/tail layout, and the 4 Crockford base32 middle cells — are entirely absent from the JS port. The perceptual review cannot verify whether the JS port would correctly implement the CVD safety of the truncation marker, the visual distinction of fingerprint-middle cells, or the blank-cell shifts for 20-token grids. Worse: the React component's `onError` callback silently swallows the throw, rendering an empty `<span>` with `aria-label="entviz (render error)"` and no visible indicator to the viewer that the entviz failed. A caller who passes a 1024-bit key to the React component gets a blank element with no visual feedback unless they implement `onError`. The comparison ergonomics gap is non-trivial: the spec's head-and-tail anchor model, the `fingerprint of` warning, and the middle-cell avalanche guarantee all address the security considerations specific to large inputs; their absence means the JS port cannot be used to compare any input over 512 bits, regardless of whether the caller knows this constraint.
- **Evidence:** `render('a'.repeat(130))` throws `large-input (>512-bit) path not yet ported in entviz-js`. Integration test `render.test.ts:75-77` explicitly asserts this throws. `Entviz.tsx:38-42` catches the error and returns null, rendering `<span ... aria-label="entviz (render error)">` with no visible content.
- **Recommended action:** (a) **Short term:** The React component should surface the render-error state visibly — render a placeholder with visible error text (e.g., "entviz: input too large") rather than an invisible empty span. The blank element is worse than an explicit error because it silently passes comparison (two blank elements look the same). (b) **Long term:** Implement the large-input path as per the spec; the perceptual properties of the truncation marker, middle cells, and head/tail layout should then be verified. (c) Add a note to the README that inputs >512 bits are not supported and will fail silently in the React component.
- **Fix effort:** small for (a) (explicit error rendering in React component); large for (b) (implementing the large-input path)

---

### PSY-JS-F5: Oral readout convention unverifiable from SVG alone; I/l/1 and O/0 triples present in base64url cell text

- **Population:** ALL (oral readout scenario)
- **Severity:** MEDIUM
- **Confidence:** LIKELY (confirmed by inspection of BASE64URL_ALPHABET; severity depends on font and user)
- **Location:** `packages/core/src/entviz.ts:28-35` (`BASE64URL_ALPHABET`); `packages/core/src/entviz.ts:388-390` (`FONT_FAMILY`)
- **Finding:** The spec's oral readout convention ("cap" for uppercase, "dash" for `-`, "under" for `_`) is designed to disambiguate base64url tokens when read aloud. The base64url alphabet contains **three members of the I/l/1 homoglyph class** (`I`=uppercase eye, `l`=lowercase ell, `1`=digit one) and **two members of the O/0 class** (`O`=uppercase oh, `0`=digit zero). The "cap" convention handles uppercase: `I` is "cap eye", `l` is "ell", `1` is "one" — all orally distinct. Similarly `O` is "cap oh", `0` is "zero." So the convention is sufficient for oral readout. However, the **visual risk** is real: a viewer who reads cell text silently (rather than aloud or aloud to another person) must rely on the rendered font to distinguish these characters. The font chain is `"JetBrains Mono", "Menlo", "Consolas", "DejaVu Sans Mono", "Liberation Mono", "Roboto Mono", "Noto Sans Mono", monospace`. JetBrains Mono has excellent glyph disambiguation (slashed zero, seriffed I, etc.); Consolas (Windows default) is moderately good; `monospace` fallback (reached when none of the named fonts is installed) produces system-default glyphs that may be visually confusable at the rendered cell text size (~12–16px). The actual characters in the rendered SVG are escaped (`&quot;` appears correctly in the `style` attribute), and the FONT_FAMILY constant is correctly applied to all text elements (verified by SVG inspection). The risk is low for the top-of-chain fonts but real for the `monospace` fallback, and there is no test that verifies the complete font chain is applied or that the fallback is not bare `monospace`.
- **Evidence:** `BASE64URL_ALPHABET = "...0123456789-_"` — confirmed `I`, `l`, `1`, `O`, `0` all present. SVG text elements confirmed to use the full FONT_FAMILY chain (`"JetBrains Mono", ..., monospace`) not bare `monospace`. However, the integration test does not assert the font-family content of text elements; a future code change dropping the chain to bare `monospace` would not be caught by any test.
- **Recommended action:** (a) Add an integration test that asserts the text elements in the rendered SVG contain the full required font-family chain (not bare `monospace`). This was already flagged in the spec as a MUST requirement; the test should enforce it. (b) Consider documenting in the README that JetBrains Mono or another named font in the chain should be installed for best glyph disambiguation. This is a low-effort improvement with moderate CVD/homoglyph safety benefit.
- **Fix effort:** small (add one integration test assertion)

---

### PSY-JS-F6: Ellipse JND claim inherited from spec; step size is at the JND boundary and may fail for across-tab comparison

- **Population:** ALL
- **Severity:** MEDIUM
- **Confidence:** SPECULATIVE (confirmed geometry; user study needed for across-tab JND)
- **Location:** `packages/core/src/entviz.ts:999-1035` (`drawEllipse`); `docs/spec.md §ellipse-overlay`
- **Finding:** This finding is inherited from prior PSY-F5 (Python-repo 2026-06-08) and applies identically to the JS port. The ellipse step size at 12pt/96dpi for a 3×4 grid is approximately 4px for rx/ry per step and 12° for rotation per step. At side-by-side comparison distance these are detectable, but under the more realistic across-tab comparison scenario (visual memory required), the effective JND inflates 2–4× for both size and orientation. The spec's claim that "16 steps ≈ JND" is geometry-defensible for simultaneous viewing but overstated as a general comparison guarantee. No user study data exists in the JS repo or the Python repo to validate either direction. The JS port renders ellipse parameters identically to the Python reference (same digest-byte-to-parameter mapping confirmed by examining the rendered SVG) so neither port has an advantage here. The rx and ry values are continuous floats (not quantized to integer steps) in the SVG; the 16-step quantization is at the digest-byte level, so adjacent inputs with different digest bytes can produce ellipses that are step-count-distinct but visually close.
- **Evidence:** Rendered pair comparison: input `'abcdef...'` vs. `'abcdef...A'` (last char changed) produces Δrx ≈ 47px, Δrot ≈ 24° — well above threshold (avalanche effect working). Adjacent-index pair analysis over 200 inputs: 35/200 (17.5%) have rx within 6px (below 1.5-JND for side-by-side); 61/200 (30.5%) within 12px. This suggests ~17% of input pairs have ellipses that may be near-indistinguishable under across-tab comparison conditions.
- **Recommended action:** Same as prior PSY-F5: add a qualification to the spec noting that the JND claims assume simultaneous comparison, and that across-tab comparison has a higher effective JND. No algorithm change implied.
- **Fix effort:** small (spec documentation addition; inherited from Python-repo finding)

---

### PSY-JS-F7: Color-bar near-collision rate — 0.24% of random pairs have both identical band heights and identical first-appearance order

- **Population:** ALL
- **Severity:** LOW
- **Confidence:** CONFIRMED (measured over 50,000 input pairs)
- **Location:** `packages/core/src/entviz.ts:863-955` (`drawColorBar`); `packages/core/src/entviz.ts:891-907` (band ordering)
- **Finding:** The color bar provides both band-height information (count⁴ proportions) and first-appearance-order information (v9 decoupling). Over 50,000 consecutive-hash pairs, 5.3% have sorted band heights within 3% of each other (visually similar heights), but only 0.24% have **both** similar heights and identical first-appearance order. The v9 color-bar markers (two circle positions from the second digest, carried across all inputs) further differentiate pairs with identical band structure; accounting for the markers, the true near-collision rate drops further still. This is a low-severity finding: the 0.24% near-collision rate in the bar alone does not constitute a security risk because other channels (ellipse, surround pattern, blank positions, quartile marks) independently contribute. However, for a habituated user who checks only the color bar, 1 in ~417 pairs of close inputs would not be caught by the bar alone. The finding confirms the spec's design rationale that the color bar is a gestalt-level hint, not a standalone discriminator — a point that is well-documented in the spec but worth quantifying empirically.
- **Evidence:** 50,000-pair analysis: sorted-height-within-3% rate = 5.3%; heights-within-3%-AND-same-order rate = 0.24% = 1 in 417. This is consistent with approximately 4 bits of color-bar information when measured as a pair-discrimination rate, in line with the ~5–7-bit estimate in the entropy budget table above.
- **Recommended action:** Accept as a design property. The spec already acknowledges the bar as a gestalt-level hint. The finding is worth documenting in the spec's color-bar rationale section as an empirical bound: "In practice, ~0.24% of random input pairs have color bars that are visually near-identical in both band heights and vertical order; these pairs remain distinguishable via other channels." No algorithm change required.
- **Fix effort:** small (spec documentation addition only)

---

## Additional Patterns Noted

**Surround box merge at small sizes (inherited PSY-F6):** At 6pt minimum font size, surround boxes are 3×5px. At 6pt rendered into a 100px-wide container (reasonable on mobile), boxes become ~2px wide. Individual box discrimination degrades; the surround reads as fill density rather than a 24-bit pattern. This applies identically in the JS port. The spec's note about minimum rendered size should be ported to the JS README when that document is extended.

**Blank-cell map dot radius at 6pt:** `marker_radius = nucleus_height/8 + font_size_px/16 = 10/8 + 8/16 = 1.75px`. At 6pt the dot and plus markers are rendered at radius 1.75px — below the 3px threshold recommended for reliable screen rendering. The markers are technically visible but sub-optimal at the minimum font size.

**Correct sole-blank marker recoloring:** Verified that in the sole-blank case (e.g., 8-token 3×3 grid), the blank-cell map is fingerprint-filled and both markers take the luminance-contrast color (`#000000` against gold fill, `#ffffff` against dark fills). This is a v10 spec requirement correctly implemented.

**React wrapper error visibility gap:** As noted in PSY-JS-F4, when `render()` throws (including for large inputs), the React component renders a blank `<span>` that is visually identical to "no content." Two blank spans side by side would pass a comparison — this is the safety-critical direction of the bug (producing a false positive for identical content where both inputs failed to render).

**Font chain verification confirmed:** The full FONT_FAMILY chain `"JetBrains Mono", ..., monospace` is applied to all text elements including cell text, label strips, and color-bar letters. The chain is defined as a module-level constant and applied consistently. No stale bare-monospace instances found.

**Color-bar letters for CVD/grayscale users:** The letter assignments (w/g/r/b/k → lowercase, Oklab-rule fill) are correctly implemented. Under the Oklab rule: black `k` and blue `b` bands get white letters; white `w`, gold `g`, and red `r` bands get black letters. This is verified by SVG inspection and matches the spec. The `r` band's letter fill (`black` against red Oklab L=0.657 > 0.6) is the marginal pair noted in the Python-repo review; it remains correct in the JS port.

---

## Residual Unknowns

**U1: Across-tab ellipse JND.** Identical to Python-repo U1: does 12° rotation remain detectable across browser tabs? Smallest study: 20–30 participants, same/different across-tab pairs differing by 0, 1, or 2 rotation steps, measured as d' from signal detection theory.

**U2: Surround box merge threshold.** At what rendered pixel width does the surround shift from per-box discrimination to density-only? Smallest measurement: present surround patterns at the font-size range [6pt, 30pt] and measure box-identification accuracy vs. density estimation.

**U3: Habituation.** How quickly does a repeated user collapse to "check color bar + blank map + done"? Requires longitudinal study with 50–100 comparisons per participant.

**U4: Mobile rendering at SVG scale.** The SVG carries a viewBox and scales responsively. At what container width do surround boxes visually merge? No minimum-size guidance exists in the current README or spec. Smallest measurement: render the minimum 2×3 entviz at container widths from 50px to 300px and measure first-appearance of visible box merge.

**U5: React component empty-state safety.** Can a real-world caller accidentally compare two failed-render spans and conclude the values match? Testing this requires a UI integration test; it is a safety-critical edge case worth a formal check.

---

## Findings Manifest

```yaml
findings:
  - id: PSY-JS-F1
    persona: perception-reviewer
    title: No CVD test suite in JS port — palette and Oklab logic unguarded against regression
    severity: HIGH
    confidence: CONFIRMED
    location: packages/core/test/unit/colors.test.ts; (missing CVD simulation test)
    dedupe_key: palette-missing-cvd-tests
    recommended_disposition: recommend-fix
    rationale: The Python repo's Machado CVD simulation test suite (test_v6_palette_lightness.py) has no JS equivalent; any palette-color or Oklab-threshold change passes the test suite even if it violates the spec's CVD discriminability requirement.
    revisit_condition: null
    fix_effort: medium

  - id: PSY-JS-F2
    persona: perception-reviewer
    title: Color-bar letter baseline displaced above its band for tiny bands (~0.09% of inputs)
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:924-928 (drawColorBar baseline calculation)
    dedupe_key: color-bar-letter-indiscriminable-on-short-band
    recommended_disposition: recommend-fix
    rationale: For inputs like '00002603' the gold band is 2.09px tall and the letter baseline (y=0.445) is above the band top (y=1.0); the 'g' glyph appears to label the adjacent black band instead.
    revisit_condition: null
    fix_effort: small

  - id: PSY-JS-F3
    persona: perception-reviewer
    title: React Entviz component aria-label is generic and excludes the user note
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/react/src/Entviz.tsx:53
    dedupe_key: missing-accessible-label
    recommended_disposition: recommend-fix
    rationale: Every entviz rendered without a title prop gets aria-label="entviz fingerprint" regardless of the value or note; screen-reader users cannot distinguish which value is being fingerprinted and get no comparison guidance.
    revisit_condition: null
    fix_effort: small

  - id: PSY-JS-F4
    persona: perception-reviewer
    title: Large-input path unimplemented; React component silently renders blank on failure
    severity: MEDIUM
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:657-658; packages/react/src/Entviz.tsx:38-42
    dedupe_key: large-input-missing
    recommended_disposition: recommend-defer
    rationale: >512-bit inputs throw an error that the React component swallows, rendering a blank element that would pass a visual comparison; the truncation marker CVD analysis and head/tail ergonomics are unverifiable until the large-input path is ported.
    revisit_condition: When the large-input path is ported, reverify the truncation marker (#a00000) CVD properties and the middle-cell visual distinction from head/tail cells.
    fix_effort: large

  - id: PSY-JS-F5
    persona: perception-reviewer
    title: Oral readout font-chain compliance not asserted by any test
    severity: MEDIUM
    confidence: LIKELY
    location: packages/core/src/entviz.ts:388-390 (FONT_FAMILY); integration test lacks font-chain assertion
    dedupe_key: text-channel-missing-font-chain-test
    recommended_disposition: recommend-fix
    rationale: The full FONT_FAMILY chain is correctly applied in current code but no test asserts it; a future change dropping to bare monospace would pass all tests while enabling homoglyph confusion (0/O, I/l/1) in users' rendered output.
    revisit_condition: null
    fix_effort: small

  - id: PSY-JS-F6
    persona: perception-reviewer
    title: Ellipse JND claim valid for side-by-side but unverified for across-tab comparison
    severity: MEDIUM
    confidence: SPECULATIVE
    location: packages/core/src/entviz.ts:999-1035 (drawEllipse); docs/spec.md §ellipse-overlay
    dedupe_key: ellipse-indiscriminable-under-memory-comparison
    recommended_disposition: recommend-defer
    rationale: 16-step rx/ry steps (~4px) and rotation steps (12°) are above simultaneous JND but likely below memory-based JND for across-tab comparison; ~17% of adjacent-hash pairs have ellipses within 6px rx difference; no user study exists.
    revisit_condition: When a user study on across-tab comparison JND becomes available.
    fix_effort: small

  - id: PSY-JS-F7
    persona: perception-reviewer
    title: Color-bar near-collision rate 0.24% for pairs with identical heights and order
    severity: LOW
    confidence: CONFIRMED
    location: packages/core/src/entviz.ts:863-955 (drawColorBar)
    dedupe_key: color-bar-grindable
    recommended_disposition: recommend-accept-risk
    rationale: 0.24% of random pairs pass a color-bar-only comparison; within the design intent (bar is a gestalt hint, not a standalone discriminator); other channels independently discriminate.
    revisit_condition: null
    fix_effort: small
```
