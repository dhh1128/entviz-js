# Independent Adjudication: Panel Synthesis vs. Orchestrator Rebuttal

**Adjudicator:** independent applied cryptographer / verification-ceremony analyst. No affiliation with either prior analysis. North star: the worst outcome is a **false "verified"/"identical"** — a user concluding `A = B` when `A ≠ B`.

---

## 0. Definitions of load-bearing terms (operational, fixed for this report)

- **match (a cell):** two entvizes' cell *i* are *matched* iff what the verifying party perceives/records for cell *i* on side A equals that on side B. I split this deliberately into three sub-notions because the analyses conflate them: **byte-match** (the underlying characters are equal), **glyph-match** (the rendered glyphs are equal/confusable on the viewer's font), and **report-match** (the human says "same"). A false report-match on differing bytes is the failure of interest.
- **forge (a cell):** an attacker produces a value whose cell *i* byte-matches a target the attacker does **not** control.
- **steer (the order):** a participant in the live comparison influences the seeded check-order after learning information that lets them bias which checks come up early.
- **verified:** the tool reaches an affirmative verdict ("NO DIFFERENCE · N bits" or "IDENTICAL").
- **soundness:** the property that *verified ⇒ A = B* (no false affirmative) at the claimed confidence.
- **unmatchable (text cell):** a cell whose byte-match an attacker can achieve only by a partial preimage of cost ≈2^(bits in that cell) — i.e., true only against a **fixed target the attacker must collide and cannot author**.
- **authenticated channel:** the live comparison runs over a medium where each endpoint knows it is talking to the intended human counterparty (voice/face recognition), so a third party cannot *be* the channel undetected. Distinct from "confidential channel."
- **substitution** = upstream MITM replaced one party's stored/displayed value but is **not** a live participant. **relay** = the attacker **is** the live channel between the two parties (interposes on the call). **endpoint compromise** = one party's own software/device is hostile.

---

## 1. ASSUMPTIONS LEDGER

- **A1.** Attacker tiers per threat-model: T1 (offline grind, millions–billions of SHA-512 evals), T6 (habituated reader checks few landmarks), optionally T2/T4 (rendering/environment control). SHA-512 itself is not broken (TM out-of-scope).
- **A2.** The compared values are **high-entropy** (public keys etc.), full-entropy, ≤512 bits unless stated — the canonical Q1 case. (Low-entropy/structured inputs are A12.)
- **A3.** Canonical Q1 case: the attacker **substituted one side** (case A above) and is **not a live participant** in the comparison. Both honest endpoints run honest software.
- **A4.** Per-cell text cost model: matching one cell by **forgery against an uncontrolled target** costs ≈2^(b) keygens, where b = real bits/cell = 24 (hex, base64url), 23.4 (base58), 20.7 (base36), 20 (bech32/base32/crockford 5-bit, after stripping the deterministic bit-extension), 19.9 (decimal). Verified by computation.
- **A5.** Forgery requires *generating a real value* (e.g. a keypair) whose rendered tokens hit the target — so the cost is in keygens, not just hashes, when the value is a key. For arbitrary-string inputs (UTF-8 fallback) the attacker picks characters directly: cost is then ~0 to set chosen cells, but only because such a value is attacker-authored (→ A12).
- **A6.** The seeded walk checks L of K items; the survival probability against an attacker who pre-matched J items, **assuming uniform order**, is C(J,L)/C(K,L).
- **A7.** Uniform order requires seed entropy ≥ log₂C(K,L) (paper §5.2, verified: 13.9 bits at K=20,L=5; 16.9 at K=20,L=8/12; 21.4 at K=24,L=12).
- **A8.** Commitment (commit-and-reveal with a high-entropy randomizer) removes the **last-mover steering advantage** when a *participant* can steer (paper §5.2).
- **A9.** "The tool" (the comparison feature, decisions A–G) is trusted on the verifying user's own endpoint (decision F: each party trusts their own endpoint; this is irreducible).
- **A10.** Tier-B raster comparison **excludes text-glyph regions**; homoglyph confusability is real and font-dependent (spec).
- **A11.** A pasted/dropped reference SVG is **attacker-authorable**; the comparison feature is not the conformance checker and has no golden raster (spec equivalence relation presumes a trusted golden).
- **A12.** Some supported inputs are low-entropy/structured/attacker-authored: snowflakes (≈42-bit timestamp prefix), vanity values, UTF-8 fallback (arbitrary attacker text), and the bit-extended final token (20 real bits). For these, A4's per-cell cost does not hold.
- **A13.** The common live-mode UX is a **screen-share** (decision E click-harvest + on-screen spoken code); the assumed-hostile counterparty observes the shared surface.

---

## 2. MY INDEPENDENT DERIVATIONS (written before ruling)

### Q1 — grind cost to forge the text channel (canonical case, A2–A5)

**Premise:** to pass a seeded walk by forging text, the attacker (case A, A3) must, *before* the call, produce a value A ≠ B whose displayed text byte-matches B's in whatever cells the walk later checks. The seed is drawn live from nonces the absent attacker is not party to, so the attacker cannot predict which cells (premise: A3, A6).

**Inference:** the attacker must pre-match J of K cells such that the L checked cells all land in J (A6). Per-cell forgery cost ≈2^b keygens (A4). To pre-match J cells costs ≈2^(b·J); survival is then C(J,L)/C(K,L).

**Conclusion (Q1, under A2–A6):** For hex/base64url, b=24, so J=3 cells ≈2⁷² keygens, J=6 ≈2¹⁴⁴ — the rebuttal's figure is **correct** for these alphabets. The text channel **is a sound soundness anchor for high-entropy inputs in the substitution case**: forging it is not free; it is exactly the paper's §5.1/§5.3 partial-preimage economics. The panel's S1 claim "matched for 0 bits" is **false under A2–A3**.

**But** the cost is **not uniform across alphabets** (A4): base36 cells are 20.7 bits, decimal 19.9, and the **bit-extended 5-bit final token carries only 20 real bits** (the low 4 are a deterministic repeat the attacker gets free). So "≈2²⁴/cell" is right for hex/base64url, ~0.6 bit/cell optimistic for base58, and **4 bits/cell optimistic** for 5-bit-alphabet cells and the extended final token. This is a real but bounded erosion (a ~2⁴ discount per affected cell), not a collapse. UUID version/variant bits (6 fixed bits in one 24-bit region) and CESR derivation codes (a 1-of-~4 leading char) shave a few more bits off specific cells. **None of these takes any cell to 0**; the largest single-cell discount is the 5-bit case (24→20).

**The one place Q1's anchor genuinely goes to ~0 bits: attacker-authored values (A12, A5).** If A is not collided against an honest B but is *authored* by the attacker (UTF-8 fallback, vanity, or the relay/endpoint cases), every cell is free. This is **not** the canonical Q1 case (A3) — it is a different threat (case C/B), which is Q2's subject.

**Verdict scaffold for Q1:** rebuttal's estimate **right for hex/base64url, true-but-slightly-optimistic for the structured/5-bit/decimal alphabets** (name the conditions: 4-bit discount on extended/5-bit cells). The text channel **is** a sound anchor for high-entropy substitution. Panel S1 is **false as stated** for the canonical case and **only true under the unstated condition that the value is attacker-authored** (relay/endpoint, not substitution).

### Q2 — threat decomposition

**Premise:** "free match" requires the attacker to *author* the matched value (A5/A12). I independently enumerate who can author:
- **(A) substitution, attacker absent (A3):** B is the honest party's real value. Attacker cannot author B → must forge → Q1 cost holds. No participant steers (both honest) → the live seed is already unpredictable to the absent attacker → **commitment adds nothing here.**
- **(B) endpoint compromise:** the hostile tool doesn't forge — it *fabricates* (shows its own user a fake entviz and matching read-aloud). No protocol defends this; commitment is irrelevant (a lying tool ignores it). Conceded irreducible (decision F; Signal-safety-number parity).
- **(C) relay:** attacker **is** the channel, authors both sides → free match → no SAS scheme survives a relay on an *unauthenticated* channel; the defense is **channel authentication** (voice/face), assumed by the canonical setup.

**Inference:** The three cases have genuinely different answers. The "0-bit" property lives in (B) and (C), not (A). Commitment's job (A8) is to stop a **participant steering** the seed — which is a (B)/(C) phenomenon (a live participant), not an (A) phenomenon (attacker absent).

**Conclusion (Q2):** the rebuttal's decomposition is **correct and, for the standard model, complete**. The panel's "substitution/relay" phrase **does conflate (A) with (C)**, and "hostile counterparty software" is (B). **However** — and this is where the rebuttal is too comfortable — the panel's **SEAM-3** is a real counter: the live-mode UX (A13) runs the seed harvest and the spoken code over a **screen-shared** surface the assumed-hostile counterparty watches. That observation lets a hostile *participant* (case B counterparty, who is in the call) **see the victim's nonce contribution before committing their own**, restoring last-mover steering. That pushes the **common live case from (A) toward (B/C)** for the *seed* even when channel authentication holds for *identity*. So the decomposition is correct, but the rebuttal's claim that the canonical live setup *is* case (A) is **true only under the unstated condition that the seed channel is not observed by the counterparty** — which the as-designed screen-share UX violates.

### Q3 — commitment

**Premise (paper §5.2):** commitment removes the last-mover advantage *when a participant can steer*. **Premise (Q2):** in case (A) no participant steers and the absent attacker can't predict live nonces.

**Inference:** For two honest endpoints on an authenticated channel facing an upstream substitution (case A), commitment defends a threat that does not arise. For cases (B)/(C) — a steering participant — commitment is load-bearing, **but** in (B) the endpoint is already lying (commitment doesn't save you) and in (C) the relay authors both sides (commitment doesn't save you either). So commitment's *unique* protective niche is narrow: a **semi-honest participant** who would steer the seed if able but otherwise reads honestly — and, critically, the **screen-share seed-observation case** (A13/SEAM-3), where a counterparty who *sees your nonce first* gains last-mover advantage. There, commitment **does** restore the defense.

**Conclusion (Q3):** Decision E ("drop commitment, keep as high-assurance option") is **sound-only-under-stated-conditions**: sound when (i) the seed is unobservable by the counterparty and (ii) the channel is authenticated so no relay. It is **unsound as a blanket default for the as-designed screen-share live UX**, because that UX violates (i). The panel's "reinstate as *default*" overshoots for case (A); the rebuttal's "optional" undershoots for the screen-share reality. The correct ruling is conditional, and the condition is cheap to detect (is the seed surface shared?).

---

## 3. VERDICTS PER CONTESTED QUESTION

### Q1 — Text-channel security. **Rebuttal substantially right; panel S1 false for the canonical case.**

**Classification of the rebuttal's "≈2²⁴/cell × C(J,L)/C(K,L)":** **(iv) true and correctly weighted** for hex and base64url; **(iii) true but slightly overstated** for base58 (23.4 bits), base36 (20.7), decimal (19.9), and the 5-bit alphabets and bit-extended final token (**20** real bits — a genuine 4-bit/cell discount the rebuttal's "self-calibration #1" rightly flagged as an open question; my computation confirms it is real but bounded). Across the alphabet zoo the per-cell cost ranges 2²⁰–2²⁴, never 0. So the anchor's strength varies by ~16× per cell but **holds**.

**Classification of panel S1 ("matched for 0 bits"):** **(ii) true only under unstated conditions** — namely that the attacker *authors* the value (relay/endpoint, A12), which is **not** the canonical high-entropy substitution case S1 purports to cover. As a statement about the substitution case it is **(i) false**. The panel earns partial credit only because it is describing a different threat than the one it claims to refute.

**Did either move me?** The crypto finding's own re-derivation (findings-01 §1 grind cost) actually *contains* the correct 2⁷²/2¹⁴⁴ math the rebuttal uses — but the synthesis then *suppressed* it in favor of the "0-bit" headline by silently switching to the authored-value case. That is the synthesis's central error and the rebuttal caught it correctly. Nothing moved me off my independent Q1 derivation.

**Ruling:** The text channel **is a sound soundness anchor for high-entropy inputs in the substitution case**, at 2²⁰–2²⁴ keygens/cell. S1 is wrong as the load-bearing crux. The honest, narrower true statement is **S16** (low-entropy/authored/bit-extended inputs cost less), which the panel itself rated only MEDIUM — an internal inconsistency that vindicates the rebuttal.

### Q2 — Threat decomposition. **Rebuttal's (A)/(B)/(C) split is correct and complete; the panel conflates (A) with (C); BUT the panel's SEAM-3 identifies a real case the rebuttal under-defends.**

The decomposition is **(iv) true and correctly weighted**. The panel's "substitution/relay" fusion is a genuine conflation: it takes the free-match that is real in (C)/(B) and applies it to a soundness claim about (A) (panel S1, Ruling 1). That is the rebuttal's strongest and most correct point.

**However**, testing the rebuttal hard as instructed: **SEAM-3 is not waved away — it is the rebuttal's weakest seam and the rebuttal concedes as much (self-calibration #3).** Premise: the canonical live UX (A13) harvests the seed and displays the spoken code on a screen-shared surface. Inference: the assumed-hostile counterparty (a *participant*, case B) observes the victim's nonce before committing its own → last-mover steering returns → with commitment dropped, the seeded order is steerable → SEAM-2's "exhaust Quick target on cheap gestalt before any text check" chain becomes reachable **even though text is unmatchable**, because the attacker never lets a text check come up. Conclusion: **the panel correctly identifies that the live UX pushes the common case from (A) toward (B/C) for the seed**, defeating the rebuttal's "authenticated channel / case (A)" assumption *for the seed specifically*. The rebuttal's defense of channel authentication protects *identity* recognition but not *seed secrecy* — these are different properties, and the rebuttal elides the gap.

**Net Q2 verdict:** decomposition correct; panel conflation real; **but the rebuttal is too dismissive of SEAM-3, which is a sound, philosophy-independent finding the rebuttal should have promoted rather than half-conceded.** Both sides are partly right: the rebuttal on the decomposition, the panel on the screen-share seam.

### Q3 — Commitment. **Sound-only-under-stated-conditions. Both headlines overshoot.**

- Panel Ruling 1 ("reinstate commit-and-reveal as the live-mode **default**"): **(iii) true but overstated.** For case (A) with an unobserved seed, commitment defends nothing (Q2). Making it the unconditional default is correct *engineering hygiene* but the panel's *justification* (text-anchoring fails, S1) is false. Right answer, wrong proof.
- Rebuttal §3 ("commitment optional for honest authenticated endpoints facing upstream substitution"): **(ii) true only under unstated conditions** — true iff the seed is unobservable by the counterparty. The as-designed screen-share UX (A13) violates that, so "optional" is unsafe as a blanket default.

**What paper §5.2's commitment actually defends:** a **participant steering the shared seed** (last-mover advantage), i.e. cases where a live party can bias the order — including the screen-share-observed-nonce case. **Does that threat arise in the design's standard case?** Not in pure case (A) (attacker absent). **It does arise in the design's standard *UX*** because the standard UX is screen-share (A13). So decision E is **sound only if the tool detects/forbids seed observation**; unsound as written.

**Ruling:** **sound-only-under-stated-conditions.** The condition is enforceable and cheap: **commitment SHOULD be the live default whenever the seed surface may be observed by the counterparty (screen-share, recorded call) — which is the common case — and MAY be dropped only when the seed is provably unobserved and the channel authenticated.** This splits the difference between the two headlines *on principled grounds*, not to seem balanced: the panel is right that commitment must usually be on; the rebuttal is right that the reason is seed-observability, not a failure of text-anchoring.

### Q4 — Finding-by-finding (S1, S2, S3, S6, S9, S10, S12, S16)

- **S1 (text-anchored soundness fails, substitution/relay). WRONG as stated / overstated to the point of error.** Premise→inference→conclusion: it asserts every text cell is matched for 0 bits in the substitution case (A3); but A4 gives 2²⁰–2²⁴/cell there; therefore the 0-bit claim holds only under A12 (authored value), which is case (B)/(C), not substitution. **Classification (i) false** for its stated scope; the salvageable kernel is S16. The rebuttal is right.

- **S2 (homoglyph + case-drop voids the text anchor). OVERSTATED — it is a bounded hardening, not a break.** Premise: confusability lets the attacker forge a *glyph-match* (or report-match) rather than a byte-match (A10). Inference: this lowers per-cell cost by an alphabet-dependent factor — for hex the confusable set is small (0/O, 1/I/l, 5/S, 8/B), shaving perhaps 2–6 bits off a 24-bit cell to ~2¹⁸–2²²; for case-sensitive base64url with case-dropping, dropping case halves the alphabet on letters, costing up to ~1 bit/letter, plausibly 2²⁴→2¹⁸–2²⁰/cell. Conclusion: **still multiplied across the cells the walk forces**, and still ≫0. **Classification (iii) true but overstated** ("voids" is the banned-verb instinct; the precise statement is "reduces per-cell effective entropy by a bounded, alphabet-dependent 2–6 bits, mitigable by a pinned disambiguating font + NATO/case-explicit readout"). The rebuttal's framing (bounded hardening) is correct; the Crockford middle cells are already homoglyph-clean, which the design can lean on. **Real fix, not a crux.**

- **S3 (SVG engine trusts `<text>`/`data-*` over rendered ink → IDENTICAL with no preimage). SOUND, CRITICAL, and philosophy-independent.** Premise: Tier B excludes glyph pixels (A10); the comparison feature has no golden (A11); a pasted SVG is attacker-authored. Inference: an SVG whose `<text>`/`data-*` declare value X while the ink shows Y reaches machine-IDENTICAL with **zero preimage**, in *every* threat case including pure (A). Conclusion: this is a concrete machine-path bug that holds regardless of the commitment debate. **Classification (iv) true and correctly weighted.** Both panel and rebuttal agree; I concur. **Keep — this is the single most important *undisputed* finding.** Fix: recompute fingerprint-derived fields from the claimed core, re-render through the tool's own pinned font, require self-consistency; never IDENTICAL on >512-bit (core unrecoverable) or self-inconsistent SVGs.

- **S6 (additive "N bits = 1-in-2^N" meter ignores single-digest correlation). SOUND.** Premise: surround/color-bar/ellipse/blank-map/quartile/background/edge-singletons are all deterministic functions of one SHA-512(core) (spec). Inference: their per-channel "bits" are **not independent**; summing them over-credits beyond the joint habituated-gestalt ceiling the paper caps at 20–40 bits (§4.3.9). Only text cells, the second-digest middle, and the two bar markers add independently (domain separation). Conclusion: a per-check additive meter can show "Strong/30 bits" of gestalt the joint grind cost doesn't back. **Classification (iv) true and correctly weighted.** Both agree; keep. (My N3-style refinement: v10's edge-singletons are derived from the *same* used-ftok quant that drives that cell's surround and quartile — crediting them separately triple-counts one quant.)

- **S9 (habituation / rubber-stamping collapses the §5.2 bound). SOUND but philosophy-independent and not unique to this design.** Premise: the C(J,L)/C(K,L) bound assumes the human performs each scheduled check (A6). Inference: a click-through human performs 0 effective checks, so the bound reduces to "attacker wins if user rubber-stamps," independent of seed/commitment. Conclusion: **(iv) true.** It is a genuine usable-security finding; it equally indicts *any* walk including a commitment-reinstated one, so it is **not evidence for the commitment reversal** — it is orthogonal hardening (attention probes, active-recall read-back, deny affirmative on Quick). Keep; both agree.

- **S10 (raster fidelity probe = fidelity not authenticity → UNKNOWN must carry zero forward trust). SOUND.** Premise: probe regions (#ffffff, #808080, exact palette band hexes) are input-independent constants an attacker paints exactly while hand-painting wrong, un-OCR'd text (decision C's own premise that color and text aren't bound in an authored image). Inference: a passed probe certifies rasterizer fidelity, not content authenticity; a downstream walk must not inherit "gestalt confirmed" trust. Conclusion: **(iv) true and correctly weighted.** The never-EQUAL ceiling holds (no false bless), so the residual is forwarded-trust and forced-fallback (N4), correctly rated HIGH/MEDIUM. Keep; both agree.

- **S12 (auto-detect routes polyglots to the most permissive engine). SOUND.** Premise: SVG can reach IDENTICAL, raster never EQUAL (decision C asymmetry); auto-detect picks the engine. Inference: a polyglot/late-binding/foreignObject artifact steered to the SVG path (which trusts `<text>`, S3) reaches IDENTICAL the raster path would refuse. Conclusion: **(iv) true**; fix = strict closed-profile + self-containment gate *before* value extraction, fail-closed to the weakest engine on ambiguity. Keep; both agree.

- **S16 (text-unmatchability fails for low-entropy/authored/bit-extended/>512-bit inputs). SOUND and is the *correct, narrow* version of S1.** Premise: A12 — authored values cost ~0; structured-ID prefixes ≪24 bits; the bit-extended final token = 20 real bits (confirmed); >512-bit middle = 96-bit barrier *for collision only*, 0 for substitution-by-authoring. Inference: the meter must credit a cell its **actual min-entropy**, and 0 for any value the local side did not independently generate (it cannot tell authored from honest, so in adversarial mode it must assume authored). Conclusion: **(iv) true and correctly weighted** — and it **subsumes the legitimate content of S1**. The panel's own rating of S16 as merely MEDIUM while S1 is CRITICAL is the inconsistency the rebuttal exploits: the true finding is the MEDIUM one. Keep S16; demote S1 into it.

**Q4 summary:** The rebuttal's triage is **correct**: S3, S6, S9, S10, S12 are the genuine, philosophy-independent fixes; S1 (and the commitment *justification*) is overstated/wrong; S2 is bounded hardening; S16 is the honest kernel of S1. I diverge from the rebuttal only in giving the panel **more** credit on Q2/Q3 via SEAM-3 (the screen-share seed observation), which is a real reason to keep commitment on by default — independent of S1.

### Q5 — Grade the rebuttal.

**Where the rebuttal is right (and the panel wrong):** the (A)/(B)/(C) decomposition (Q2); the Q1 grind-cost math; the diagnosis that the panel suppressed its own correct 2⁷² figure to manufacture the S1 headline; the wheat/chaff triage (S3/S6/S9/S10/S12 keep, S1 overstated, S2 bounded). These are correct and decisive.

**Where the rebuttal is wrong, too dismissive, or blind:**
1. **SEAM-3 (screen-share seed observation) is under-defended.** The rebuttal lists it as a concession but does not follow it to its conclusion: it *re-introduces last-mover steering for a participant*, which **is** the threat §5.2 commitment defends, and it does so in the *common* live UX. This is a place the panel is **right** and the rebuttal **too dismissive**. It means commitment should be the live **default** (matching the panel's Ruling 1 conclusion) — but for the panel's *wrong* reason (S1) replaced by the *right* reason (seed observability). The rebuttal's "commitment optional" is unsafe as written.
2. **Per-cell cost overstated for non-power-of-2 and 5-bit alphabets.** Its own self-calibration #1 was the right worry; the answer is a real but bounded 4-bit/cell discount on 5-bit/extended cells (confirmed). It should have closed this rather than leaving it open — though the conclusion (text still holds) is unchanged.
3. **It does not independently re-rate S2's mitigation urgency.** Bounded ≠ ignorable: for case-sensitive base64url over a voice call with case-drop, the per-cell erosion (2–6 bits) compounds across the *few* cells a Quick walk credits, and the meter currently credits nominal bits. The rebuttal is right it's hardening, but it underweights that the hardening is *necessary* for the text anchor to deliver its claimed bits — i.e., it interacts with S6's effective-bit crediting.

**Are the rebuttal's three conceded uncertainties the right ones?** Yes. And **none is fatal to its position** except #3 (screen-share), which is fatal **only to its specific claim that commitment is optional**, not to its core thesis (text holds for high-entropy substitution; S1 overstated). Its core thesis survives.

---

## 4. CORRECTED, PRIORITIZED FIX-LIST

**Tier 1 — must change (concrete, philosophy-independent machine-path bugs; reachable with no preimage in case (A)):**
1. **S3/S12/SEAM-6:** SVG engine must **not** trust `<text>`/`data-*`. Recompute all fingerprint-derived fields from the claimed core; re-render through the tool's own pinned high-disambiguation font; require self-consistency (gestalt = SHA-512 of its own cells); **refuse IDENTICAL for >512-bit (core unrecoverable, confirmed) or self-inconsistent SVGs**; strict closed-profile + self-containment gate *before* value extraction; fail-closed to the weakest engine on polyglot ambiguity.
2. **S10/S15/N4:** Raster UNKNOWN carries **zero** forward trust; a passed fidelity probe credits **no** bits, only licenses disproof; exclude nucleus from disproof under lossy/screen-share pipelines; distinguish "couldn't read reference" from "DIFFERENT."
3. **S6/S16:** Make the meter **effective-min-entropy** and **correlation-aware**: cap credited gestalt bits at the §4.3.9 joint ceiling; credit only text cells + second-digest middle + bar markers independently; credit a cell its actual bits (≤20 for 5-bit/extended; ~0 for authored/structured-prefix); **credit 0 for any value not locally generated in adversarial mode**. Show *coverage*, not "1-in-2^N"; reserve affirmative/green for machine-IDENTICAL.

**Tier 2 — commitment, conditioned correctly (the contested item, ruled sound-only-under-conditions):**
4. **Commitment is the live-mode default whenever the seed surface may be observed by the counterparty (screen-share, recorded/relayed call) — the common case.** It MAY be dropped only when the seed is provably unobserved and the channel authenticated. Ship the §5.2 high-entropy randomizer with it. Detect screen-share and force commitment (or off-screen seed transfer) then. **Scale seed entropy to the preset: require ≥ log₂C(K,L_preset)** (16.9 bits at Strong, 21.4 at Paranoid K=24, confirmed) — gate the preset on *measured* harvested min-entropy; treat `performance.now()` as ≤8 bits and single-click position as 6–9 bits. (Fixes S5/S8/SEAM-3/SEAM-5; corrects decision E's flat 14-bit figure, which is right only for Quick.)

**Tier 3 — hardening (real, not cruxes):**
5. **S2/S9:** Pinned disambiguating font on the comparison surface + NATO-style homoglyph and explicit case readout; hard text gate (no affirmative verdict until a floor of forced, case-confirmed, read-back text checks pass; gestalt may only fail-fast to DIFFERENT); attention probes + active-recall read-back to defeat rubber-stamping; deny any affirmative verdict on Quick.
6. **S17/S18/S21:** Provenance-of-reference first-class; surface encoding/medium-mismatch as its own state (not bare DIFFERENT) to avoid training users to dismiss the one definitive verdict; warn on secret-material paste.

**Non-issues / overstated (do not action as cruxes):**
- **S1 as a crux** — the headline "text-anchoring doesn't survive" is **false** for high-entropy substitution; do not reinstate commitment *on this basis*. (Reinstate it on the seed-observability basis instead, Tier 2.)
- "Text is unmatchable ⇒ 0 bits" framing anywhere — replace with the per-alphabet 2²⁰–2²⁴ figures.

---

## 5. BOTTOM LINE (one paragraph)

Neither headline is wholly right; the truth is between them but **closer to the rebuttal on the crux and closer to the panel on the remedy**. The panel's central claim — "text-anchoring doesn't survive, reinstate commitment because text is matched for 0 bits" (S1, Ruling 1) — is **false for the canonical high-entropy substitution case**: forging the text channel there costs 2²⁰–2²⁴ keygens per cell (×C(J,L)/C(K,L)), exactly the paper's own §5.1/§5.3 economics, and the panel manufactured the "0-bit" figure only by silently switching to the attacker-*authored*-value case, which is a different threat (relay/endpoint, not substitution). The rebuttal is right that the real fixes are the philosophy-independent ones (S3 SVG-trusts-`<text>`, S6 correlated-bit over-crediting, S9 rubber-stamping, S10 raster-forwarded-trust, S12 polyglot routing), that S1 is overstated and S2 is bounded hardening, and that S16 is the honest narrow kernel of S1. **But** the rebuttal is too dismissive of the one place the panel is genuinely right beyond the concrete bugs: the as-designed live UX runs the seed harvest and spoken code over a **screen-share** the assumed-hostile counterparty observes, which restores the last-mover steering that §5.2 commitment exists to remove — so commitment **should** be the live default, not for the panel's wrong reason (broken text) but for the right one (observable seed). So: reinstate commitment as a *conditional* live default (whenever the seed may be observed), fix the three concrete no-preimage machine-path bugs and the additive meter, scale the seed to the preset — and stop asserting "text is unmatchable" as an unconditional 0-or-24-bit claim when it is really a per-alphabet 2²⁰–2²⁴ anchor that holds for high-entropy substitution and degrades gracefully, not catastrophically.

---

## 6. CONFIDENCE AND WHAT WOULD CHANGE MY MIND

**Confidence on the crux (Q1):** **High (≈0.9).** The per-cell grind-cost arithmetic is mechanical and I verified it; the substitution-vs-authoring distinction is a clean logical split that the panel itself implicitly conceded by rating S16 only MEDIUM. The text channel is a sound anchor for high-entropy substitution.

**Confidence on Q3 (commitment):** **Medium-high (≈0.75).** The conditional ruling depends on the empirical claim that the common live UX is screen-shared and that the seed is observable on it (A13) — which is design-stated (decision E click-harvest + on-screen code) but UX-contingent.

**What would change my mind:**
- **On Q1:** evidence that the *targeted* high-entropy value types in practice are dominated by attacker-authorable or sub-24-bit-per-cell inputs (heavy use of the UTF-8 fallback, vanity values, or 5-bit alphabets with short final tokens) — that would pull the effective anchor down toward S16's regime and make the panel's pessimism more apt. Or a demonstration that a realizable keygen-grind for a *specific* deployed key type costs materially less than 2^(b·J) (e.g., structured key formats with predictable token regions).
- **On Q3:** evidence that the live UX in practice transfers the seed over a channel the counterparty's *software* cannot observe (off-screen voice only, no screen-share, no call recording) — that would vindicate the rebuttal's "commitment optional" for that deployment. Conversely, a demonstrated cheap steering attack that works *without* seed observation (pure case A) would push toward the panel's unconditional-default ruling.
- **On S2:** a measured field study (the paper's own §6.3 open problem) showing per-character homoglyph/case-drop confusion rates high enough that the few credited cells of a Quick/Strong walk lose >½ their bits — that would promote S2 from bounded hardening toward a genuine erosion of the anchor.
