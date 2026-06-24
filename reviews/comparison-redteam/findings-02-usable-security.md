# Red-Team Review — Lens: Usable Security & Verification Ceremonies

**Reviewer stance:** usable-security researcher (Signal/PGP ceremony failures, habituation, the gap between protocol-claimed and field-observed security). I attacked every decision A–G from the question *"what does a real, distracted, non-expert human actually do, and how does that diverge from the security the design assumes?"* The worst outcome — a false "verified" — is weighted heavily, and I report low-probability paths to it.

My headline: **the feature is far better-grounded than most verification UIs, but its central usable-security claim — that "soundness is anchored in the unmatchable text channel" (decision D/F) — silently re-imports the exact failure the paper's own §2.3 and §5.1 warn about. The design's security lives in *humans reading cell text correctly, with case, over a noisy channel, without clicking through.* Nothing in the design measures or enforces that this actually happens, and several UX choices actively erode it.** The paper is honest that this is untested (§5.4, §6.3); the *feature* is not equally honest at the point of use.

---

## 1. Findings

### F-1 (CRITICAL) — "Text is unmatchable" is a claim about the *channel*, not about the *human*; homoglyph/case read-error converts the unmatchable text check into a matchable one, and the design credits full bits for it anyway.

**Attacker tier:** T1+T6 (offline grind + habituated/hurried reader), live-mode counterparty optional.

**Scenario, step by step.**
1. Decision D states the meter "reaches 'verified' primarily/only via text checks" because "an attacker can't construct a real key whose tokens equal the target's in chosen positions." This is true at the level of *byte equality of the rendered glyphs*. It is **not** true at the level of *what a human reports having read*.
2. The paper itself supplies the predicate the attack needs: §2.3 — "dense fields of discrete marks are not, in practice, read — they are recognized," and reading "certifies its bits exactly" **only when "read correctly."** The spec's own font section (lines ~361) concedes the homoglyph risk is "real and security-relevant": `0`/`O`, `1`/`I`/`l`/`|`, `5`/`S`, `-`/`_`, and (in proportional fall-through fonts) `rn`/`m`, `8`/`B`.
3. The attacker does **not** need to match the target's token bytes. He needs to find an input whose cell tokens are *confusable on the human's actual font* with the target's, in exactly the cells the meter credits. Crockford-middle cells are homoglyph-clean by construction (spec line ~300), but the **head/tail/short-input cells render the input's own alphabet** — base64url, hex, base58 — which are **full of confusables** (`l`/`I`/`1`, `O`/`0`, `S`/`5`). Case is the worst: for the case-*sensitive* alphabets (base64url, base58, base64) the text channel's bits include case, and the reading convention (spec line ~93, "precede each capital with 'cap'") is exactly the high-error ceremony the usable-security literature documents.
4. The meter credits the *nominal* bits of a text cell the human says "matches," not the *effective* bits after read-error. So a human who glances at `lI1l` vs `1lII` over a video call, says "matches," and the meter advances by the full per-cell entropy — when the real distinguishing information the human transferred was a fraction of that.

**Quantifying the human error → attacker gain.** Turner et al. [4] (cited by the paper, §1.1) found comparison errors *persist even when fingerprints are chunked* and *climb with length*; Tan et al. [3] found people search for incidental cues rather than reading. Field error rates for per-character verification of confusable monospace strings are not negligible — single-character miss/confusion rates on the order of a few percent per character are well within the published range, and rise sharply under time pressure and over voice. If a "Strong/Paranoid" walk credits, say, 6–8 text cells of 4 case-sensitive characters each, and the *effective* per-character certainty against a homoglyph-optimized neighbor is materially below 1, the meter's "1 in 2^N" framing **overstates the real barrier by the product of those per-character error allowances.** Concretely: the attacker's offline grind no longer needs a 96-bit/full preimage — it needs an input whose *credited cells* are merely *confusable* with the target's on the victim's font, a vastly smaller and possibly tractable search for the handful of cells a Quick/Strong walk actually credits. **This is a direct path to a false "NO DIFFERENCE · N bits" that the user reads as "match."**

**Document grounding.** Paper §2.3 ("read correctly, it certifies its bits exactly" — the converse is the hole); §1.1 [3,4]; spec font section (homoglyph risk "real and security-relevant," lines ~361); spec reading convention (line ~93); threat-model T1/T6 and Primary win (lines 92–128, 137). The threat model **trusts** "the user's font stack to render a monospace family with reasonable glyph shapes" and "the user's attention during comparison — i.e., that the user is genuinely looking, not glancing" (lines 36–43). T4 explicitly includes "substitute a hostile or narrow-glyph font." **The feature's text-anchored-soundness claim is sound *only inside those trust assumptions*, and the UI does nothing to verify them at run time** — it cannot know which font rendered, and it credits bits as if the read were perfect.

**Recommended fix.**
- The meter MUST credit **effective**, not nominal, text bits: down-weight case-sensitive and homoglyph-bearing cells, and credit a cell's case bits only if the UI has *forced* a case-explicit read (see F-2).
- Render credited cells in a **homoglyph-hardened display form** for the *comparison surface specifically* (not the entviz SVG — closed profile, decision G), e.g. dotted-zero / slashed-zero / serifed-`I` rendering and an explicit `cap`/`dash`/`under` annotation inline, so the human is reading a disambiguated string even if their platform monospace is weak.
- Consider crediting text bits **only** from the Crockford-middle cells (large inputs) and from a forced case-by-case confirmation of short-input cells; treat the raw input-alphabet head/tail cells as recognition anchors, not as load-bearing certified bits — which is exactly what the spec says they are (lines ~291, "head/tail should be read as anchors, not as a sample").

---

### F-2 (CRITICAL) — The case-reading convention is the single highest-error step and the design gives it no forcing function; a habituated reader skips case and the meter never knows.

**Attacker tier:** T1+T6; T3 (case manipulation on case-insensitive alphabets is *defused* by normalization, but the convention error bites the case-*sensitive* alphabets).

**Scenario.**
1. For base64url/base64/base58 inputs (CESR keys, SSH keys, EOS, the UTF-8 fallback, DID/URN bodies), case is *identity* and the text channel's losslessness depends on the human reading it "taking into account case-sensitivity" (spec Guarantees, line 45; "read aloud with case," paper §4.3.1).
2. The convention is to say "cap" before each capital (spec line 93). In practice — over a voice call, under a countdown (decision E), at the end of a tedious walk — readers drop the "cap," mishear it, or stop attending to case entirely. This is the canonical safety-number field failure: people verify the *letters* and ignore the *case*, because case is cognitively expensive and the channel (voice, glance) is lossy.
3. An attacker grinding for a confusable neighbor (F-1) gets case **for free** against any reader who isn't enforcing it: he only needs same-letters-different-case, doubling-or-more his candidate space's usable matches per cell.

**Quantification.** Case-insensitivity in human fingerprint reading is among the most reliably observed errors in the ceremony literature; a conservative field estimate is that a large fraction of casual readers do not reliably transfer case over voice. Each cell where case is silently dropped converts ~1 bit/character of "certified" identity into 0 for the attacker's purposes. Across a 6–8-cell credited walk that is several bits the meter *thinks* it has and does not.

**Grounding.** Spec line 45 (lossless "taking into account case-sensitivity"), line 93 (convention), line ~234 ("Case normalization is intentional and load-bearing" — but only for case-*insensitive* alphabets; case-*sensitive* alphabets get no protection and rely entirely on the human); paper §5.4 (text "entirely color-independent" — but **not** case-error-independent). The design's own §6.3 lists "whether two lay users can run [the ceremony] without error" as **untested**.

**Fix.** For any credited cell drawn from a case-sensitive alphabet, the walk MUST present case as an **explicit discrete token the human confirms** (e.g. render `aB3x` as `a · CAP-B · 3 · x` and require the human to confirm the case pattern as a separate [Matches]/[Differs]), rather than trusting a free-form read. Do not credit a case-sensitive cell's bits until case is separately confirmed. Better: prefer crediting the **Crockford-middle** cells, which are single-case by construction (spec line ~300) and were chosen precisely to "need no capitalization cue."

---

### F-3 (HIGH) — "NO DIFFERENCE · N bits" will be read as "match" regardless of N; the four-state model's most important distinction (probabilistic vs. definitive) is the one users will collapse.

**Attacker tier:** T6 (and any honest-error case).

**Scenario.** Decision A carefully separates **NO DIFFERENCE · N bits** (probabilistic, "never a definitive equal," shown as a confidence meter) from **IDENTICAL** (machine `=`). The usable-security reality: a green-trending meter and the words "NO DIFFERENCE" read, to a distracted human, as **"it's a match, I'm done."** The numeric `N`, the meter fill, and the careful "no difference *found*" framing are exactly the kind of nuance that habituation strips. This is the Signal-safety-number "green check" problem: users learn the *gestalt of success* (the color, the affirmative word) and stop parsing the qualifier.

Worse, the brief's own framing — "shown as a confidence meter" — invites the **green = safe** heuristic the CVD section warns against, and "1 in 2^N" framing (attack-surface pool) implies an independence/guarantee that doesn't hold once human read-error (F-1/F-2) is in the loop: the real residual is not 2^-N, it's dominated by the per-cell human error floor.

**Grounding.** Paper §2.3 (recognition strips tolerance/nuance); §4.3.9 (habituated column is the security-relevant one); threat-model T6 (lines 126–128); brief decision A. The paper is explicit (§4.3.9) that "perceptual bits are far fewer than nominal bits, and saying otherwise would misstate the very quantity the comparison turns on" — a meter that shows nominal N commits exactly that misstatement at the UI.

**Fix.** Never show a bare "NO DIFFERENCE." Lead the human-driven verdict with the *limit*, not the reassurance: e.g. **"No difference found in the N checks you completed — this is NOT a guarantee the values are identical."** Reserve any affirmative/green treatment for machine-IDENTICAL only. Show the meter as *coverage of the checklist* ("you have checked 5 of 20 possible features"), not as a security thermometer, because coverage is what §5.1 says actually bounds the attacker, and it resists the green-equals-safe reflex.

---

### F-4 (HIGH) — Will users do the walk at all? "Quick" preset trains a click-through reflex that defeats the unpredictable-coverage defense of §5.2.

**Attacker tier:** T6.

**Scenario.** Decision D forces one feature at a time with [Matches]/[Differs]. The usable-security finding is blunt: **forcing clicks does not defeat habituation; it relocates it.** A user who has done this walk ten times learns the rhythm and rubber-stamps [Matches] without looking — the change-blindness/habituation result the paper cites [27,28] and §5.1's "predictability of attention." The "Quick" preset (decision B) makes this worse: a short bit target means few checks, the user reaches "verified" fast, and the *reflex that gets trained is "click through to green."* Once that reflex exists, it transfers to the Strong/Paranoid walks too — the user clicks [Matches] just as fast, they just click it more times.

The §5.2 seeded-walk defense assumes the human *actually performs each scheduled check*. The unpredictable order only helps if a skipped check has a real chance of being the differing one. A rubber-stamping human performs **zero** checks regardless of order, so the C(J,L)/C(K,L) bound (§5.2) collapses to "attacker wins if the user clicks through," independent of seed entropy or commitment.

**Quantification.** Completion/attention decay across repeated security ceremonies is steep; the realistic completion-with-attention rate at "Quick" after habituation is plausibly a small minority of sessions. The attacker's gain is total in those sessions: a click-through user provides 0 effective bits and accepts any reference.

**Grounding.** Paper §5.1 ("the predictability of the user's attention"), §2.3 [27,28], §6.3 ("whether a seeded walk holds a habituated user's attention better than an open instruction" is **untested**); threat-model "user's attention … genuinely looking, not glancing" (line 43) is a *trusted* assumption the design cannot enforce.

**Fix.** (a) Inject **attention probes**: occasionally schedule a check the human *must report as Differs* (a deliberately altered display in the ephemeral overlay layer — not the entviz, decision G) and abort/penalize on a wrong [Matches]; this both measures and disrupts rubber-stamping. (b) Make "Quick" *not* reach any affirmative verdict — cap it at PENDING with explicit "insufficient checks" language; reserve "no difference found" for Strong+ with attention-probe-validated attention. (c) Require the human to *transcribe/read back* a credited text cell (active recall), not merely click [Matches] — reading-back is far more habituation-resistant than recognition-confirm.

---

### F-5 (HIGH) — Steering by *exhaustion before the text check* survives the text-anchored meter when the human quits early, which is the common case.

**Attacker tier:** T6 + hostile counterparty software (decision F: "assume counterparty software is hostile, always").

**Scenario.** Decision D's soundness claim: a steering/compromised counterparty tool "can reorder cheap gestalt checks but cannot dodge the unmatchable text ones or manufacture a pass," because the meter reaches "verified" *primarily/only via text*. Two human-factors holes:
1. **Early abandonment.** Real users stop when the meter *looks* far enough along, not when they've completed the text checks. If the hostile counterparty steers all the cheap, satisfying gestalt checks (color bar, blank map, ellipse) to the *front* of the walk, the human watches the meter climb quickly and satisfyingly and **abandons before the front-loaded text checks the design relies on** — or accepts a Quick target that the gestalt alone nearly fills. The brief claims the order "front-loads text checks," but **a viewer-relative meter that down-weights color for a CVD viewer (§5.4) implies the order is computed from viewer-relative bit credit, which a hostile counterparty tool feeding fabricated discriminability signals can influence.** If the counterparty tool is the one computing "what this viewer can discriminate," it controls the front-loading.
2. **Viewer-relative over-crediting (a11y == security, §5.4).** §5.4 says the tool "can hold the bit target fixed and schedule more discrete checks for a viewer who cannot use the analog ones." If a hostile or simply *miscalibrated* tool *over-estimates* what a low-vision/CVD viewer can discriminate (or the viewer overstates their own ability to avoid seeming impaired), the meter credits analog bits the viewer didn't really resolve — reaching "verified" on recognition the §2.3 argument says is grindable. The CVD viewer is walked to a *false high confidence* exactly as the attack-surface pool fears.

**Grounding.** Paper §5.1 (front-loading rationale), §5.4 (viewer-relative credit — "reaching the same assurance by a longer path" assumes honest credit), §2.3 (analog channels grindable); brief decisions D, F; threat-model T6.

**Fix.** (a) Make the **text target a hard gate**, not a meter contribution: do not allow *any* affirmative verdict until a fixed minimum of *forced, case-confirmed, read-back* text cells have passed, regardless of how full the gestalt meter is. The gestalt checks may *only* drive DIFFERENT (fail-fast) and PENDING, never the affirmative. (This makes the soundness claim true by construction instead of by hoped-for ordering.) (b) Viewer-relative crediting MUST be **computed locally and conservatively** and must *never* accept discriminability self-reports from the counterparty side; cap analog credit hard and make text the only path to "verified" for *every* viewer (which §5.4 nearly says, but the meter design must enforce).

---

### F-6 (HIGH) — The two-party ceremony (decision E) puts the human under a countdown while reading the hardest-to-read material aloud — time pressure steers users toward the *less* careful path and toward manual-fallback skips.

**Attacker tier:** T1+T6, hostile-counterparty-optional.

**Scenario.** Decision E: click-to-harvest → "short spoken code to read aloud," with a "countdown/OTP window" liveness wrapper. The usable-security problems compound:
1. **Time pressure degrades exactly the text/case reading the security rests on.** A countdown induces speed; speed induces case-drop (F-2), homoglyph error (F-1), and "good enough" acceptance. The paper's §6.3 flags "whether two lay users can run that step over a phone call without error" as untested; the countdown *predictably worsens* that error rate. Time pressure pushes users to the **manual fallback ("say a short number")**, which the brief offers as the easy escape — and the easy escape is the lowest-entropy, most-mishearable path.
2. **Mishearing the spoken code over voice.** A click-derived code read aloud is a homoglyph/phonetic-confusable channel of its own ("b"/"d"/"e"/"g"/"p"/"t"/"v"/"three" all collide on a bad line). A misheard seed yields a *different ordering on the two sides* — and the design must decide what happens then. If a mismatch in derived order silently produces different checklists that the two humans nonetheless both [Match] through, you can get a **false agreement** where neither party actually verified the same features.
3. **The ~14-bit/no-commitment reasoning is a *protocol* argument that assumes the humans transfer the seed faithfully.** §5.2 is explicit that "a seed too short … lets the attacker do somewhat better than the bound" and that the bound "assumes the seeded order is effectively uniform." Human seed-transfer error (mishearing, truncating "two 3–4-digit numbers") *reduces realized seed entropy below the ~14-bit floor*, which §5.2 says makes the coverage bound optimistic — and decision E drops commitment precisely on the strength of that 14-bit figure. **Human error in the seed channel directly undermines the no-commitment justification.**

**Grounding.** Paper §5.2 (commitment removes last-mover advantage; "below [the entropy threshold] the walk realizes too few orderings and the bound is optimistic"), §5.2 second subtlety (tiny human nonces), §6.3 (untested); brief decision E (countdown is "liveness only … NOT claimed to lower entropy demand"); threat-model T1.

**Fix.** (a) Drop hard countdowns from the human-read step; use a *generous, non-anxiety-inducing* freshness window and put the time pressure on the machine (nonce grind detection), not the human. (b) Require **read-back confirmation of the seed code** before the walk starts, with phonetic-alphabet rendering ("bravo-three-seven"), and **abort if the two sides' derived checklists don't agree on a hashed checksum** — never let two divergent checklists both reach "verified." (c) Reconsider dropping commitment for the *casual* default: the no-commitment argument leans on text-anchoring (F-1/F-2/F-5 show that anchor is human-eroded) *and* on a 14-bit seed that human error shrinks. At minimum, make the seed comfortably exceed 14 bits *after* expected human-transfer loss.

---

### F-7 (MEDIUM) — The two-button mode selector (decision B) hides a security-relevant decision and will be mis-picked, sending users down the weaker engine.

**Attacker tier:** social-engineering / T6.

**Scenario.** Decision B collapses everything to "I have something to check it against" (auto-detect) vs. "I'm comparing live." Two usable-security failures:
1. **Wrong-mode selection.** A user who *has* a machine-readable reference but is also on a call may pick "live" (because they're live), throwing away the **machine-IDENTICAL** verdict they could have gotten from pasting, and instead running the weaker human walk. Conversely, a user pressured by an attacker on a call ("just paste what I send you") is steered into the paste path with an **attacker-chosen reference** — the trust-boundary problem (decision F: "proves sameness, not trustworthiness"). The UX makes the unsafe action (accept the attacker's reference) the easy/default one.
2. **Auto-detect spoofing.** "Auto-detects text vs SVG vs raster vs URL." A polyglot (valid SVG that also parses as something else, or a raster that's actually an SVG-with-`<image>`, or a value-shaped string that's actually a URL) can route the input to a *different engine than the user believes*, including the **raster engine that can only DIFFERENT/UNKNOWN, never EQUAL** (decision C) — or, more dangerously, away from it. If an attacker can get a hand-crafted artifact classified as "pasted SVG" (which yields machine-IDENTICAL on value-level reconstruction, decision C) instead of "raster" (which refuses EQUAL), they may obtain a definitive IDENTICAL on an artifact the raster engine would have refused.

**Grounding.** Brief decisions B, C, F; threat-model T2 (controls rendering surface), Secondary win "render differently depending on … alphabet classification" (lines 145–147), and the encoding-detection-by-disproof ambiguity the spec documents (line 231, bech32 `1` caveat — classification is not always what the user expects). Spec §closed-profile and equivalence relation matter here: an SVG's render model is recoverable (Tier A) only if it *is* a conformant entviz; a near-conformant attacker SVG that the value-engine "reconstructs" could mislead.

**Fix.** (a) When a machine-readable reference is present *and* a live call is happening, surface both verdicts and label them: "machine says IDENTICAL on the value you pasted; that proves it equals the *pasted* reference, not the one your caller is showing." (b) Auto-detection must be **explicit and confirmable** ("I detected an SVG — is that what you meant to check?") and must *fail closed* into the weakest applicable engine on ambiguity (raster/UNKNOWN), never the strongest. Never let a polyglot upgrade itself from raster to value-level SVG.

---

### F-8 (MEDIUM) — The endpoint-trust limit (decision F) and the "sameness ≠ trustworthiness" boundary are comprehension failures waiting to happen; no real user derives the right scope from a green verdict.

**Attacker tier:** T6 / social engineering / attacker-chosen reference.

**Scenario.** Decision F honestly *states* (a) a compromised counterparty endpoint can fool its own user (Signal-safety-number parity) and (b) the comparison "proves these two values are the same, never that the reference is the one you should trust." The usable-security reality: **users do not read or retain scope caveats; they over-trust the affirmative.** A user who reaches "NO DIFFERENCE" against an **attacker-supplied reference** (pasted value, dropped SVG, or a URL the attacker induced them to fetch) concludes "verified — safe to proceed," when all they verified is "the value I hold equals the value the attacker gave me." This is the deepest over-trust hole and it is *outside* the text-anchored-soundness argument entirely — soundness of "sameness" is irrelevant when the reference itself is attacker-chosen.

**Grounding.** Brief decision F (trust boundary; URL-fetch CORS/referrer/attacker-chosen-reference); threat-model "the comparison proves 'these two values are the same,' never 'the reference is the one you should trust'"; paper §1.1 (the cost of the human bottleneck is "a man-in-the-middle compromise, a misdirected payment").

**Fix.** Make **provenance of the reference** a first-class, persistent part of the verdict, not a caveat: "You verified your value equals **the reference you pasted/this caller showed you**. That is only meaningful if you already trust where that reference came from." For URL-fetched references, surface the origin and the privacy leak *before* fetch, and never present a URL-fetched reference with the same authority as a locally-held known-good copy.

---

### F-9 (MEDIUM) — Secrets pasted into the tool; the easy path is the unsafe one.

**Attacker tier:** any; also out-of-scope-per-threat-model but a real UX harm.

**Scenario.** The naive flow is "paste your value." Users will paste **secret** material (private keys, seed phrases) into a comparison tool, especially if the UI says "paste what you want to check." The threat model explicitly puts "Confidentiality of the input" and "clipboard tampering" **out of scope** (lines 165–171) — which is defensible for the algorithm but means **the feature must not lull users into pasting secrets.** entviz is "a comparison aid, not a secrecy primitive" (threat-model line 165), yet the UI's easy default invites exactly the secrecy-sensitive paste.

**Grounding.** Threat-model Out-of-scope (lines 163–171); lens "where does the UX make the unsafe action the easy/default one."

**Fix.** Detect high-risk inputs (mnemonic word-lists, anything matching known private-key formats) and warn before processing; prefer comparing **public** identifiers; make clear the value may be processed/retained by the page; offer a "compare without my value leaving this device" assurance only if it's actually true.

### F-10 (LOW) — Raster *false DIFFERENT* as a denial/social-engineering lever.

**Attacker tier:** T2/T4.

A hostile reference image (slightly off-palette, degraded) that trips the fidelity self-probe into "bail to human" or yields DIFFERENT can be used to **manufacture distrust** of a *legitimate* value ("see, the tool says they're different — don't trust that key, use mine instead"). The raster engine's correct conservatism (never EQUAL) has a social-engineering dual: a too-easily-triggered DIFFERENT/UNKNOWN drives users to abandon the safe value. **Grounding:** decision C; attack-surface pool ("false DIFFERENT becomes a denial/social-engineering lever"). **Fix:** distinguish "these differ" from "I couldn't read the reference well enough to tell" loudly in the UI, and never let an *unreadable reference* present as a *confirmed difference*.

### F-11 (LOW / NIT) — >512-bit case: the meter must not credit head/tail "matches" as identity bits.

For >512-bit inputs the text channel is head + 4 Crockford-middle + tail, and head/tail are **anchors, not identity** (spec lines ~291; paper §4.3.8). A human-driven walk that credits head/tail text "matches" toward the meter is crediting recognition anchors as certified bits — the attacker only needs to match head+tail (T5), which is *cheaper* than the 96-bit middle preimage. The meter's text credit for large inputs MUST come from the **Crockford-middle** cells, with head/tail explicitly labeled "anchor — not proof." **Grounding:** spec large-input subsection, T5.

---

## 2. Contradictions / silent weakenings of the spec, paper, or threat model

- **C-1 (decision D vs. paper §2.3 & §5.4).** D claims soundness is anchored in "unmatchable text" so a hostile counterparty "gains nothing." The paper's §2.3 says text certifies its bits **only when read correctly**, and §5.4 ties accessibility to *honest* viewer-relative credit. D silently upgrades "text is unmatchable *as bytes*" into "text is unmatchable *as the human transfers it*," which §2.3 explicitly denies for a habituated/inattentive reader. **The feature's central soundness claim is stronger than the paper supports.** (F-1/F-2/F-5.)

- **C-2 (decision E vs. paper §5.2).** §5.2 says the coverage bound "assumes the seeded order is effectively uniform … which requires the seed to carry about fourteen [bits]" and that "a seed too short … lets the attacker do somewhat better than the bound." E sets the requirement *at* ~14 bits ("two 3–4-digit numbers clear it") with commitment dropped — leaving **no margin for human seed-transfer loss** (mishearing, truncation). §5.2 itself says below-threshold seeds make the bound "optimistic." E silently assumes lossless human seed transfer that §6.3 lists as untested. **The no-commitment justification is weakened by the very human error the paper declines to bound.**

- **C-3 (decision A vs. paper §4.3.9).** §4.3.9: "We deliberately do not claim that entviz 'represents all bits perceptibly'; perceptual bits are far fewer than nominal bits." A "NO DIFFERENCE · N bits" meter that shows *nominal* credited bits (and that a human reads as a guarantee) commits the misstatement the paper refuses. The verdict UI weakens the paper's careful epistemics. (F-3.)

- **C-4 (decision D viewer-relative crediting vs. threat-model F/T6).** §5.4's "schedule more discrete checks for a viewer who cannot use the analog ones" is sound only if the credit is computed *honestly and locally*. Decision F assumes hostile counterparty software. If the meter's viewer-relative accounting can be influenced by the (hostile) counterparty's discriminability signals, §5.4's accessibility-equals-security property is **inverted** into accessibility-equals-attack-surface. The two decisions are in tension and the design doesn't reconcile them. (F-5.)

- **C-5 (threat-model trust assumptions vs. feature claims).** The threat model *trusts* the font stack and the user's genuine attention (lines 36–43). The feature's text-anchored soundness is asserted unconditionally, but it **only holds inside those trust assumptions**, and T4 explicitly lets an attacker substitute a narrow-glyph font. The feature should state that its soundness is *conditional on T4 not holding and on attentive reading* — it currently presents soundness as unconditional. (F-1, F-4.)

---

## 3. Novel attacks (not in the attack-surface pool)

- **N-1: The habituation-transfer attack across presets.** Because Quick/Strong/Paranoid share the same [Matches]/[Differs] gesture, a *trained* click-through reflex from frequent Quick use **transfers** to a one-off Strong/Paranoid session. The attacker doesn't need the victim to be on Quick at attack time — he needs the victim to have *become a Quick-trained clicker*, then face the substituted reference on any preset. This is a temporal/cross-session attack the per-session presets don't model. (Mitigation: F-4's attention probes; make the affirmative gesture *active recall*, not recognition-confirm, so the trained reflex can't satisfy it.)

- **N-2: Screen-share seed observation in click-to-harvest.** Decision E harvests entropy from (x,y)+timestamp of a click and shows a spoken code. In a **screen-shared call** (the canonical "comparing live" setup for remote workers), the counterparty (or a meeting recorder, or anyone on the call) **sees the click position and the on-screen code**, collapsing the harvested entropy to near-zero for an observer. The brief's pool mentions "screen-share observability" for *click-harvest entropy estimates*, but the **ceremony itself routinely runs over screen-share**, which is a stronger statement: in the most common live setting, the human-sourced seed is *not secret from the very counterparty whose software you assume hostile*. This re-opens the last-mover/steering advantage that commitment was dropped to avoid — a hostile counterparty who *sees* your nonce contribution before committing theirs can steer the seed. (Mitigation: never display the seed on a surface that's likely screen-shared; require the spoken code be transferred over a channel the counterparty's *software* doesn't see; or restore commitment for live mode specifically.)

- **N-3: "Cap"-convention phonetic injection over voice.** In live mode, an attacker-in-the-middle on the audio (or a hostile counterparty) can **inject or suppress the word "cap"** to flip a reader's case interpretation without changing the letters — turning a case-sensitive mismatch into a perceived match (or vice versa for denial). Because case is the load-bearing bit for case-sensitive alphabets (F-2) and is carried by a *single easily-injected syllable*, the voice channel's case convention is a uniquely fragile injection point. (Mitigation: phonetic case rendering — "uppercase Bravo" — that resists single-word injection, and read-back confirmation.)

- **N-4: Meter-shape spoofing in the ephemeral overlay.** Decision D mounts a confidence meter as an "ephemeral overlay off the entviz SVG." A hostile *counterparty tool* (decision F) renders *its own* meter; it can simply **draw a near-full meter regardless of checks** to induce the victim's early abandonment (F-5) — the victim's own tool is honest, but the victim is watching a shared screen showing the attacker's tool's meter. The closed-profile guarantee (decision G) protects the *entviz*, but **not the meter chrome**, which is exactly the surface a screen-sharing attacker controls. (Mitigation: in live mode, the victim must trust *only their own endpoint's* meter, prominently labeled — and the design's own F principle says so, but the UI must make the victim's-own-meter the only one that counts and visually unspoofable.)

---

## 4. Lens verdict

**Within the usable-security / verification-ceremony lens:**

**Sound (survives attack):**
- The **closed profile (G)** and the **DIFFERENT-is-definitive, fail-fast** half of the verdict model (A): a single mismatch proving inequality is robust to human factors — it's the *easy*, *fail-safe* direction, and habituation only ever causes *missed* differences, never *false* differences, so the human-error vector can't manufacture a false DIFFERENT from a true match. Good.
- **Raster "never EQUAL" (C):** correct conservatism; the only residual is the social-engineering false-DIFFERENT lever (F-10), which is low.
- **Reserving machine-IDENTICAL for true machine reads (A):** the *concept* is right; the risk is purely that humans will read "NO DIFFERENCE" as IDENTICAL (F-3), a presentation problem, not a model problem.

**Broken (as a usable-security claim, not as a protocol):**
- **The text-anchored-soundness claim (D, F).** It is sound *about the channel* and *false about the human*. F-1/F-2/F-5 show that homoglyph error, case-drop, early abandonment, and viewer-relative over-crediting each erode the "unmatchable text" anchor, and the meter credits nominal bits as if the read were perfect. **This is the load-bearing claim of the feature and it does not survive a habituated, hurried, voice-channel human without the forcing functions (hard text gate, case confirmation, read-back, attention probes) the design currently lacks.**
- **The verdict presentation (A).** "NO DIFFERENCE · N bits" as a green-ish meter will be read as a match (F-3).
- **The "Quick" preset (B)** as a path to any affirmative verdict — it trains the reflex that defeats the whole §5.2 defense (F-4, N-1).

**Needs rework:**
- **Two-party ceremony (E):** countdown time-pressure (F-6), screen-share seed leakage (N-2), and case-injection over voice (N-3) need redesign; the seed-entropy margin needs to exceed 14 bits *after* human loss.
- **Mode selector / auto-detect (B):** explicit confirmation, fail-closed (F-7).
- **Trust-boundary comprehension (F):** provenance-of-reference must be first-class, not a caveat (F-8).

**Ruling on the two questions the brief asks me to settle:**

1. **Does dropping cryptographic commitment survive attack?** *Not in live mode, no — not on usable-security grounds.* The drop is justified on two legs: (a) text-anchoring replaces it, and (b) a ~14-bit seed suffices. Leg (a) is the broken claim above (F-1/F-2/F-5). Leg (b) has **no margin for human seed-transfer error** (F-6/C-2) and is defeated outright by screen-share observation of the seed (N-2), which restores the last-mover steering advantage commitment existed to remove. The paper itself (§5.2) says a sub-threshold seed makes the bound "optimistic" and (§6.3) lists the whole ceremony as untested. **Recommendation: keep commitment for live mode** (or make the seed comfortably super-threshold *and* unobservable by the counterparty), and treat the "high-assurance option" framing as backwards — commitment should be the live default, not the upsell. The drop is defensible *only* for the non-adversarial casual paste path where there is no counterparty to steer.

2. **Does anchoring soundness in the text channel survive attack?** *As a protocol argument against a hostile counterparty's machine, yes — bytes are bytes. As a usable-security guarantee about what the human actually certifies, no.* It survives **only** if the feature adds the forcing functions the current design omits: (i) a **hard text gate** (no affirmative verdict without a minimum of forced text checks; gestalt may only fail-fast), (ii) **case-explicit, read-back confirmation** of credited text cells, (iii) **homoglyph-hardened display** of credited cells, (iv) **effective-bit (not nominal-bit) crediting**, and (v) **attention probes** to detect rubber-stamping. With those five, the text anchor becomes real and the design is strong. Without them, the text anchor is a claim about a careful reader the design's own §2.3/§5.1/§6.3 say we cannot assume — and the feature's worst outcome, a false "verified," is reachable by a T1+T6 attacker grinding for a *confusable* (not byte-equal) neighbor against the handful of cells a habituated human actually, imperfectly, reads.

**Bottom line for the synthesis:** the architecture is right and the honesty in the paper is exemplary, but the *feature* spends its soundness on a human behavior (correct, case-aware, complete, attentive text reading) that it neither enforces nor measures. Move the security from *hoped-for human reading* to *enforced human reading*, and the text anchor holds; leave it as a meter that credits glances, and it doesn't.
