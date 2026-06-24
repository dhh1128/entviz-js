# Rebuttal / counter-analysis of the panel synthesis (orchestrator)

> Provenance: written by the orchestrator who *ran* the panel (findings-01..04) and then
> became skeptical of its headline. It is a first-principles counter-analysis, not an
> authority. It may itself be wrong; it is offered to be adjudicated, not deferred to.

## Claim under dispute

The synthesis (findings-04) headline: **"text-anchoring lets us drop commitment" does not
survive; reinstate cryptographic commitment as the live-mode default; the text channel is
not a sound soundness anchor (S1, S2, Ruling 1).**

This rebuttal argues that **headline is overstated**, that it rests on a threat-model
conflation, and that the *concrete* findings (S3, S6, S9, S10, S12) are the real, valuable
output while S1 / the commitment-reversal are not.

## 1. The grind cost of forging the text channel (canonical case)

Job: Alice holds A, Bob holds B; decide A = B. Attack succeeds if the walk says "same"
while A ≠ B. For ≤512-bit inputs a cell's *text* is the value's own tokens (the spec's
lossless text channel) — for a public key, the actual key bytes.

- **Cost to forge one text cell.** A 6-hex-char cell = 24 bits = 3 key bytes. To make
  `entviz(A)` cell *i* read the same as `entviz(B)` cell *i*, the attacker needs a key A
  (private key known) whose public-key bytes at position *i* equal B's. Public-key bytes are
  ~uniform, so this is a **partial preimage on key generation: ≈ 2²⁴ keygens per cell**, and
  **≈ 2²⁴ᵐ to match *m* specific cells at once**.
- **Add the seeded walk.** It checks *L* random cells of *K*; the upstream attacker committed
  A *before* the call and cannot predict the order (the seed is from live nonces they are not
  party to). So they must pre-match *J* cells such that every random check lands on a matched
  one — the paper's `C(J,L)/C(K,L)`. Matching *J* = 3 cells ≈ 2⁷² keygens; *J* = 6 ≈ 2¹⁴⁴.

So for **high-entropy values an attacker cannot freely choose**, text forgery is **not
"free / 0-bit"** — it is the paper's own §5.1/§5.3 argument, and it holds. The synthesis's
S1 ("every text cell matched for 0 bits") is false for this case.

## 2. Where the "free match" actually comes from — a threat decomposition

The "0-bit" claim only becomes true if the attacker can **author both sides** (A and B):

| | Attacker | Authors both? | Text holds? | Commitment helps? |
|---|---|---|---|---|
| **(A) Upstream MITM** | substituted Alice's copy; *not in the call*; Alice & Bob recognize each other | **No** (B is Bob's real key) | **Yes** (grind cost §1) | No — neither honest party steers; the seed is already unpredictable to the absent attacker |
| **(B) Compromised endpoint** | the counterparty's tool is hostile | It just *lies* (shows its user a fake entviz) | N/A — it fabricates, doesn't forge | **No** — a lying tool ignores commitment too |
| **(C) Unauthenticated relay** | attacker *is* the channel | **Yes** | No SAS scheme survives | No — universal limit |

The synthesis's words **"substitution/relay"** fuse (A) with (C); **"hostile counterparty
software"** is (B). The headline takes the "free match" that lives in (B)/(C) and applies it
to a claim about (A). In (A) — the threat the design is *for* — text holds and commitment
adds nothing, because the seed is unpredictable to an attacker who is not in the call.
(B) is the **endpoint-trust limit the design already concedes**; (C) is the **universal SAS
limitation**, defended by channel authentication (voice/face recognition), which the
canonical setup assumes.

## 3. What §5.2's commitment actually defends

Paper §5.2's commit-and-reveal defends against a **participant steering the shared seed** —
i.e. cases (B)/(C). For two honest endpoints on an authenticated channel facing an upstream
substitution (A), **no participant steers**, and the upstream attacker can't predict the
live nonces, so dropping commitment is fine. The synthesis over-applies a §5.2 mechanism
built for a different threat as if it were universally required.

A red flag the orchestrator should have caught earlier: the headline claims the design's
text-anchoring "doesn't survive," but text-anchoring **is the paper's own thesis** (§5.1,
§5.3). A red-team "refuting" the paper's sound core should have prompted a grind-cost check
before the verdict was relayed.

## 4. Wheat vs. chaff

**Overstated (the dramatic headline):**
- **S1 / Ruling 1** (text-anchoring broken → reinstate commitment as default): rests on the
  (A)/(B)/(C) conflation. The honest, narrower version is **S16** (low-entropy or
  attacker-*influenceable* values cost less to match) — already rated MEDIUM, and largely
  addressed by the tool's "high-entropy values" scope.
- **S2** (homoglyph/case "voids the anchor"): real but **bounded**, not a break.
  Confusability lowers the per-cell grind by an alphabet-dependent factor — small for hex
  (few confusables), larger for case-sensitive base64url with case-dropping (perhaps
  2²⁴ → ~2¹⁸–2²⁰/cell) — still multiplied across the cells the walk forces. A genuine
  **hardening** item (disambiguating font + explicit case/NATO readout), not a collapse.

**Solid, worth acting on (independent of the disputed philosophy):**
- **S3** — the SVG engine trusting `<text>`/`data-*` over rendered ink. A real, concrete,
  no-preimage bug in the machine path that holds even in case (A): an SVG whose `<text>` says
  X but renders Y beats a value-engine reading characters, because Tier-B excludes glyph
  pixels. Fix: re-render the reconstructed core and pixel-check, or refuse IDENTICAL. **Keep.**
- **S6** — don't sum correlated gestalt "bits"; the additive "1-in-2^N" meter overcounts past
  the §4.3.9 joint ceiling. **Keep.**
- **S9** (habituation/rubber-stamping), **S10** (raster probe = fidelity not authenticity →
  UNKNOWN must carry zero forward trust), **S12** (polyglot/auto-detect routing). Real
  engineering/UX hardening. **Keep.**

## 5. Self-calibration (where this rebuttal could be wrong)

1. The exact per-cell grind cost for the specific key/value types and alphabets we target —
   is it really ~2²⁴/cell, or do structured encodings (base58 leading-zero handling, CESR
   derivation codes, UUID version/variant bits, snowflake structure) leak cheaper matches?
2. How much homoglyph + case-drop really erodes the cost for base64url/base58 in practice.
3. Whether "authenticated channel" is a safe assumption for the live-mode UX as designed
   (the panel's screen-share observations, SEAM-3, may push case (A) toward (C) in the most
   common setting — a point this rebuttal does not fully rebut and may be conceding too
   little).
