# Independent adjudication: panel synthesis vs. orchestrator rebuttal

## Your role

You are an **independent security adjudicator** — an applied cryptographer who also knows the
human-factors / verification-ceremony literature (SAS protocols, commitment, safety-number
checking, near-collision economics). You are **not affiliated with either prior analysis and
owe neither any deference.** Two analyses of the same design reached **opposite headline
conclusions**, and you have been brought in to determine, on the merits, **who is right
where** — and to catch errors in *both*.

The worst outcome being defended against is a **false "verified" / "identical"** (a user
concluding two values match when they don't). Keep that as your north star.

## Rigor and terminology requirements (MANDATORY — your report is judged on these first)

Your value here is **transparent, checkable reasoning**, not a new verdict to be taken on
faith. A reader must be able to verify every step. These are hard requirements:

1. **Assumptions ledger.** Maintain an explicit, numbered list (A1, A2, …) of every assumption
   you rely on: the attacker's capabilities and knowledge, the channel model (authenticated or
   not; observed by the attacker or not), the value/alphabet type, the cost model for key
   generation and hashing, what "the tool" is and is not trusted to do, etc. **Every
   conclusion must cite the assumptions (by number) it depends on.** If a conclusion's truth
   changes under a different assumption, give both branches explicitly.

2. **Chain of logic, never bare assertion.** Present each non-trivial conclusion as
   **premises → inference → conclusion**, where each premise is either a cited document fact, a
   numbered assumption, or a previously derived step. No conclusion may appear that is not
   connected to its premises by visible steps. Show all arithmetic (per-cell cost,
   `C(J,L)/C(K,L)`, bit counts) explicitly, with the assumption behind each number named.

3. **Define terms before using them.** Give an operational definition for every load-bearing
   term, at minimum: *match/forge* (a cell), *steer* (the order), *verified*, *soundness*,
   *unmatchable*, *authenticated channel*, and the distinct notions *substitution* vs. *relay*
   vs. *endpoint compromise*. **If the two analyses use one word for different things, name the
   ambiguity and split it into separate defined terms.**

4. **Banned vague verbs.** Do **not** write that something "collapses", "falls apart",
   "breaks", "doesn't survive", "is voided", or "is shattered" — these conflate distinct
   failure modes and are exactly the imprecision under dispute. Replace every such instinct
   with a precise statement: *which specific property fails, under which numbered assumption,
   with what attacker cost (operations / bits) or success probability.* "Holds / does not hold"
   is acceptable only when bound to a named property and a stated assumption set.

5. **Four-way verdict, never blurred.** Classify every disputed claim as exactly one of:
   **(i) false** — the stated claim is incorrect; **(ii) true only under unstated conditions**
   — name them; **(iii) true but its significance/severity is overstated** — say by how much;
   **(iv) true and correctly weighted.** Much of the dispute between the two analyses is
   precisely the confusion of (i)/(ii)/(iii); do not reproduce it.

6. **Quantify wherever possible.** Prefer "≈ 2⁷² keygens" or "success probability
   `C(3,5)/C(20,5)`" to adjectives. Where you cannot quantify, state what measurement or
   assumption would make it quantifiable.

## Method — independence first, then adjudicate (do this in order)

To avoid anchoring on either side, **derive your own answers before you read either
analysis:**

1. **Read the source material carefully and fully** (these are normative; cite them):
   - `/home/daniel/code/entviz/docs/spec.md`
   - `/home/daniel/code/entviz/docs/entviz-paper.md` (esp. §5.1–5.4, §4.3.9, §2.3)
   - `/home/daniel/code/entviz/docs/threat-model.md` (attacker tiers, trust boundaries)
   - `/home/daniel/code/entviz-js/reviews/comparison-redteam/00-common-brief.md` (the design
     decisions A–G under review)

2. **Before reading the analyses, independently answer the contested questions below** —
   show your own derivation and numbers. Write these down first.

3. **Then read both analyses:**
   - The **panel** (a 3-lens adversarial red-team + synthesis):
     `findings-01-cryptography.md`, `findings-02-usable-security.md`,
     `findings-03-rendering-forensics.md`, `findings-04-synthesis.md` (the synthesis is the
     consolidated verdict; its findings are labelled **S1–S22** and **SEAM-1..6**).
   - The **rebuttal** (a first-principles counter-analysis by the orchestrator who ran the
     panel and then doubted its headline): `rebuttal-01-orchestrator.md`.

4. **Adjudicate.** Compare your independent conclusions to both. If either analysis changes
   your mind, say so and say exactly what changed it. Then rule.

## The contested questions you must rule on

**Q1 — Text-channel security (the crux).** For the canonical two-party comparison of
*high-entropy* values (e.g. public keys) where the attacker substituted one side and is *not*
a participant in the live comparison: derive the attacker's actual cost to pass a seeded walk
by forging the **text** channel. Is the rebuttal's ≈2²⁴-keygens-per-cell (×`C(J,L)/C(K,L)`)
estimate right, too high, or too low? Does it hold across the value/alphabet types the spec
covers (hex, UUID with its version/variant bits, base64url, base58 with leading-zero
handling, CESR derivation codes, Ethereum, the bit-extended short final token, the >512-bit
head/tail/middle split)? **Is the text channel a sound soundness anchor for high-entropy
inputs, or is the panel's S1 ("matched for 0 bits") correct?**

**Q2 — Threat decomposition.** The rebuttal splits the threat into (A) upstream MITM not in
the call, (B) compromised endpoint software, (C) unauthenticated relay. Is this decomposition
**correct and complete**? Does the panel's "substitution/relay" + "hostile counterparty
software" framing **conflate** these (as the rebuttal claims), or does the panel correctly
identify a case the rebuttal waves away? In particular, the panel's **SEAM-3** argues that
the *live-mode UX* (click-harvest entropy + on-screen code over a **screen-share**) pushes the
common case from (A) toward (C) — does that defeat the rebuttal's "authenticated channel"
assumption? This may be the rebuttal's weakest point; test it hard.

**Q3 — Commitment.** Must cryptographic commit-and-reveal be the **live-mode default** (panel
Ruling 1), or is it **optional** for honest authenticated endpoints facing an upstream
substitution (rebuttal §3)? What threat does paper §5.2's commitment actually defend, and
does that threat arise in the design's standard case? Adjudicate whether the design's
decision-E "drop commitment, keep it as a high-assurance option" is sound, unsound, or
sound-only-under-stated-conditions.

**Q4 — Finding-by-finding.** For each of **S1, S2, S3, S6, S9, S10, S12, S16**, rule:
**sound / overstated / wrong**, with a one-paragraph reason grounded in the documents. Is the
rebuttal right that **S3, S6, S9, S10, S12** are the genuine, philosophy-independent fixes and
that **S1 (and the commitment reversal)** is overstated and **S2** is a bounded hardening
rather than a break?

**Q5 — Grade the rebuttal itself.** Where is the rebuttal **wrong, too dismissive, or
blind**? It concedes three uncertainties (per-cell cost for structured encodings; homoglyph
erosion for case-sensitive alphabets; whether "authenticated channel" survives the live UX).
Are those the right concessions, and are any of them actually fatal to its position?
Symmetrically: where is the **panel** right and the rebuttal wrong?

## What to return

A self-contained adjudication report:

1. **Your independent derivations** (Q1 grind math, Q2 threat cases, Q3 commitment) — written
   *before* you let either analysis move you, so the reader can see your priors.
2. **Verdict per contested question (Q1–Q5)** — decisive, with citations. Do **not** split the
   difference to seem balanced; if one side is substantially right, say so; if **both** are
   wrong on a point, say that.
3. **A corrected, prioritized fix-list** — what actually must change in the design, what is
   hardening, what is a non-issue.
4. **The bottom line in one paragraph**: is the panel's headline ("text-anchoring doesn't
   survive; reinstate commitment") correct, is the rebuttal's ("overstated; text holds for
   high-entropy inputs; commitment optional for honest endpoints") correct, or is the truth
   elsewhere?
5. **Your confidence** on the crux (Q1/Q3) and **what evidence would change your mind.**

Ground everything in the spec/paper/threat-model with section citations. Be decisive and
adversarial toward *both* analyses.
