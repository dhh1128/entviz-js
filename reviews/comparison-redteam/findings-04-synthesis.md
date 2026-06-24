# Consolidated Red-Team Synthesis — entviz Comparison Feature

**Lead security architect, integrating three independent lenses** (cryptography/protocol = findings-01; usable-security/ceremonies = findings-02; rendering/forensics = findings-03). I owe the design no deference. All three lenses, working independently, converged on the **same load-bearing failure from three different directions** — that convergence is itself the strongest signal in this review.

Citations: spec = `entviz/docs/spec.md` (verified in source); paper = `entviz/docs/entviz-paper.md`; TM = `entviz/docs/threat-model.md`; decisions A–G from `00-common-brief.md`. F-numbers cite the underlying reports as **C-Fn** (crypto/findings-01), **U-Fn** (usable/findings-02), **R-Fn** (rendering/findings-03).

> **Source adjudications (verified before writing):**
> - **F2/F3 (crypto) confirmed**: paper §5.2 explicitly ties uniformity to `log₂C(K,L)` bits, says commitment "removes the last mover's advantage," and says above-threshold "what then defends the comparison is that the value was committed *before* the seed was drawn, not the seed's size." Example is K=20,L=5.
> - **F7 (crypto) confirmed**: spec equivalence = render model (Tier A) AND raster (Tier B); render model is the full field set; closed profile enforces element types only.
> - **F1/F3 (rendering) confirmed**: spec — Tier B explicitly excludes text-glyph regions; homoglyph risk "real and security-relevant."
> - **One demotion**: spec says checkers recover surround bits from `data-surround-bits` "not by measuring box geometry" — but that is for *trusted golden* conformance; Tier B *does* verify box pixels against the golden raster. So F6/N2's "declared attributes need not match ink" overstates against a self-rendered golden. The real gap: the comparison feature has **no golden** — adjudicated below.

---

## EXECUTIVE VERDICT

**SOUND-WITH-FIXES, but the fix list contains items that change the protocol's default, not just its polish — and until they land, two of the feature's three positive-verdict paths can be driven to a false "verified" with no preimage.** The architecture is right and the *fail-safe* instincts are excellent (DIFFERENT is definitive; raster can never bless; ring drawn around not over; closed profile). But the design's single central thesis — **"soundness is anchored in the unmatchable text channel, therefore commitment can be dropped"** (decisions D, E, F) — **does not survive contact.** It was attacked independently by all three lenses and broke in all three:

- **Crypto (C-F1, C-F3):** "unmatchable" is a *collision* property; the live walk is a *substitution/relay* game where the attacker authors the value and matches every cell for free. Dropping commitment re-opens the last-mover steering advantage that paper §5.2 explicitly closes — verified at source: paper §5.2 says commitment, *not* seed size, "is what removes the last mover's advantage."
- **Usable (U-F1, U-F2, U-F5):** "unmatchable" is a property of *bytes*; the human transfers *a noisy read*. Homoglyph/case-drop over voice converts an unmatchable cell into a confusable one, and the meter credits nominal bits as if the read were perfect.
- **Rendering (R-F1, R-F3):** "unmatchable" is a property of *characters*; every engine and every eye operates on *glyphs and `<text>` bytes*, and the spec itself (Tier B text-glyph exclusion; homoglyph admission) hands the attacker the gap.

**The thesis is true only inside a narrow envelope the feature neither states nor enforces:** the value is *locally generated* (not attacker-authored), the order is *committed and uniform*, the read is *case-explicit, homoglyph-clean, complete, and attentive*, and the SVG's *glyphs are verified against its `<text>`*. Make those five conditions enforced rather than assumed and the text anchor becomes real and the design is strong. Leave them assumed and the worst outcome in the brief — a false "no difference / verified" — is reachable by a T1+T6 attacker.

**No core *rework* of the entviz artifact is needed** — every break is in the *comparison feature*, not the spec. But two "must-fix" items reverse a stated decision (reinstate commitment as the live default; gate any affirmative verdict on a hard text floor), so this is not a cosmetic pass.

---

## PRIORITIZED FINDINGS TABLE (deduplicated & adjudicated)

| # | Sev | Finding (merged) | Lenses |
|---|-----|------------------|--------|
| **S1** | **CRITICAL** | **Text-anchored soundness fails in the substitution/relay case**: attacker authors/relays both compared values, so no honest target exists to collide and every "unmatchable" text cell is matched for 0 bits. Dropping commitment then lets the last mover steer the seeded order (paper §5.2). | C-F1, C-F3, U-F5, R(F3 feeds) |
| **S2** | **CRITICAL** | **Human read-error voids the text anchor**: homoglyph (`0/O`,`1/l/I`,`5/S`) + case-drop over voice convert unmatchable cells into confusable ones; attacker grinds for a *confusable* (not byte-equal) neighbor of the few cells a walk credits. Meter credits nominal, not effective, bits. | U-F1, U-F2, R-F1, R-F3 |
| **S3** | **CRITICAL** | **SVG engine trusts `<text>`/`data-*` over ink**: value-level reconstruction reaches IDENTICAL from an attacker-authored SVG whose declared characters ≠ displayed glyphs (invisible overpaint, `@font-face` swap, `dx/dy/transform`). Tier B *excludes* glyph pixels; closed-profile checks element types only. No preimage required. | R-F1, R-F2, R-F6, C-F7 |
| **S4** | **HIGH** | **Dropping commitment is unsound even with text-anchoring**: contradicts paper §5.2/§6.2 directly; text-anchoring presupposes unmatchable cells (S1) + uniform order (S5) + attentive read (S2), all of which other findings break. Steering grinds a nonce in ms (conceded in decision E). | C-F3, U-F6, R(F3 feeds) |
| **S5** | **HIGH** | **~14-bit seed is sized for *Quick* and under-provisions Strong/Paranoid**: required uniformity entropy is `log₂C(K,L)`, which rises to 17–21 bits at high presets. "Paranoid" can be *less* uniform than "Quick" (inversion). Human seed-transfer loss + screen-share observation push realized entropy below floor. | C-F2, C-F4, U-F6, U-N2 |
| **S6** | **HIGH** | **"N bits = 1 in 2^N" meter assumes channel independence the single-digest gestalt violates**: surround/color-bar/ellipse/blank-map/quartile are all functions of one SHA-512(core); summing their bits over-credits beyond the §4.3.9 joint gestalt ceiling (20–40 bits total). Only text cells + second-digest middle + bar markers add independently. | C-F6, C-N3, U-F3 |
| **S7** | **HIGH** | **Gestalt channels are cheap to grind (≤~200 evals each)**; with a steered/non-uniform order, a *Quick* bit-target can be exhausted on attacker-matched gestalt before any text cell is scheduled. "Reaches verified primarily via text" is an assertion about a uniform order S4/S5 break. | C-F5, U-F4, U-F5 |
| **S8** | **HIGH** | **Click-harvest over-estimates entropy & leaks on screen-share**: `performance.now()` is clamped (Spectre, ≤~8 bits), click position is center-biased (~6–9 bits); on a screen-shared live call the attacker *observes* the gesture and code, collapsing harvested entropy → ~0 and restoring last-mover steering. | C-F4, U-N2 |
| **S9** | **HIGH** | **Habituation / will-they-walk-at-all**: forced [Matches]/[Differs] relocates habituation rather than defeating it; a Quick-trained click-through reflex transfers to Strong/Paranoid (cross-session). A rubber-stamping human provides 0 effective bits, collapsing the §5.2 bound regardless of seed/commitment. | U-F4, U-N1 |
| **S10** | **HIGH** | **Raster fidelity self-probe certifies fidelity, not authenticity**: probe regions (`#ffffff`,`#808080`, palette bands) are input-independent constants an attacker paints exactly while hand-painting wrong text (un-OCR'd). Probe-pass then licenses a downstream walk to inherit "gestalt confirmed" trust on a wrong-text image. | R-F4, C-F8, R-N4 |
| **S11** | **MEDIUM** | **Pasted-SVG → IDENTICAL contradicts spec equivalence relation**: equivalence = render-model **and** raster, full field set; >512-bit core is *unrecoverable* from cells (only head/tail + 96-bit second-digest), so IDENTICAL is impossible there yet decision A lists "pasted SVG" without the ≤512 caveat. Self-inconsistent ("chimera") SVG → IDENTICAL on `V` while pixels show `V'`. | C-F7, C-N2, R-F6, R-N2 |
| **S12** | **MEDIUM** | **Auto-detect routes polyglots to the most permissive engine**: SVG (can reach IDENTICAL) vs raster (never EQUAL) asymmetry is steerable; a polyglot/late-binding/`foreignObject` reference can be classified as trusted SVG. Mode collapse also hides the machine-IDENTICAL-vs-live choice and steers users to an attacker-chosen reference. | R-F2, R-F6, U-F7 |
| **S13** | **MEDIUM** | **"NO DIFFERENCE · N bits" reads as "match"**: the probabilistic/definitive distinction — the most important one in the four-state model — is exactly the nuance habituation strips ("green-check" problem). Contradicts paper §4.3.9's refusal to claim nominal bits. | U-F3, C-F6 |
| **S14** | **MEDIUM** | **Focus-ring overlay can be misaligned**: drawn *off* the SVG (to preserve closed profile, decision G) in host coordinate space; an attacker-controlled CSS `transform`/zoom on the responsively-scaled entviz shifts the ring to the wrong cell. Closed-profile virtue is exactly what prevents authoritative pixel-locking. | R-F8 |
| **S15** | **MEDIUM** | **Nucleus disproof dies under lossy pipelines**: 4:2:0 chroma subsampling / screen-share codecs erase the sub-JND low-order RGB bits the raster engine samples; a true small-difference value survives as NO-DIFFERENCE. Spec itself calls nucleus a non-primary hint. | R-F5 |
| **S16** | **MEDIUM** | **Text-unmatchability fails for low-entropy / attacker-controlled / bit-extended inputs**: attacker-chosen value = 0 bits; structured IDs (snowflake prefix) ≪24 bits/cell; bit-extended final token = 20 not 24 bits; >512-bit middle = 96-bit barrier *for collision only*, 0 for substitution. Meter must credit actual min-entropy. | C-F10, U-F11 |
| **S17** | **MEDIUM** | **Endpoint-trust / "sameness ≠ trustworthiness" boundary is a comprehension failure**: honestly stated (decision F) but users over-trust the affirmative against an attacker-chosen reference; provenance must be first-class, not a caveat. | U-F8, C-F1(tail) |
| **S18** | **MEDIUM** | **False-DIFFERENT as denial/social-engineering lever**: cross-encoding non-invariance (same bytes, hex vs base64 → DIFFERENT) or a 1-LSB-off probe pixel (R-N4) lets an attacker force DIFFERENT/UNKNOWN at will, training users to ignore the one definitive verdict or herding them into the manipulable manual walk. | R-F7, C-F8, U-F10 |
| **S19** | **MEDIUM** | **Countdown is honest "liveness only" but reads as security theater** once commitment is dropped — the only visible rigor is the timer, manufacturing unearned confidence. Remove it if commitment is not reinstated. | C-F9, U-F6 |
| **S20** | **MEDIUM** | **a11y viewer-relative crediting can be inverted into attack surface**: if the (hostile, per F) counterparty influences "what this viewer can discriminate," it controls front-loading; tiny AA-fragile landmarks (quartile orientation, plus/dot, color-bar letters) get full discrete credit while rendered below discriminability at screen-share scale. | U-F5, R-F9 |
| **S21** | **LOW** | **Secrets pasted into the tool**: "paste your value" invites pasting private keys / seed phrases; confidentiality is out of scope per TM but the UX must not lull. | U-F9 |
| **S22** | **NIT** | **User-note spec/TM contradiction (pre-existing)**: spec = printable-ASCII `[\x20-\x7E]{1,10}`; TM still says "alphanumeric, single token, ≤8, no whitespace." Safe direction; update TM to match spec v10/v11. | C-(contradiction 7) |

### Demotions / adjudications on disagreement

- **R-F6 / R-N2 partially demoted.** findings-03 claims a hand-authored SVG can set `data-surround-bits` to the target's values while painting garbage boxes and pass. Adjudication: the spec's "recover from attributes, not geometry" is a **Tier-A conformance** instruction *against a trusted golden*; Tier B *does* pixel-verify "every other channel… surround boxes… within tolerance." So a checker that ran **both tiers against a self-rendered golden** would catch declared-vs-ink divergence on the *non-text* channels. The real, undemoted gap is narrower but still critical: **the comparison feature has no golden raster** — it is comparing two arbitrary artifacts — and Tier B's text-glyph exclusion means the **text channel specifically** is never pixel-checked (S3). So S3 stays CRITICAL and the `data-*` concern folds into S3/S11 as "must recompute from claimed core + render our own golden."
- **C-F7(b) "IDENTICAL impossible >512-bit" upgraded in confidence, severity held at MEDIUM (S11).** Verified at spec: >512-bit shows only first 8 + last 8 tokens + a 4-token second-digest readout — the core is provably unrecoverable, so machine-IDENTICAL on a >512-bit pasted SVG is unsound by construction.
- **C-F9 / U-F6 / S19 (countdown) — kept MEDIUM, not promoted.** The design is *honest* (decision E disclaims crypto value). The finding is a UX-amplification of S4.
- **No finding survived claiming raster can emit EQUAL.** All three lenses confirm the never-EQUAL rule (decision C) holds; the residual is S10 (forwarded trust) and S18 (forced DIFFERENT), not a false bless.

---

## SEAM ANALYSIS — the cross-domain chains no single lens could see

This is the core of the synthesis. Each seam is an attack invisible to at least one lens because it lives in the gap between two.

### SEAM-1 (CRITICAL) — The "unmatchable text" anchor is broken **three different ways at once**, and the three breaks compose into one no-preimage false-verified.

The brief asked me to hunt exactly this: *rendering homoglyph → human misread → collapses the crypto "unmatchable text" anchor → false verified.* It is real and worse than the brief sketched, because three independent erosions stack multiplicatively:

1. **Crypto layer (C-F1):** in the live/relay case the attacker *authors* the value, so the cells aren't unmatchable to begin with — 0-bit cost.
2. **Rendering layer (R-F1, R-F3):** even when the attacker must produce a near-match, they need only **glyph confusability on the victim's fallback font** (spec: `0/O`,`1/l/I` "visually-confusable in some monospace fonts"), not character equality — and Tier B guarantees nobody ever pixel-checks the glyph.
3. **Human layer (U-F1, U-F2):** the certifying act is a *voice read with case*, and the "cap/dash/under" convention covers case and `-/_` but has **no spoken disambiguator for `0/O` or `1/l/I`** — so even a glyph the font *would* distinguish is flattened by the audio channel.

**Why each single lens missed the full chain:** the cryptographer modeled the channel as exact bytes (unmatchable over characters — correct, irrelevant). The usable-security reviewer saw the human error as "credits nominal not effective bits" — a *quantitative* over-credit — without the crypto realization that in the substitution case the effective bits are *zero by construction*. The rendering reviewer saw the glyph gap but deferred the protocol mechanics. **Only in synthesis is it visible that the meter's `2^{-N}` is multiplied by (a) `2^{+N}` in the substitution case, (b) the per-cell glyph-confusion allowance, and (c) the per-cell case-drop allowance — and that the design relies on this same anchor to justify dropping commitment.**

### SEAM-2 (CRITICAL) — Drop-commitment ∘ steer-order ∘ cheap-gestalt ∘ Quick-preset: a false "NO DIFFERENCE" with the human never reaching a single text check.

Chain: decision F assumes hostile counterparty *always* → decision E drops commitment → last mover steers the seed (paper §5.2) → the steerable order front-loads the **cheap gestalt** the attacker ground in <1s (C-F5: ≤200 evals/channel) → the **Quick** preset's small bit-target (C-F5/U-F4) is exhausted on matched gestalt → **viewer-relative crediting** (U-F5) and the **independence-assuming meter** (C-F6) inflate those gestalt bits past the §4.3.9 joint ceiling → meter reads "no difference" → **habituated human abandons early** (U-F4/U-F5) before any front-loaded text check even appears.

This composes **C-F3 + C-F5 + C-F6 + U-F4 + U-F5** and **no text cell is ever read.** The crypto lens proved the order is steerable; the usable lens proved the human quits before text; neither alone shows that steerable-order + early-quit + small Quick target = a pass with zero text checks.

### SEAM-3 (HIGH) — Screen-share collapses BOTH the harvested seed entropy AND the meter-spoofing surface, in the most common "live" setting.

The canonical "comparing live with another person" setup is a **screen-share**. In that one setting:
- **Crypto (C-F4):** the attacker *observes* the click `(x,y)` and recovers the timestamp from frame timing → harvested entropy → ~0 → seed predictable → with no commitment, attacker steers freely (folds into SEAM-2).
- **Usable (U-N2, U-N4):** the attacker *sees the spoken code on the shared screen before committing their own contribution* (restoring last-mover advantage) **and** renders a fake near-full meter to induce the victim's early abandonment.

Neither lens stated the unifying fact: **the entropy source, the seed display, and the verdict chrome are all on the same surface the assumed-hostile counterparty is watching.**

### SEAM-4 (HIGH) — Raster forced-fallback ∘ guided-walk ∘ homoglyph: the raster engine's correct conservatism *delivers the victim to the human-text attack.*

The raster engine never blesses (good). But (R-F4/R-N4) an attacker can paint the probe constants exactly while hand-painting wrong text, *or* flip one border pixel to force "degraded → bail to human." Either way the machine emits UNKNOWN and **hands off to the guided walk** — where SEAM-1 lives. The raster fail-safe is a *funnel*: the attacker chooses *when* to drop the victim into the weaker human channel, the gestalt already matches (copied from target), leaving only the un-highlightable text difference for a homoglyph-blind voice read to miss.

### SEAM-5 (HIGH) — Preset-downgrade inversion: choosing "Paranoid" can be cryptographically *weaker* than "Quick."

Required uniformity entropy `log₂C(K,L)` **rises** with the preset (17–21 bits at Strong/Paranoid) while the friendly click-harvest **supply** does not (≤~14 bits). A social-engineer who says "use the strongest mode" while the victim single-clicks gets a *less uniform, more steerable* order than Quick would have. The UI's "more paranoid = more secure" is false under starved entropy. Fix: **gate each preset on *measured* harvested entropy ≥ `log₂C(K,L_preset)`**.

### SEAM-6 (HIGH) — Chimera SVG decouples machine verdict from human gestalt for later repudiation.

A pasted SVG with cells reading `V` (→ machine IDENTICAL) but gestalt/font drawn for `V'` (→ a human who later glances sees a different picture). The *machine* certifies `V`; the *human memory* is `V'`. The rendering lens built the chimera; the crypto lens noted no spec rule forces self-consistency; only together is it a **repudiation/disagreement weapon**. Fix: before IDENTICAL, **re-render the reconstructed core ourselves and require full render-model + raster equivalence** (demand the pasted SVG be self-consistent: its gestalt = SHA-512 of its own cells).

---

## RULINGS ON THE LOAD-BEARING DECISIONS

### Ruling 1 — Dropping cryptographic commitment in the standard two-party model: **UNSOUND. Reinstate commit-and-reveal as the live-mode default.**

Paper §5.2 is decisive: *"the commitment is what removes the last mover's advantage,"* and above threshold *"what then defends the comparison is that the value was committed before the seed was drawn, not the seed's size."* The design makes commitment a "high-assurance upsell" and substitutes text-anchoring — but text-anchoring presupposes (a) an honest fixed target the substitution attacker removes (SEAM-1), (b) a uniform committed order that no-commitment + short/observed seed destroy (SEAM-2/3), and (c) unmatchable attentively-read cells that low-entropy inputs, habituation, and glyph confusion defeat. The design *concedes* nothing stops a tool grinding a steering nonce in ms — an admission that, with commitment gone, the live walk has **no defense against last-mover steering at all.** The "high-assurance option" framing is backwards: **commitment is the property that makes the C(J,L)/C(K,L) bound mean anything.** Make it the live default (with the §5.2 randomizer: commit over nonce ‖ high-entropy opening). *Defensible only* on the non-adversarial casual paste path where there is no counterparty to steer.

### Ruling 2 — Anchoring soundness in the text channel: **HOLDS ONLY INSIDE AN UNENFORCED ENVELOPE; broken as stated.**

As a statement about *bytes against an honest collision target*, the anchor is real (and the 96-bit domain-separated middle and bar-marker domain separation are genuinely sound). But the feature consumes the claim over **glyphs** (R-F1/F3), **attacker-authored `<text>`** (R-F1/S3), a **noisy human voice read** (U-F1/F2), and in the **substitution case** (C-F1). It survives **iff** the feature *enforces*:
1. the value is **locally generated** (assume authored, credit text 0 unless locally generated) — C-F1/F10;
2. the order is **committed and uniform** — Ruling 1 + C-F2;
3. a **hard floor of forced, case-confirmed, read-back, homoglyph-clean** text checks passes before any affirmative verdict; gestalt may only **fail-fast (DIFFERENT)** — U-F5/F2/F1, R-F3, C-F5;
4. for SVG references, **displayed glyphs are verified against `<text>`** (re-render through our pinned font; don't inherit Tier B's text-exclusion) — R-F1/S3;
5. the meter credits **effective min-entropy** (input-class-aware, correlation-aware, capped at the §4.3.9 joint ceiling), not nominal summed bits — C-F6/F10, U-F3.

### Ruling 3 — The four-state verdict model: **CONCEPTUALLY CORRECT; the probabilistic/definitive boundary is under-defended, and two state-entry rules are unsound.**

- **Proof asymmetry is right**: DIFFERENT-is-definitive is fail-safe; raster never EQUAL and human-read → never machine-IDENTICAL are correct conservative cuts.
- **Broken entry rules:** (a) **pasted-SVG → IDENTICAL** without a self-consistency check and without the ≤512-bit caveat is unsound (S3/S11/SEAM-6) — contradicts the spec equivalence relation. (b) **"NO DIFFERENCE · N bits"** as a `1-in-2^N` thermometer (S6/S13) smuggles independence the single-digest gestalt violates (§4.3.9) and reads as "match." Fix: show *checklist coverage*, not a probability; reserve affirmative/green for machine-IDENTICAL; lead the human verdict with the limit.

### Ruling 4 — Raster disprove-only: **CORRECT and the strongest part of the design — with one mandatory addition.**

The never-EQUAL ceiling holds and resists every "force EQUAL from a raster" attack. Required fix: **UNKNOWN must carry ZERO forward trust** (R-F4/S10) — a passed fidelity probe credits *no* bits, only licenses *disproof*, and an UNKNOWN resets any subsequent walk to zero. Surface "I couldn't read the reference" distinctly from "these differ" (S18). Under lossy/screen-share pipelines, exclude nucleus color from disproof (S15).

---

## CONSOLIDATED CONTRADICTIONS WITH SPEC / PAPER / THREAT-MODEL

1. **Commitment as upsell vs. paper §5.2 / §6.2 Principle 6.** Direct contradiction: commitment, not seed size, removes the last-mover advantage above threshold. (S4, Ruling 1)
2. **Flat ~14-bit seed vs. paper §5.2 premise.** §5.2 ties the requirement to `log₂C(K,L)` — ~14 only for K=20,L=5; Strong/Paranoid need 17–21; a too-short seed makes the bound "optimistic." (S5)
3. **"Counterparty cannot undermine your soundness" (F) vs. paper §5.2 relay + §5.4.** Certifies "same as the value I am reading," never authenticity; substitution undermines soundness without matching any cell. (S1)
4. **Pasted-SVG → IDENTICAL vs. spec equivalence (render-model AND raster) + render model + large-input.** Cell-text reconstruction ≠ equivalence; >512-bit core unrecoverable. (S3/S11)
5. **"N bits = 1-in-2^N" vs. paper §4.3.9.** The quantity is *joint* grind difficulty with correlated channels, capped at 20–40 bits; an additive meter contradicts this. (S6/S13)
6. **Text-anchored soundness vs. spec Tier-B text-glyph exclusion + homoglyph admission + paper §2.3 ("certifies its bits exactly *only when read correctly*").** Asserted unconditionally over a glyph-ambiguous, never-pixel-verified channel. (S2/S3)
7. **SVG value-engine trusting `data-*`/`<text>` from untrusted input vs. conformance intent.** "Recover from attributes" is for a *trusted golden*; reusing the checker on adversarial input without a golden is a category error. (S3)
8. **Viewer-relative crediting (§5.4) vs. hostile-counterparty assumption (F).** §5.4 holds only if credit is computed honestly and locally; otherwise a11y becomes attack surface. Unreconciled. (S20)
9. **Closed profile (G) vs. off-SVG overlay (D).** Cannot have both a pixel-anchored ring and an off-SVG overlay in host-controlled coordinates. (S14)
10. **User-note rule: spec `[\x20-\x7E]{1,10}` vs. TM "alphanumeric, ≤8, no whitespace."** Pre-existing; safe direction; update TM. (S22)

---

## MUST-FIX LIST (gating the "sound" verdict)

**Tier 1 — reverse a stated decision (blocks any positive verdict shipping):**
1. **Reinstate commit-and-reveal (with §5.2 randomizer) as the live-mode default**, not an upsell. (S1/S4, Ruling 1)
2. **Hard text gate**: no affirmative verdict until a fixed floor of *forced, case-confirmed, read-back, homoglyph-clean, locally-generated* text checks pass; gestalt may only drive DIFFERENT. (S2/S7, Ruling 2)
3. **SVG engine must not trust `<text>`/`data-*`**: recompute fingerprint-derived fields from the claimed core, re-render our own golden, verify displayed glyphs against `<text>`; refuse IDENTICAL for >512-bit or self-inconsistent SVGs. (S3/S11/SEAM-6)

**Tier 2 — quantitative correctness:**
4. **Gate each preset on measured min-entropy ≥ `log₂C(K,L_preset)`**; screen-share-aware harvest; treat `performance.now()` as ≤8 bits. (S5/S8/SEAM-3/SEAM-5)
5. **Effective-bit, correlation-aware meter capped at the §4.3.9 joint ceiling**; show coverage, not `1-in-2^N`; never auto-green; reserve affirmative treatment for machine-IDENTICAL. (S6/S13/S16)
6. **UNKNOWN (raster) credits zero forward trust**; probe proves fidelity not authenticity; exclude nucleus under lossy pipelines. (S10/S15)

**Tier 3 — UX/ceremony hardening:**
7. Attention probes + active-recall confirmation (S9); drop hard countdowns from the human read or remove the timer if commitment isn't reinstated (S19); auto-detect fail-closed to the weakest engine on ambiguity, explicit confirmation (S12); provenance-of-reference first-class (S17); embedded pinned high-disambiguation font + NATO-style homoglyph readout (S2); tool-controlled iframe/shadow-DOM with re-measured cell geometry for ring anchoring (S14); secret-input warning (S21); fix TM user-note text (S22).

---

## WHAT SURVIVES (so the rework is targeted, not wholesale)

The **entviz artifact and spec need no change.** Genuinely sound: the **96-bit domain-separated second-digest middle** as a *collision* barrier; **bar-marker domain separation** as clean independent bits; **text-not-bytes fingerprinting** against malleability; the **fail-safe asymmetries** (DIFFERENT definitive; raster never EQUAL; ring around-not-over; closed profile); and the paper's exemplary **honesty about untested ergonomics** (§6.3). Every break is in the *comparison feature's* security argument, and every fix is implementable in the feature.

**Bottom line:** the design is **sound-with-fixes**, but its central simplification — "text-anchoring lets us drop commitment" — is the one claim that does not survive, and it was broken independently by all three lenses converging from crypto, human, and rendering directions. Reinstate commitment for live mode, gate affirmative verdicts on an enforced (not assumed) text floor, and stop the SVG engine trusting characters over ink. With those three Tier-1 fixes the architecture's strong instincts are matched by a sound argument; without them, a T1+T6 attacker reaches a false "verified" with no preimage along SEAM-1 ∘ SEAM-2.
