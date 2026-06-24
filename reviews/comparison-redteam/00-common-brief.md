# Common brief — entviz comparison feature red-team

> This is the shared brief for an independent panel of security reviewers. Your specific
> **lens** is in a separate file you have also been told to read. **Lead with your lens, but
> range freely** — the most dangerous flaws in this design are cross-domain, so follow a
> thread into another domain if it bites. You are **one of several independent reviewers**;
> a later synthesis integrates and dedups, so **do not soften, defer, or try to be
> balanced** — push your attack to its hardest conclusion.

## Your mandate

**Break these design decisions; do not validate them.** Treat each as flawed until you have
genuinely tried and failed to break it. The worst outcome for this feature is a **false
"verified" / "identical"** — a user concluding two values match when they don't — so weight
effort toward any path, even low-probability, to that outcome. Ground every finding in the
required reading and cite sections. Explicitly flag any place the design **contradicts or
silently weakens** the spec, paper, or threat model.

## Required reading (read FULLY and carefully before critiquing)

1. `/home/daniel/code/entviz/docs/spec.md` — the entviz specification ("Thoughts About
   Comparing", Guarantees, Concepts, Conformance/render-model/equivalence, large-input).
2. `/home/daniel/code/entviz/docs/entviz-paper.md` — the paper (§5.1 partial-comparison
   security, §5.2 the seeded committed two-party walk + its two subtleties, §5.3 read-it-all,
   §5.4 accessibility==security, §2.3 reading vs recognizing, §4.3.9 perceptual-entropy budget).
3. `/home/daniel/code/entviz/docs/threat-model.md` — assets, trust boundaries, attacker
   tiers (T1/T2/T6), win conditions, user-note section.

Optional: `/home/daniel/code/entviz-js/packages/react/docs/pill-design.md` (recognition ≠
verification; closed profile; comparison-text definition; an entviz is a *visualization*,
not a "fingerprint").

## What the feature is

A UI that helps a human decide whether *their* entviz matches a *reference*. The reference
arrives as: pasted value/text, pasted/dropped SVG, pasted/dropped/linked raster image, or
**another person on a live call** (no machine-readable reference). The entviz is a closed,
deterministic artifact whose **text channel is lossless ≤512 bits**; its other channels
(surround, nucleus color, color bar, ellipse, blank-cell CRC) are **fingerprint-derived**;
for >512-bit inputs the text channel shows head + 4 middle cells (a second domain-separated
fingerprint in Crockford base32) + tail.

## Design decisions to red-team (attack each — they are stated precisely)

**A. Verdict model — four states, with proof asymmetry.**
DIFFERENT (definitive; any single mismatch proves inequality with certainty) · PENDING ·
**NO DIFFERENCE · N bits** (probabilistic partial pass, shown as a confidence meter, never a
definitive "equal") · **IDENTICAL** (definitive `=`; reserved for when the *machine*
compared both sides in full — pasted text / pasted SVG — or a tool-driven *complete* read).
Claim: **a human-driven comparison can never reach machine-IDENTICAL**; human reading only
fills the meter (reaching ~certainty for a complete ≤512 read, but framed "no difference
found", not the machine's `=`).

**B. User surface — two situational choices + one knob.**
Naive user picks only **"I have something to check it against"** (paste/drop/link →
engine **auto-detects** text vs SVG vs raster vs URL) or **"I'm comparing live with another
person"**. No security mode (casual/adversarial, commitment, entropy method, nonce length) is
ever surfaced; all derived. Only exposed security knob: a confidence target **Quick / Strong
/ Paranoid** → bit thresholds.

**C. Per-medium engines.**
- *Text*: normalize both, compare normalized cores / comparison-texts → definitive.
  Distinguishes "reference entropy" (compare values) from "reference comparison-text"
  (compare text channel).
- *SVG*: compare at the **value level** (reconstruct normalized core from cell texts ≤512;
  AR-invariant fingerprint-derived fields otherwise) so the verdict is **aspect-ratio
  independent**; re-render ours to the reference grid only for *visual* alignment.
- *Raster*: **cannot prove equal, only disprove**, because the reference may be a
  **hand-drawn raster with correct colors/layout but wrong text** (color and text are not
  bound in an attacker-authored image; text is the only identity channel; we do **not** OCR).
  Engine: **fidelity self-probe** first — sample known-exact regions (bounding fill
  `#ffffff`, borders `#808080`, color-bar bands = exact palette entries); if exact, trust
  nucleus/colorbar/ellipse sampling enough to **disprove** on mismatch; if degraded, bail to
  human. **Raster auto-checks may only output DIFFERENT or UNKNOWN — never EQUAL.**

**D. Guided walk (raster-fallback and live cases).**
Highlight one feature at a time via a focus ring **around (never over)** the feature, as an
**ephemeral overlay off the entviz SVG** (closed profile preserved), in a non-palette/
non-verdict color + a non-color shape cue (CVD). Per step the human reports
**[Matches]/[Differs]**; one Differs → certain DIFFERENT. A confidence meter mounts, counting
**viewer-relative bits** (§5.4) — credited by what *this* viewer can discriminate, so the
order **front-loads text checks** and down-weights color for a CVD viewer.
**Text-anchored soundness:** the meter reaches "verified" primarily/only via **text** checks;
rationale: for high-entropy values cell text is **unmatchable** (an attacker can't construct a
real key whose tokens equal the target's in chosen positions), so a steering or
fully-compromised counterparty tool **gains nothing** — it can reorder cheap gestalt checks
but cannot dodge the unmatchable text ones or manufacture a pass.

**E. Two-party seed mechanics (live mode).**
Entropy must be **human-sourced** (defeat a backdoored/weak RNG). Friendly default:
**click-to-harvest** — one click (or brief mouse move); tool hashes **(x,y)+high-res
timestamp** into the nonce, then shows a **short spoken code** to read aloud (manual fallback:
say a short number). **Entropy requirement is only ~14 bits** (≈ log₂ C(K,L), to make the
check *order* uniform — the paper's figure), NOT brute-force-grade, because the **commitment
is dropped** in the standard model; two 3–4-digit numbers (~20–26 bits) clear it. A
**countdown/OTP window** is a **liveness wrapper only** (freshness/anti-replay/rhythm) —
explicitly NOT claimed to lower entropy demand or stop a tool that grinds a steering nonce in
ms. Cryptographic commitment (longer codes) is offered **only as a "high-assurance" option**.

**F. Trust model.**
Assume the **counterparty's software is hostile**, always. **Irreducible, unfixable:** each
party must trust *their own endpoint* — a compromised counterparty tool can show its own user
a fabricated entviz and have them read matching values; no two-party protocol survives a
compromised endpoint (same limit as Signal safety numbers); the design **states** this rather
than papering over it. **Removed:** the counterparty's software cannot undermine *your*
verdict's soundness, because soundness is anchored in the (unmatchable) text channel (D).
**Trust boundary:** the comparison proves "these two values are the same," never "the
reference is the one you should trust"; URL-fetched references add CORS limits, a
privacy/referrer leak, and the attacker-chosen-reference problem.

**G. Closed profile.** No chrome/overlay/highlight is ever baked into the entviz SVG; the
displayed entviz is always the unmodified conformant artifact.

## Attack-surface pool (shared — find more; your lens file says which to emphasize)

- **Is "text is unmatchable" actually true?** Partial preimages; structured/low-entropy/
  non-key inputs (UUIDs, sequential IDs, attacker-influenced hashes, vanity values); the
  short final (extended) token; values where the attacker controls/knows part of the entropy;
  the >512-bit case (text = head/tail/fingerprint, not the whole value). How many text cells
  can a realistic T1/T6 attacker match, and does that break the text-anchored meter?
- **Can compromised counterparty software still force a false pass** despite the
  text-anchored meter? Steering the order to exhaust the bit target on gestalt before any text
  check; mis-crediting bits; exploiting viewer-relative accounting; feeding its own user a
  fabricated entviz (and whether our side detects the inconsistency).
- **Human factors:** homoglyph/case errors (`0`/`O`, `1`/`l`/`I`, `5`/`S`, `-`/`_`), the
  cap/dash/under reading convention, click-through fatigue, countdown time-pressure errors,
  whether users do the walk at all (§2.3).
- **The ~14-bit / no-commitment reasoning:** is dropping commitment safe once we assume
  hostile counterparty *software*? Does text-anchoring fully replace commitment, or are there
  inputs/orders where steering still wins? Is the seed-entropy figure right? Are the
  click-harvest entropy estimates (center-bias, timing jitter, screen-share observability)
  defensible?
- **Raster engine:** can an attacker craft a raster that **passes the fidelity probe** yet
  misleads? Any path where raster emits EQUAL, or where a *false DIFFERENT* becomes a
  denial/social-engineering lever? Degraded-raster fallbacks.
- **Four-state model:** any way a probabilistic "N bits" pass is perceived as / promoted to
  definitive `=`? Is "human full read → never IDENTICAL" correct or mis-calibrated? Does the
  "1 in 2^N" framing imply independence/guarantee that doesn't hold?
- **Confidence presets:** does "Quick" give dangerous false assurance? Do bit→preset mappings
  correspond to real security against a grinding attacker (§5.1's C(J,L)/C(K,L))?
- **UX/auto-detection:** does collapsing modes into two buttons hide a security-relevant
  decision? Can medium auto-detection be spoofed (polyglots, an SVG that rasterizes
  differently than its render model, an image masquerading as SVG)?
- **Trust boundary & secrets:** is "proves sameness, not trustworthiness" surfaced strongly
  enough? Clipboard/secret exposure when pasting values; attacker-chosen-reference and privacy
  leaks of URL fetch.
- **a11y == security (§5.4):** can a CVD or low-vision user be walked to a *false* high
  confidence? Does viewer-relative bit accounting over-credit?

## What to return (your report format)

1. **Findings** — each with: severity (**critical / high / medium / low / nit**), the
   concrete **attack or failure scenario** (step by step, with attacker tier), **document
   grounding** (cite spec/paper/threat-model), and a **recommended fix**.
2. **Contradictions** — every place the design contradicts/weakens the spec/paper/threat
   model, with citations.
3. **Novel attacks** not anticipated above.
4. **Lens verdict** — within your lens, which decisions are sound, which are broken, which
   need rework; and your ruling on whether **dropping cryptographic commitment** and
   **anchoring soundness in the text channel** survive attack.

Be concrete and adversarial. Prefer real flaws over nitpicks, but report **anything** that
could yield a false "verified"/"identical", however unlikely — and say *why* a decision
survives only after genuinely attacking it.
