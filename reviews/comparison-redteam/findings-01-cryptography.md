I have all the quantitative grounding I need. I have read all three required documents in full plus the design decisions A–G. Now I'll write the complete report.

A few more crucial analytical points I want to nail down before writing:

1. **The "text is unmatchable" claim's central flaw**: It assumes the *user's* value is the real key and the *attacker's* is the value being checked against it. But in the live two-party walk (decision E/D), BOTH parties read text aloud from THEIR OWN tool. The text "unmatchability" protects the holder of a *genuine high-entropy* value — but the attacker who supplies the *reference* can choose any value, including one whose cells the attacker fully controls. The soundness claim "attacker can't construct a real key whose tokens equal the target's in chosen positions" inverts the actual attack: the attacker doesn't need to match the *target's* tokens — the attacker controls the reference and the victim is comparing against it. What the attacker needs is for the victim's tool (possibly compromised, decision F) or the victim's *reading* to agree. The text channel is only "unmatchable" when the comparison is against a *fixed honest target the attacker must collide*. In the live case the attacker isn't colliding — they're substituting.

2. **The IDENTICAL-for-pasted-SVG claim contradicts the spec's own equivalence relation.** Decision C/A says pasted-SVG → value-level compare → can reach machine-IDENTICAL. But the spec (Equivalence relation) says two SVGs are conformant-equivalent iff render models equal AND rasters match. Reconstructing "normalized core from cell texts" for ≤512-bit only recovers the *text channel*; for >512-bit it explicitly *can't* (head/tail/fingerprint). And the AR-invariant claim drops geometry that the equivalence relation treats as identity (`data-input-bytes` excluded is fine, but the render model includes much more). More importantly: pasted SVG is attacker-authorable (closed profile is only enforced by a checker the comparison tool must actually run — decision G says displayed entviz is unmodified, but a *pasted reference* SVG is not produced by our renderer).

Let me write the report now.

I have completed the required reading (spec.md v11 in full, entviz-paper.md in full, threat-model.md in full; pill-design.md does not exist at the given path) and the quantitative re-derivations. Here is my report.

---

# Red-team report — Lens: Cryptography & Protocol

**Reviewer stance:** practising cryptographer (commitments, SAS, coin-flipping, partial-preimage economics). I treated every security argument as wrong until its math survived attack. Bottom line up front: **the headline cryptographic relaxations in decisions E and D do not survive contact.** Dropping commitment is justified by a "text-anchored soundness" argument that (a) misidentifies who controls which value in the live attack, and (b) is silently under-provisioned with seed entropy at exactly the Strong/Paranoid presets where users believe they are buying more security. Several findings below reach the worst outcome in the brief: a path to a false "no difference / verified."

Citations: spec = `entviz/docs/spec.md` (v11); paper = `entviz/docs/entviz-paper.md`; TM = `entviz/docs/threat-model.md`; decisions A–G and the attack-surface pool from the common brief.

---

## 1. Findings

### F1 — CRITICAL. "Text is unmatchable" defends the wrong direction in the live two-party walk; the attacker substitutes rather than collides.

**Decisions attacked:** D (text-anchored soundness), F ("counterparty software cannot undermine *your* verdict's soundness").

**The claim (brief D/F):** "for high-entropy values cell text is *unmatchable* (an attacker can't construct a real key whose tokens equal the target's in chosen positions), so a steering or fully-compromised counterparty tool gains nothing." Lens file: "analyze whether 'text is unmatchable' truly makes steering profitless."

**Why it breaks.** The unmatchability argument is a *near-collision* argument (paper §5.1, §3.2, TM "Primary win"): given a **fixed honest target T**, the attacker must find `A ≠ T` whose displayed cells equal T's in the checked positions. That is genuinely ~24 bits/cell of partial preimage **when the attacker is forced to collide a value they do not control.** But the live walk (decisions D, E) is not a collision game — it is a **substitution** game, and the threat model's primary win is explicitly stated as "produce `A ≠ B` such that the user concludes they are the same" (TM "Attacker win conditions"), with the canonical MITM being a relay between Alice and Bob (paper §5.2: "or a man in the middle relaying between them").

In the MITM relay, the attacker does **not** have to make their value's cells equal the *victim's* value. The attacker controls the *reference the victim compares against* (the counterparty is hostile by assumption — decision F). The attacker simply presents value `A` of their own choosing on the wire. The victim reads *their own* tool's cells for the victim's value `V`; the attacker, on the other end, reads cells for `A`. For the walk to pass, the two read-aloud streams must agree. There are two cases:

- **Attacker wants the victim to accept `A` as "the value we both hold."** Then the attacker needs `entviz(A)` to read identically to `entviz(V)` in the checked cells. Here `V` is the honest party's value — and crucially, **`V` may itself be attacker-chosen or attacker-influenced** (the trust-boundary caveat in F: "proves sameness, never that the reference is the one you should trust"; the attacker-chosen-reference problem). If the *protocol's purpose* is for the victim to confirm "the key the attacker just sent me equals the key the attacker claims to hold," text unmatchability provides **zero** protection: both values are attacker-supplied, so the attacker sets all cells freely (my calc: attacker-chosen value ⇒ 0-bit cost to match any chosen cell pattern). The text channel certifies "these two attacker-values are equal," which is true and useless.

The design's own decision F admits the irreducible case (compromised endpoint). But it then **over-claims** the residual: "the counterparty's software cannot undermine *your* verdict's soundness, because soundness is anchored in the unmatchable text channel." That is false whenever the **value under comparison is not a secret the victim independently generated** — i.e., the entire class of "is the key/address you just sent me the right one?" flows, which is the dominant real-world use (paper §1.1: SSH host keys, payment addresses, safety numbers — in all of which one side is *receiving* a value from the other). Text is unmatchable only against a target the attacker must **collide**; it is perfectly matchable against a value the attacker **authors**.

**Scenario (T1+T6, plus hostile counterparty per F):**
1. Mallory MITMs a call between Alice and Bob who are establishing a shared key/contact.
2. Mallory runs a key with Alice (value `M_A`) and a different key with Bob (`M_B`), as in any safety-number MITM.
3. Mallory's tools display `entviz(M_A)` to Alice and `entviz(M_B)` to Bob — but Mallory *chose both values*, so Mallory can make the displayed cells **identical** on both ends (set `M_A` and `M_B` to render the same text channel; trivially, use the same value on both ends if the underlying transport lets Mallory present one value to both — or grind cheap gestalt and set text equal by choosing the cells).
4. Alice and Bob run the seeded walk, read cells aloud, **agree on every text check**, and the meter reaches "no difference found / N bits."
5. Both conclude they share a key. They do not. **Primary win.**

The text channel did not stop this because **no honest fixed target existed for Mallory to collide** — Mallory supplied both sides. The "unmatchable" property requires an honest, attacker-uncontrolled `T`; the live mode frequently has none.

**Grounding.** Paper §5.2 (MITM relay is in scope); TM primary win and T6; decision F's own "compromised endpoint is irreducible" — but F's *removal* of "counterparty can undermine soundness" is the over-claim. Paper §5.4 even says text-heavy walks make the habituated user "close to the careful one" — but a careful *full reading* (paper §5.3) only certifies "the value I am reading equals the value you are reading," never "this value is the legitimate one." The design's trust-boundary note (F) acknowledges this for the *reference* but then contradicts it by anchoring *soundness* in text.

**Fix.** Stop claiming text-anchoring restores soundness against a hostile counterparty. State precisely: text unmatchability defends only the **collision** sub-case (attacker must match a value the victim generated and the attacker cannot see/choose). For the **substitution/relay** sub-case it provides nothing beyond what commitment+SAS provides — which is exactly why §5.2 mandated commitment. Reinstate commit-and-reveal as the default for live mode (see F3), and surface that "no difference" means "same as the reference," never "the reference is authentic" (the trust-boundary, promoted from a footnote to a verdict-screen statement).

---

### F2 — CRITICAL. The ~14-bit seed is sized for the *Quick* walk and is under-entropied for Strong/Paranoid, silently breaking the uniformity premise the C(J,L)/C(K,L) bound rests on.

**Decision attacked:** E (entropy requirement ~14 bits; "two 3–4-digit numbers clear it"), and the Quick/Strong/Paranoid knob in B.

**Re-derivation.** Paper §5.2 states the survival bound `C(J,L)/C(K,L)` **"assumes the seeded order is effectively uniform over the C(K,L) possible check sets, which requires the seed to carry about log₂ C(K,L) bits — roughly fourteen for the example above."** That example is **K=20, L=5**: I confirm `log₂ C(20,5) = 13.92 ≈ 14`. So **14 bits is the requirement for a 5-check walk over a 20-item list — i.e. the *Quick* preset.**

But the Quick/Strong/Paranoid knob (decision B) maps to *more checks* `L` at higher assurance. The required seed entropy is `log₂ C(K,L)`, and it **grows with L**:

| Preset (illustrative K=20) | L (checks) | Required seed entropy `log₂ C(20,L)` |
|---|---|---|
| Quick | 5 | **13.9 bits** |
| Strong | 8 | **16.9 bits** |
| Paranoid | 12 | **16.9 bits** |
| Paranoid, K=24 | 12 | **21.4 bits** |
| Paranoid, K=24 | 16 | **19.5 bits** |

(Computed exactly.) So decision E's flat "~14 bits is enough, two 3-digit numbers (~20 bits) clear it" is **only true for Quick**. At Strong/Paranoid the seed must carry **17–21 bits** for the uniformity premise to hold. Two 3-digit numbers give **19.9 bits** (confirmed) — which clears Quick and Strong but **fails Paranoid at K≥24** (needs 21.4). Two 2-digit numbers give **13.3 bits** — fails even Quick.

**Why this is critical, not a nit.** When the seed is *shorter than* `log₂ C(K,L)`, the seeded order realizes **fewer than C(K,L) distinct check-sets**, so the order is **not uniform**, and the paper is explicit about the consequence: *"A seed too short to realize that many orderings lets the attacker do somewhat better than the bound"* (§5.2), and *"below it, the walk realizes too few orderings and the bound above is optimistic"* (§5.2 end). The attacker, knowing the (public, deterministic) seed→order map and knowing the seed space is small, can **enumerate all realizable orderings offline** and pick an input `A` matched to the J items that survive the *most* of them. The bound `C(J,L)/C(K,L)` is then **not** the attacker's success probability — the true probability is higher, and **the design never tells the user.**

The danger is *inverted* by the UI: the Paranoid user believes they bought the strongest guarantee, but the seed-entropy demand grew faster than the harvested entropy, so Paranoid can be **further from uniform** than Quick. The brief (pool: "Confidence presets: do bit→preset mappings correspond to real security against a grinding attacker (§5.1's C(J,L)/C(K,L))?") asks exactly this. Answer: **no, not at the high presets, unless seed entropy scales with `log₂ C(K,L)` per preset.**

**Scenario (T1+T6).**
1. Victim picks **Paranoid** (K=24, L=12), expecting maximal assurance, and uses the friendly click-harvest (≈14 bits, see F4).
2. Required uniformity entropy is `log₂ C(24,12) = 21.4` bits; the seed carries ~14. The realizable orderings number ≈2¹⁴, not C(24,12)≈2.7M.
3. Attacker, who matched J=14 of 24 items by gestalt grind (cheap, see F5), enumerates the ≈16k realizable orders offline and confirms a large fraction never schedule any of the 10 unmatched items in the first 12 — because the order map is far from uniform over check-sets, structured low-entropy seeds cluster.
4. Walk passes at a "Paranoid" confidence the bound says should be `C(14,12)/C(24,12) ≈ 7×10⁻⁴`, but the real survival is materially higher. **False "verified."**

**Grounding.** Paper §5.2 (the uniformity premise and its two explicit failure warnings); decision E (flat 14-bit claim); decision B (presets → bit thresholds). The design imports §5.2's *bound* but drops §5.2's *premise-scaling*.

**Fix.** Make required seed entropy a function of the preset: `seed_bits ≥ log₂ C(K, L_preset)`, enforced *before* the walk starts; if the harvest is short, demand more harvesting (longer spoken code) rather than silently running a non-uniform order. Better: derive the order with a seeded CSPRNG/Fisher–Yates so that *any* seed ≥ `log₂ C(K,L)` realizes a (near-)uniform permutation, and **block** Strong/Paranoid until enough entropy is collected. Surface the actual realizable-uniformity, not the nominal bound.

---

### F3 — HIGH. Dropping commitment is unsound against a *steering* counterparty even with text-anchoring; the last-mover advantage §5.2 closes with commitment is reintroduced.

**Decision attacked:** E ("commitment is dropped in the standard model... Cryptographic commitment offered only as a high-assurance option"), justified by F (text-anchored soundness).

**The cryptographic point §5.2 settled.** Paper §5.2, second paragraph: *"If Alice announces her nonce first, Bob — or a man in the middle relaying — can pick his own nonce to steer the seed toward an ordering that spares the attacker's unmatched checks. The fix is commitment... the commitment is what removes the last mover's advantage [39]."* This is Blum coin-flipping [38]: without commitment, the last mover controls the output distribution. The design (E) **removes** the fix and substitutes text-anchoring as the replacement.

**Why text-anchoring is not a substitute.** Text-anchoring (D) only helps if **every surviving ordering still forces an unmatchable text check into the first L positions.** But the steering attacker's whole goal is to choose a nonce that pushes the **matched** items (the cheap gestalt the attacker *did* grind, plus any text cells the attacker controls) to the front and the **unmatched** items to the back. Three reasons text-anchoring fails to stop this:

1. **Steering + F1.** If the value is attacker-authored (F1's substitution case), there *are no unmatchable text cells* — the attacker matched them all for free. Steering then trivially front-loads a passing walk. Text-anchoring presupposes the existence of unmatchable cells; the substitution attacker removes that supposition.
2. **Steering toward gestalt-then-stop (the brief's named attack).** Pool: *"Steering the order to exhaust the bit target on gestalt before any text check."* Decision D claims the meter "reaches verified primarily/only via text." But the meter credits **viewer-relative bits** (D, §5.4). A CVD viewer credits *more* bits to text and *fewer* to color — but a **steering counterparty that controls the order** can place the cheap, attacker-matched gestalt/landmark checks first, and if the bit *target* is reached before the order forces a text cell, the walk stops at "no difference." Whether text is reached first is a property of the **order**, which the last mover controls **precisely because commitment was dropped.** The "primarily/only via text" claim is an assertion about a *uniform* order; the steering attacker defeats it by making the order non-uniform — which is exactly what commitment existed to prevent.
3. **Grinding a steering nonce in milliseconds (explicitly conceded).** Decision E concedes the countdown/OTP window does *not* "stop a tool that grinds a steering nonce in ms." So the only thing that *could* stop steering — commitment — is the thing dropped. The concession in E is an admission that the standard-model live walk has **no defense against last-mover steering at all.**

**Quantified.** With commitment, the attacker who matched J of K survives at `C(J,L)/C(K,L)` (e.g. K=20, J=10, L=5 → 1.63×10⁻²). Without commitment, the steering last-mover does not draw a random L-subset — it **chooses among the seeds it can force** to maximize the chance all L land in J. In the limit where the attacker can force any of the ≈2^{seed_bits} orders and seed_bits < log₂ C(K,L), the attacker's success approaches `1` for any ordering whose first L checks ⊆ J that the seed space can realize. Even partial steering (controlling the second nonce after seeing the first commitment-free reveal) lets the attacker bias the seed by its full nonce entropy. The bound becomes **decorative.**

**Grounding.** Paper §5.2 ("removes the last mover's advantage [39]"), §6.2 Principle 6 ("a committed, then revealed, shared nonce — so the attacker must match the whole picture"), [38][39]. Decision E contradicts all three by dropping commitment as default. TM T6 + T1.

**Fix.** Commitment is **not** a "high-assurance option" — per the paper's own §5.2/§6.2 it is the property that makes the partial-comparison bound meaningful. Make commit-and-reveal the **default** whenever the order is seed-derived and either party's software is untrusted (which decision F says is *always*). The randomizer requirement (paper §5.2 "second subtlety": commit over nonce ‖ high-entropy opening, else hiding fails for a 2-digit nonce) must ship with it.

---

### F4 — HIGH. Click-harvest entropy is over-estimated; center-bias, timing quantization, and screen-share observability can drop it well below the ~14-bit floor — and below the seed requirement of F2.

**Decision attacked:** E (click-to-harvest: hash `(x,y)+high-res timestamp`; "Entropy requirement is only ~14 bits").

**The estimate is not stated, so I bound it adversarially.** A single click yields `(x, y, t)`. Honest upper bounds:

- **Position (x,y).** Users do **not** click uniformly. Fitts/centre-bias: clicks cluster on the prompt target. A realistic effective area is a ~50×50 px disk around the button → `log₂(2500) ≈ 11` bits *nominal*, but center-bias and snapping to UI affordances cut the usable distribution to perhaps **6–9 bits**. If the prompt is a small button, fewer.
- **Timestamp.** "High-res timestamp" sounds large, but browser `performance.now()` is **deliberately clamped** (Spectre mitigations: 100 µs–1 ms resolution, plus jitter, in every major browser). Over a ~1 s human reaction window at 1 ms resolution that is ≤10 bits nominal, but human reaction-time jitter is **autocorrelated and low-entropy** (σ ≈ tens of ms, heavy-tailed) → **5–8 bits** usable. If the clock is clamped to 1 ms and the user clicks promptly, the realizable timestamp entropy can be **<6 bits.**

Summed and de-correlated, a friendly single-click harvest realistically delivers **~12–17 bits**, *and the design itself pegs the requirement at ~14*. That leaves **no margin** — and per F2, Strong/Paranoid need **17–21 bits**, which a single click frequently **cannot** reach. The "brief mouse move" variant is better (a path is more entropy) but is the non-default.

**Screen-share / observability (the brief's named concern).** Pool: *"screen-share observability of the gesture."* In a live call the user is frequently **screen-sharing**. If the harvest gesture (click position, visible cursor) is on the shared screen, the attacker **observes (x,y) directly** and recovers the timestamp from the shared video frame timing — collapsing the harvested entropy toward **0**. The spoken code derived from it is then **predictable**, and combined with no-commitment (F3) the attacker steers the seed freely. This is a total break of the human-entropy premise (decision E: "Entropy must be human-sourced to defeat a backdoored/weak RNG") — the entropy is sourced, then *leaked on the same channel.*

**Scenario (T1+T6+T2 observe-share).**
1. Victim on a screen-shared call clicks to harvest; attacker sees the click coordinates and frame time.
2. Attacker reconstructs the nonce, hence the spoken code, hence the seed and order.
3. With no commitment (F3), attacker also controls/predicts the order → front-loads matched checks → walk passes. **False verified.**

**Grounding.** Decision E (click-harvest, ~14-bit requirement, human-sourced entropy rationale); paper §5.2 (seed must carry ~log₂ C(K,L) bits; "a seed too short... lets the attacker do better than the bound"). The brief's pool item on click-harvest estimates.

**Fix.** (a) Never derive the harvest from a gesture on a shared screen — detect screen-share and force the manual spoken-number path, or harvest off-screen. (b) Measure realized entropy (min-entropy of the click model) and require the **brief-mouse-move** path, not a single click, whenever Strong/Paranoid is selected. (c) Treat `performance.now()` as ≤8 bits and do not advertise "high-res timestamp" as a large source. (d) Gate the walk on **measured** min-entropy ≥ `log₂ C(K,L_preset)` (F2's enforcement).

---

### F5 — HIGH. The gestalt channels are cheap to grind (tens to hundreds of SHA-512 evals), so a steered/non-uniform order can exhaust a Quick bit-target on gestalt alone.

**Decisions attacked:** D (meter credits viewer-relative bits; "down-weights color for CVD"), A ("NO DIFFERENCE · N bits" meter), B (Quick preset), F.

**Grind costs (per channel, expected evals to match one habituated target), from the paper's own habituated bit estimates (Table 3) and the ellipse audit (§4.3.6):**

| Channel | Habituated bits (paper Table 3 / §4.3.6) | Expected grind to match |
|---|---|---|
| Entviz background | 2 | ~4 |
| Color bar | 3–5 | 8–32 |
| Ellipse | 4–7; audit 0.5–2.2% collision | **45–200** |
| Blank positions + map | 3–6 | 8–64 |
| Quartile marks | 2–4 | 4–16 |
| Two bar markers | ~6 (domain-separated) | 64 |

(All confirmed numerically.) **Every gestalt channel is matchable in ≤~200 SHA-512 evaluations.** The full habituated gestalt total (paper §4.3.9: **20–40 bits**) is `2²⁰–2⁴⁰` evals; at a commodity GPU farm (~10⁹/s) that is **1 ms to ~18 minutes** — and a *T1 attacker is defined as iterating "millions to billions"* (TM T1). So matching the **entire** habituated gestalt is within T1's stated budget, and matching **any single landmark** is essentially free.

**The break.** The meter credits **viewer-relative bits** (D, §5.4): a CVD viewer is credited *more* for discrete checks and the order "front-loads text." But for a **non-CVD** viewer the meter credits the gestalt channels their habituated bits — and those are the channels the attacker grinds cheaply. If the **order is steerable** (F3, no commitment) or merely **non-uniform** (F2, short seed), the attacker arranges for the first L checks at the chosen preset to be drawn from the cheap, already-matched gestalt set. The Quick preset's bit target is small (it is the "few-check" preset), so it can be **satisfied entirely by matched gestalt before any unmatchable text cell is scheduled.** The "verified primarily/only via text" claim (D) holds **only** if the order is forced to reach text — which depends on uniformity (F2) and commitment (F3), both broken.

**Quick is the dangerous preset (brief pool: "does Quick give dangerous false assurance?").** Quick = small L. With small L and cheap gestalt, a steering or non-uniform order reaches the Quick target on gestalt the attacker matched in <1 s of grinding. **Quick can be passed by a T1 attacker who never matched a single text cell.** That is a false "no difference."

**Grounding.** Paper §4.3.9 Table 3 (habituated 20–40 bits; per-channel breakdown); §4.3.6 (ellipse 0.5–2.2% collision); §5.1 (partial-comparison security = difficulty of matching *every checked feature at once* — but the attacker chooses which features by steering the order); TM T1 (millions–billions), T6; decision D's viewer-relative crediting; spec background-color rationale (2 bits, "~4 candidate inputs" — the spec itself concedes per-channel cheapness).

**Fix.** The meter must credit bits **only** on checks the attacker cannot cheaply grind for the *specific input class* — and must **require a floor of unmatchable text bits** before any "no difference" verdict, independent of viewer. Do not let gestalt bits alone reach a pass. For a CVD viewer who genuinely cannot read color, the answer is *more text checks* (paper §5.4), **not** crediting analog landmarks the attacker grinds — re-credit color to ~0 for everyone in adversarial mode, not just CVD viewers, since the color bits are grindable regardless of who can see them.

---

### F6 — HIGH. "N bits ≈ 1 in 2^N" smuggles in a channel-independence assumption that the correlated fingerprint channels violate, over-stating the meter.

**Decisions attacked:** A (the "N bits" meter shown as a 1-in-2^N confidence), D.

**The cryptographic error.** The meter accumulates "bits" across checks and presents `2^{−N}` as the residual false-pass probability (brief A: "shown as a confidence meter"; pool: "Does the '1 in 2^N' framing imply independence/guarantee that doesn't hold?"). Summing bits across checks is valid **only if the checks are independent.** They are not:

- **All primary-fingerprint channels are functions of one 512-bit digest.** Surround pattern, color bar, ellipse, blank positions, quartile marks, background, and edge-singletons (spec: "Most of the entviz is drawn from the fingerprint") are **deterministic functions of the same SHA-512(core).** Matching the color bar and matching the ellipse are **not independent events** for a grinding attacker — both are read off the digest the attacker is grinding. The paper is careful about this (§4.3.9: "two different quantities hide inside 'how many bits'... the *work* to grind a near-collision... a question about a chosen pair, answered by the difficulty of matching that feature set **all at once**"). The correct quantity is the **joint** grind difficulty, **not** the sum of per-channel bits. Summing over-counts whenever channels are correlated.
- **Edge color carries 0 independent bits** (paper §4.3.4: "deterministic from nucleus background... zero independent bits") yet a naïve per-check meter could credit a viewer for "matching the edge color." The surround *edge-color singletons* (spec v10 Casual avalanche) are 2 bits each but are **derived from the same used-ftok quant** that drives the cell's surround pattern and (for quartile cells) the quartile placement — correlated, not additive.
- **The domain-separated channels are the *only* independent ones** (the second-digest middle cells and the two bar markers — paper §4.3.8, §4.3.5: independence is a *property the design had to engineer via domain separation*, precisely because the rest are correlated). So the meter may **only** add bits cleanly across {primary-gestalt-as-a-block, second-digest-text/markers, input-text-cells}, not across the individual primary channels.

**Consequence.** A meter that reaches "Strong / 30 bits" by summing color-bar + ellipse + blank-map + quartile bits is reporting a number that the **joint** grind cost does not back. The real residual is closer to `2^{−(joint habituated gestalt entropy)}`, which the paper itself caps at **20–40 bits for the *entire* gestalt** (§4.3.9) — i.e. you cannot honestly credit more gestalt bits than the whole gestalt holds, no matter how many gestalt checks you schedule. A per-check additive meter will **exceed** that ceiling and show false confidence.

**Grounding.** Paper §4.3.9 (joint vs. per-channel; "all at once"); §4.3.4 (edge = 0 bits); §4.3.5/§4.3.8 (independence engineered only via domain separation); spec "Most of the entviz is drawn from the fingerprint." Decision A's confidence-meter framing.

**Fix.** Cap credited gestalt bits at the joint habituated gestalt ceiling (≤ the §4.3.9 figure for that grid). Only the **text cells**, the **second-digest middle/markers**, and **distinct text cells** add independently. Display the meter as "no difference found across the checks performed," never as a `1-in-2^N` probability that implies independence. Document that re-checking more gestalt landmarks does **not** raise assurance once the gestalt ceiling is hit.

---

### F7 — HIGH. Pasted-SVG → machine-IDENTICAL contradicts the spec's equivalence relation and trusts an attacker-authored artifact.

**Decisions attacked:** A (IDENTICAL "reserved for when the machine compared both sides in full — pasted text / pasted SVG"), C (SVG engine: "compare at the value level... reconstruct normalized core from cell texts"), G (closed profile).

**Two problems.**

**(a) Reconstruction is not the spec's equality.** The spec defines equality precisely: two SVGs are **conformant-equivalent iff their render models are equal (Tier A) AND their canonical rasters match (Tier B)** (spec "Equivalence relation"). The render model (spec "The render model (Tier A)") includes **far more than cell text**: nucleus RGB, edge colors, all 24 surround bits per cell, color-bar band order/rank/letters, marker slots, ellipse params, blank-map min/max positions, labels, truncation flag. Decision C reconstructs only the **normalized core from cell texts** (≤512) or "AR-invariant fingerprint-derived fields." That recovers the **text channel and recomputes the fingerprint** — which is actually *sufficient for value equality* (since everything else is a deterministic function of the core). **But that means the SVG's other channels are never checked against the recomputed model.** A pasted reference SVG whose cells say value `X` but whose **gestalt channels were drawn for value `Y`** (an inconsistent / hand-forged SVG — trivially possible since the attacker authored the file) would be reconstructed to core `X`, compared to the victim's `X`, and declared **IDENTICAL** — while *visually* it is the entviz of `Y`. The closed-profile checker (G, spec `validate_closed_profile`) only constrains *element types*, not *cross-channel consistency*: nothing in the spec requires a pasted SVG's color bar to actually match SHA-512(its own cells). So "IDENTICAL" can be asserted for an SVG that **no conformant renderer would ever produce**, and whose pixels show a different value than the verdict claims.

**(b) >512-bit cannot reach IDENTICAL at all.** For >512-bit inputs the cells are head/tail + a **fingerprint readout** (spec "Large-input handling"); the core is **not reconstructible** from the cells (only 384 head/tail bits + a 96-bit second-digest readout are present). So decision C's "reconstruct normalized core from cell texts" is **impossible** above 512 bits, yet decision A lists "pasted SVG" as a machine-IDENTICAL path without the ≤512 caveat. Asserting IDENTICAL on a >512-bit pasted SVG would be **unsound** — at best you can confirm head+tail+second-digest-readout match (which F1/§4.3.8 say is a 96-bit barrier *for a collision*, but **0 for an attacker-authored reference**).

**Grounding.** Spec "Equivalence relation," "The render model (Tier A)," "Closed profile" (only element-type enforcement), "Large-input handling" (core not recoverable); decision A/C. The brief's pool: "is 'human full read → never IDENTICAL' correct... can the machine certify (or can't even for pasted SVG)?"

**Fix.** Before emitting IDENTICAL for a pasted SVG, **re-render** the reconstructed core ourselves and require **full render-model + raster equivalence** against the pasted SVG (the spec's actual relation), not just core equality — i.e. verify the pasted SVG is *self-consistent* (its gestalt matches SHA-512 of its own cells). If it is inconsistent, that is a **forgery signal**, not IDENTICAL. For >512-bit, **never** emit IDENTICAL from a pasted SVG (the core is unrecoverable); cap at "head/tail/second-digest match" with the explicit 96-bit-collision / 0-bit-substitution caveat.

---

### F8 — MEDIUM. Raster fidelity self-probe is grindable: an attacker can pass the probe yet mislead, because the probed regions are input-independent constants.

**Decision attacked:** C (Raster engine: "fidelity self-probe — sample known-exact regions (bounding fill `#ffffff`, borders `#808080`, color-bar bands = exact palette entries); if exact, trust nucleus/colorbar/ellipse sampling enough to disprove on mismatch").

**The flaw.** The probe samples regions whose correct values are **fixed constants independent of the input**: white fill `#ffffff`, gray borders `#808080`, and palette-entry band colors (the palette is the fixed 5-color set, spec "possible edge colors"). An attacker authoring a raster (decision C explicitly assumes a **hand-drawn raster** is possible) can paint **exactly** `#ffffff`, `#808080`, and the exact palette hexes in the probed regions **while drawing anything elsewhere.** The probe certifies "this image was rendered at full fidelity by a faithful rasterizer" — but those constants are the easiest pixels in the image to forge, and forging them is **decoupled** from the identity-bearing nucleus/text/gestalt content (decision C's own premise: "color and text are not bound in an attacker-authored image"). So the probe's success **does not** license trusting the nucleus/colorbar/ellipse sampling for **disproof**, because the same hand author who faked the probe regions controls the sampled regions too.

**Why it is only MEDIUM.** Decision C wisely restricts raster auto-checks to **DIFFERENT or UNKNOWN, never EQUAL** — so the worst outcome is not a false EQUAL. The residual harms are: (a) a **false DIFFERENT** as a denial/social-engineering lever (pool: "a false DIFFERENT becomes a denial/social-engineering lever") — an attacker crafts a raster that passes the probe and forces a spurious DIFFERENT on the *honest* reference, training the user to distrust a correct value or to fall back to a manipulable channel; and (b) **mis-calibrated trust** — the user believes "the tool sampled the colors and they matched, so it's probably fine," upgrading a should-be-UNKNOWN to a felt-EQUAL in the human's head even though the tool only said "no difference detected." Combined with F1 (substitution), a probe-passing raster that *visually* matches but is a different value lets a screen-shared or pasted reference look authoritative.

**Grounding.** Decision C (probe construction; raster never EQUAL); spec palette (fixed constants); TM T1 (hand-crafted inputs) and "false DIFFERENT" is a *secondary-win-adjacent* social lever. Pool item on raster fidelity probe.

**Fix.** Recognize the probe proves **rasterizer fidelity, not content authenticity** — and that the two are independent for a hand-authored image. Use the probe only to decide whether *sampling is reliable enough to disprove*, and **never** let a probe-pass soften the UI toward "looks fine." When the probe passes but content sampling is ambiguous, output **UNKNOWN**, not a quiet lean. Treat a forced DIFFERENT on a probe-passing raster as **UNKNOWN + "re-acquire the reference by a non-raster channel,"** to deny the false-DIFFERENT social lever.

---

### F9 — MEDIUM. The countdown/OTP window is correctly labeled "liveness only," but pairing it with a dropped commitment removes the *only* thing that constrained the last mover, so liveness theater can read as security.

**Decision attacked:** E (countdown is "a liveness wrapper only... explicitly NOT claimed to lower entropy demand or stop a tool that grinds a steering nonce in ms").

**Assessment.** The design is **honest** here — it explicitly disclaims that the countdown buys any cryptographic property. Cryptographically the countdown buys **nothing** against a T1 attacker: SHA-512 grinding of a steering nonce in the ms-to-seconds window is conceded (E), and freshness/anti-replay are not the threat (the threat is a *fresh* MITM, not replay). So I confirm the lens question ("Does the countdown buy any cryptographic property, or is it security theater dressed as liveness?"): **it is liveness theater with no cryptographic content**, and the design says so. The finding is **not** that the claim is dishonest — it is that **a visible countdown reads to users as "secure ceremony in progress,"** and when commitment is *also* dropped (F3), the ceremony's only visible rigor is the theater. A user who sees a tense countdown and a spoken code will over-trust the result. This is a UX-amplified version of F3.

**Grounding.** Decision E (countdown = liveness only, concedes ms-grind); paper §5.2 (the property that mattered was commitment, not timing). TM T6 (habituated over-trust).

**Fix.** If commitment is reinstated as default (F3), the countdown can stay as honest liveness. If commitment is *not* reinstated, **remove the countdown** rather than display a security-flavored animation that has no security content — its only effect is to manufacture unearned confidence.

---

### F10 — MEDIUM. "Text is unmatchable" fails for the named low-entropy / attacker-controlled input classes; the meter must not credit full text bits for them.

**Decisions attacked:** D (text-anchored soundness rationale: "an attacker can't construct a real key whose tokens equal the target's in chosen positions"), and the brief pool ("Is 'text is unmatchable' actually true? UUIDs, sequential IDs, attacker-influenced hashes, vanity values...").

**Where the claim fails (with bit-costs).** Text unmatchability assumes each checked cell is **24 bits of preimage** the attacker cannot cheaply hit. That is false for whole input classes the spec explicitly supports:

- **Attacker-chosen value (vanity / fully controlled):** 0 bits. If the attacker authors the value (F1 substitution, or "attacker-chosen reference," trust boundary in F), every cell is free. The spec supports arbitrary inputs (UTF-8 fallback), so nothing stops an attacker-authored value.
- **Low-entropy / structured identifiers:** A **sequential ID, snowflake, or small-range UUIDv7** has most bits fixed/predictable. The nucleus color and cell text of such inputs are **not** 24 independent bits — a snowflake's leading cells are a near-constant timestamp prefix (spec "snowflake... 42-bit timestamp"). Matching the *checked* head cells of a structured ID can cost **far less than 24 bits/cell** because the attacker only needs to match the *varying* low-order portion. For a value where the attacker controls/knows part of the entropy (TM T1 "attacker-influenced hashes"), the matched-cell count `J` rises and the F2/F5 grind cheapens.
- **The extended (short) final token:** spec extends partial tokens by **bit-repetition** (spec "extend the bits... repeating low-order bits"). A bech32/base32/crockford final cell carries only **20 real bits** (the high 20; the low 4 are a deterministic repeat). So a "24-bit" final text cell is only **20 bits of preimage** — and the *displayed* glyphs of the repeated tail are predictable. Crediting it as 24 bits over-counts the meter by 4 bits/such cell.
- **>512-bit head/tail/middle split:** per F1/F7, the head/tail are real input (collidable only against an honest target; free against an authored one) and the middle is a 96-bit second-digest readout — **not** "the whole value." The meter must not credit ">512-bit, all 20 text cells matched" as full-value certainty; it is at most head+tail+96-bit-second-digest, and **0** against a substitution.

**Grounding.** Spec "snowflake" (structured), partial-token bit-extension, large-input handling; TM T1; decision D's exact wording; pool item. Paper §5.1 (security = matching *what the user checks*, which for low-entropy inputs is cheap).

**Fix.** Make the meter **input-class-aware**: credit a text cell only its **actual min-entropy** (e.g. ≤20 bits for a bit-extended 5-bit final token; near-0 for predictable structured-ID prefixes), and **0** for any value the local side did not independently generate (it cannot distinguish authored from honest, so in adversarial/live mode it must assume authored). For >512-bit, cap text credit at head+tail+96-bit-second-digest with the substitution caveat. Never let "all visible text cells matched" imply "value certain" for structured or attacker-influencible inputs.

---

### F11 — LOW. Homoglyph/read-aloud convention errors silently degrade text-cell entropy in exactly the live-read mode where text is load-bearing.

**Decisions attacked:** D (text checks carry the hard bits), E (spoken codes/read-aloud).

**Point.** The whole text-anchoring edifice (D) assumes a read-aloud cell **certifies its bits exactly** (paper §2.3: "Read correctly, it certifies its bits exactly"). But the spec itself flags the homoglyph risk as **security-relevant** (spec font-family note: "`0`/`O`, `1`/`I`/`l`/`|`, `5`/`S`, `-`/`_`... an entviz is only as trustworthy as the user's ability to distinguish characters"), and the read-aloud convention ("cap" prefix, "dash", "under" — spec "Thoughts About Comparing") adds human error surface. In a **live** walk over a voice call (decision E), the certifying act is a human **speaking and hearing** a code — a noisy channel. Each homoglyph confusion or dropped "cap" is **a bit (or more) of text entropy the attacker gets for free** against an honest comparison, and a **near-collision lever** (an attacker grinds a value whose cells differ from the target only in `0/O`, `1/l`, `5/S` positions, which the §3.2 careful reader is supposed to catch but a tired voice-call reader will not). This **reduces the effective unmatchable text bits** that F3/F5 rely on to force a non-gestalt pass.

**Grounding.** Spec font-family/homoglyph note (explicitly "security-relevant"); paper §2.3 ("read correctly"); §6.3 (legibility of small glyphs "amenable to measurement... not left at the math"). Decisions D/E.

**Fix.** When the walk depends on a text check for soundness (which F3/F5 say it must), bias cell content / spot-check selection toward **homoglyph-free** cells (the Crockford middle cells already are — spec excludes `i/l/o/u`), and prefer the JetBrains-Mono-class disambiguating font in the comparison UI. Discount text-cell credit for cells containing the known-confusable glyph set when read aloud rather than pasted.

---

## 2. Contradictions (design vs. spec / paper / threat-model)

1. **Commitment dropped vs. paper §5.2 / §6.2 Principle 6.** Decision E makes commitment a "high-assurance option"; the paper makes it **the** property that removes the last-mover advantage and makes the C(J,L)/C(K,L) bound meaningful (§5.2 "the commitment is what removes the last mover's advantage [39]"; §6.2 Principle 6 "a committed, then revealed, shared nonce"). Direct contradiction. (F3)

2. **Flat ~14-bit seed vs. paper §5.2 premise.** Decision E states ~14 bits suffices; §5.2 ties the requirement to `log₂ C(K,L)`, which the Strong/Paranoid presets push to **17–21 bits** (computed). The design imports the bound but drops its scaling premise, and §5.2 explicitly warns a too-short seed makes the bound "optimistic." (F2)

3. **"Soundness anchored in text, counterparty cannot undermine it" vs. paper §5.2 MITM-relay and §5.4.** Decision F removes "counterparty can undermine your verdict's soundness." But §5.2's MITM relay and §5.3's read-it-all both only certify "same as the value I am reading," never authenticity, and the substitution attack (F1) undermines soundness without matching any unmatchable cell. (F1)

4. **Pasted-SVG → IDENTICAL vs. spec "Equivalence relation."** Decision A/C reach IDENTICAL by reconstructing the core from cells; the spec's equality is render-model **and** raster equivalence (full channel set), and for >512-bit the core is **unrecoverable** from cells (spec "Large-input handling"). Asserting IDENTICAL on a self-inconsistent or >512-bit pasted SVG contradicts the equivalence relation. (F7)

5. **"N bits = 1 in 2^N" confidence meter vs. paper §4.3.9.** The paper insists the security quantity is the **joint** grind difficulty ("all at once"), with most channels correlated through one digest, and caps the *entire* habituated gestalt at 20–40 bits. A per-check additive meter contradicts this by summing correlated channels and can exceed the gestalt ceiling. (F6)

6. **Countdown framing.** Decision E honestly disclaims cryptographic value, but presenting it in a security ceremony (with commitment dropped) contradicts paper §5.2's identification of commitment — not timing — as the operative defense. (F9; this is a presentation contradiction, not a claim contradiction.)

7. **User-note sanitization mismatch (spec vs. threat-model, pre-existing).** Spec "User note" / "Error conditions" require **1–10 printable-ASCII** `[\x20-\x7E]` (space + punctuation allowed); TM "User note" still says **"ASCII alphanumeric, single token, ≤8 chars... no whitespace."** These disagree on length (10 vs 8), charset (printable-ASCII incl. space/punct vs alphanumeric-only), and whitespace. Low security impact (a *mismatched* note only makes entvizes look *more* different — the safe direction, per spec/TM), but the two normative docs contradict each other and the TM should be updated to the spec's v10/v11 `[\x20-\x7E]{1,10}` rule. (Nit-tier, flagged for the synthesizer.)

---

## 3. Novel attacks (not in the pool)

**N1 — Preset-downgrade via seed-entropy starvation (combines F2+F4).** Because the seed-entropy *requirement* rises with the preset (F2) but the friendly click-harvest *supply* does not (F4), selecting **Paranoid** can leave the walk *further* from uniform than **Quick** — an inversion where the "stronger" setting is cryptographically weaker for the same harvest. An attacker who can nudge a victim toward Paranoid (social engineering: "use the strongest mode") while the victim uses single-click harvest gets a **less uniform**, more steerable order than if the victim had used Quick. The UI's monotonic "more paranoid = more secure" mental model is **false** under starved entropy. Fix: gate each preset on *measured* harvested entropy ≥ `log₂ C(K,L_preset)`; never let a preset run with insufficient seed.

**N2 — Cross-channel consistency oracle absent in pasted SVG (sharpens F7 into a forgery primitive).** Since no spec rule forces a pasted reference SVG's gestalt to equal SHA-512 of its own cells, an attacker can ship a **chimera SVG**: cells reading the victim's value `V` (so reconstruction → IDENTICAL), gestalt drawn for `V'` (so a careful *human* who later glances sees a different picture than the machine certified). This decouples the *machine verdict* (IDENTICAL on `V`) from the *human gestalt* (looks like `V'`), so the attacker can make the human and the machine disagree about which value was confirmed — useful for later repudiation or for steering a human who re-checks visually. Fix per F7: require self-consistency (re-render and full-equivalence) before IDENTICAL.

**N3 — Edge-singleton/quartile correlation leak (sharpens F6).** v10 makes three cells' surround edge color fingerprint-derived from the **same used-ftok quant** that already drives that cell's surround pattern and (for the two quartile cells) its quartile placement (spec "Fingerprint-edge cells (v10)"). A meter that credits "edge-color match," "surround-pattern match," and "quartile match" as separate bits on those cells **triple-counts** one underlying ftok quant. An attacker grinding to match the quartile cell automatically matches its edge singleton and is partway to its surround — the meter over-credits these correlated checks. Fix: treat each used-ftok-derived check on a given cell as **one** credit, not three.

---

## 4. Lens verdict

Within the cryptography/protocol lens:

- **Sound:** The **96-bit domain-separated middle** (spec "Large-input handling"; paper §4.3.8) is a genuinely sound construction *as a collision barrier* — injective, domain-separated, correct bit-cost (2⁹⁶, confirmed). The **bar markers' domain separation** (second digest) is correct and adds clean independent bits. The **text-not-bytes fingerprint** (spec; TM "Fingerprint hashes text") is the right call against T3 malleability. The **countdown's honesty** (E explicitly disclaims crypto value) is commendable even though I recommend removing it. The **raster never-EQUAL rule** (C) is the right conservative cut.

- **Broken (need rework before shipping):**
  - **Dropping cryptographic commitment (E):** **Broken.** It contradicts the paper's own §5.2/§6.2 and is not rescued by text-anchoring, because text-anchoring (i) presupposes an honest fixed target that the live substitution/relay attack removes (F1), (ii) presupposes a uniform, unsteerable order that no-commitment + short seed both destroy (F2, F3), and (iii) presupposes unmatchable text cells that low-entropy/attacker-authored inputs do not provide (F10). **Ruling: dropping commitment does NOT survive attack. Reinstate commit-and-reveal (with the §5.2 high-entropy randomizer) as the default for live mode.**
  - **Anchoring soundness in the text channel (D, F):** **Broken as stated.** Text-anchoring is a real defense **only** in the narrow collision sub-case (attacker must collide a value the victim independently generated and the attacker cannot author). In the dominant substitution/relay flow it provides nothing beyond commitment+SAS — which the design removed. **Ruling: text-anchoring does NOT replace commitment; it is a complement that holds only when (a) the value is locally generated and (b) the order is provably uniform and committed.** Both conditions must be enforced, not assumed.
  - **The ~14-bit flat seed (E):** **Broken at Strong/Paranoid** — under-entropied by 3–7 bits exactly where users expect more assurance (F2, N1).
  - **The "N bits = 1 in 2^N" meter (A):** **Broken** — smuggles channel independence that the single-digest gestalt violates (F6, N3).

- **Need rework (not fatal):** pasted-SVG IDENTICAL must add a self-consistency check and exclude >512-bit (F7); the raster fidelity probe must be re-scoped to "fidelity, not authenticity" (F8); click-harvest must be gated on measured min-entropy and screen-share-aware (F4); the meter must become input-class- and correlation-aware (F5, F6, F10).

**Single most dangerous path to a false "verified":** F1 ∘ F3 ∘ F5 — a hostile/MITM counterparty (assumed always, per F) authors both compared values or relays between two victims, drops commitment so it steers the seeded order, and front-loads cheaply-ground gestalt checks to exhaust a **Quick** bit-target before any (anyway-matchable) text cell is scheduled. No unmatchable text check is ever forced; the meter shows "no difference found." The design's claim that this is impossible rests entirely on the text-anchored-soundness argument, which **fails** for the reasons in F1/F3/F10. **Commitment must come back, and the meter must require a floor of genuinely-unmatchable text bits — locally-generated, full-entropy, homoglyph-clean — before any "no difference" verdict.**
agentId: ad1ace7d6c31ceab7 (use SendMessage with to: 'ad1ace7d6c31ceab7' to continue this agent)
<usage>subagent_tokens: 142074
tool_uses: 12
duration_ms: 379398</usage>
