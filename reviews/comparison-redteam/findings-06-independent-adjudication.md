# Independent adjudication: panel synthesis vs. orchestrator rebuttal

The rebuttal is substantially right on the crux, but its conclusion is too broad. Text is a
strong soundness anchor only for fixed, constrained high-entropy values—such as an
attacker-generated public key whose private key must remain usable. Commitment is optional
only when both ceremony participants and endpoints are honest, the comparison channel is
authenticated, and both values are locked before seed generation. Those conditions conflict
with the design's stated assumption that counterparty software is always hostile.

The React package currently documents only the rendering wrapper; it contains no comparison
implementation or `pill-design.md`. This therefore adjudicates the proposed design in
`00-common-brief.md`, not shipped code.

## Definitions

- **Exact cell match:** Candidate and target have identical canonical token text in a specified
  cell.
- **Perceptual cell pass:** The human reports “Matches,” whether or not the characters are
  identical.
- **Forge a cell:** Produce a usable candidate value whose cell exactly matches a fixed target
  cell.
- **Steer the order:** Choose a nonce after learning the other contribution so the resulting
  checks are biased toward attacker-matched features.
- **Verified:** The human path reaches the positive `NO DIFFERENCE` threshold. It does not mean
  machine `IDENTICAL`.
- **Soundness:** Under stated assumptions, the probability of `verified` when the values differ
  is bounded by the advertised probability.
- **Unmatchable:** Computationally expensive to forge under a stated cost threshold—not
  mathematically impossible.
- **Authenticated channel:** Ceremony messages have integrity and are bound to the intended
  peer. Confidentiality is unnecessary; observation alone is permitted.
- **Substitution:** The attacker fixes one different candidate before the ceremony.
- **Relay:** An active intermediary observes or modifies ceremony messages in real time.
- **Endpoint compromise:** The attacker controls what a participant's local device renders or
  reports.
- **Reference authenticity:** Whether the reference belongs to the intended person or object.
  This is distinct from equality.

## Assumptions ledger

- **A1:** This is a design review; comparison code is not present in `packages/react`.
- **A2:** SHA-512 and its domain-separated use behave as pseudorandom functions.
- **A3:** In the canonical Q1 case, the substituted candidate is fixed before the live seed is
  generated.
- **A4:** Both local tools honestly render their actual local values.
- **A5:** The live comparison channel provides integrity and peer authentication.
- **A6:** The attacker knows the target and can perform arbitrary offline key generation or
  hashing.
- **A7:** A “usable public key” candidate must retain a corresponding private key.
- **A8:** Candidate output bits are pseudorandom except for known encoding and format
  constraints.
- **A9:** Freely programmable identifiers and arbitrary strings are analyzed separately from
  constrained key generation.
- **A10:** Seed selection is effectively uniform over the relevant check sets unless a
  participant can steer it.
- **A11:** Cryptographic grind calculations initially assume exact human reading; human error is
  treated separately.
- **A12:** A commitment is binding and hiding, using a high-entropy opening as required by paper
  §5.2.
- **A13:** Compared values are irrevocably locked before nonce generation.
- **A14:** The design does not specify concrete `K`, `L`, preset thresholds, or a joint
  bit-accounting model; numerical examples are illustrative.
- **A15:** A fully compromised endpoint can lie about its state; neither commitment nor a seeded
  walk proves that state.

## Independent derivation: Q1

The spec's text channel is lossless at or below 512 bits, while other channels provide
avalanche behavior (`spec.md`, Guarantees). The paper correctly distinguishes exact symbol
reading from approximate recognition (`entviz-paper.md`, §2.3).

Let cell *i* have attack cost `r_i` bits. For a fixed set `S` of checked cells:

```text
W(S) ≈ 2^(Σ i∈S r_i)
```

under A2–A8 and A11.

For uniform `r`, if an attacker grinds until a candidate matches any `J` of `K` cells:

```text
W_candidate ≈ 2^(rJ) / C(K,J)
```

and a uniform `L`-cell walk passes with:

```text
P_walk = C(J,L) / C(K,L)
```

Therefore expected work per successful false verification is:

```text
W_success ≈ 2^(rJ) C(K,L) / (C(K,J) C(J,L))
          = 2^(rJ) / C(K-L,J-L)
```

For `J=L`, this is `2^(rL)`. Thus unpredictable selection removes the “choose whichever cells
happened to match” combinatorial advantage (A2–A10).

The rebuttal's “2^24 per cell” is correct only for full, unconstrained 24-bit cells produced by
a constrained pseudorandom generator. Its statement that matching any `J` cells costs exactly
`2^(24J)` omits the `C(K,J)` advantage; its later walk probability then mixes “specific cells”
and “any cells.”

Without commitment, a steering last mover can select any reachable matched `L`-subset. The work
becomes approximately:

```text
W_steered ≈ 2^(rL) / C(K,L)
```

For `K=20`, `L=5`, `r=24`:

```text
C(20,5) = 15504 ≈ 2^13.920
W_uniform ≈ 2^120
W_steered ≈ 2^106.080
```

Commitment therefore contributes about 13.9 bits in this example. It is material, although both
costs remain infeasible (A2–A14).

### Per-format costs

| Format or position | Effective exact-match cost under constrained generation |
|---|---:|
| Full hex token | 24 bits |
| UUIDv4 cells | approximately 24, 24, 18, 24, 24, 8 bits; all six fixed version/variant bits fall in one token |
| Full canonical base64/base64url token | 24 bits |
| CESR first token with fixed derivation code | about 18 variable bits |
| CESR final token | about 22 variable bits from canonical padding constraints |
| Four base58 characters | at most `4 log2(58) = 23.432` bits; leading/version constraints may reduce it |
| Four base36 characters | at most 20.680 bits |
| Four 5-bit-alphabet characters | 20 bits; bit extension adds no text entropy |
| Six decimal characters | at most 19.932 bits |
| Ethereum address | six 24-bit cells plus one 16-bit final cell; EIP-55 case supplies no additional normalized identity bits |
| Large-input fingerprint-middle | exactly 24 bits per cell, 96 bits for all four, under A2 |

For UUIDs, arbitrary strings, and other directly programmable identifiers, a valid attacker can
set chosen text cells and retain entropy elsewhere. Their cost is effectively zero, not
`2^(r_i)`, unless an external protocol forces uniform sampling or binds the value to a preimage
or private key (A9). “High entropy” alone is therefore insufficient; the required property is
constrained generation.

For >512-bit inputs, freely choosing matching head and tail text may be cheap, but matching each
domain-separated middle cell remains a 24-bit partial preimage when an honest renderer computes
it. The panel's “middle is zero bits under substitution” is true only when the artifact or
endpoint can lie, which is endpoint/artifact control rather than ordinary substitution
(A2–A4, A9, A15).

### Q1 verdict

Premises: constrained public-key generation requires a partial preimage; the candidate is fixed
before an unpredictable seed; exact text cells carry position-specific entropy (A2–A11).

Inference: a checked full hex/base64 cell costs about `2^24`, and `L` unpredictable full cells
cost about `2^(24L)`.

Conclusion: **S1 is false for the canonical fixed-public-key case. The rebuttal is substantially
right, but its blanket per-cell figure is too high for structured or partial cells and wholly
inapplicable to freely programmable values.** Text is a sound anchor only under A2–A11 and A13.

## Independent derivation: Q2

The rebuttal's three categories identify important cases but are neither complete nor mutually
precise.

1. **Fixed upstream substitution, absent attacker.** Candidate fixed; honest endpoints;
   authenticated ceremony. Text grind applies and commitment adds no soundness because nobody
   can steer (A2–A8, A13).
2. **Observed but integrity-protected ceremony.** The attacker sees clicks, codes, and the seed
   but cannot modify them. Observation after value lock does not reduce security; the seed need
   not remain secret (A3–A6, A13).
3. **Malicious last-moving peer or peer software.** The peer sees the first nonce and chooses its
   contribution adaptively. This is not necessarily full endpoint compromise. Commitment
   prevents this specific steering advantage (A12–A13).
4. **Active relay of an unauthenticated data channel, with an authenticated human/OOB comparison
   channel.** This is the setting SAS protocols are designed to detect. The rebuttal's statement
   that “no SAS scheme survives” is false here (A5, A12).
5. **Relay of every available channel with no peer authentication.** The protocol cannot
   establish identity; commitment alone is insufficient.
6. **Endpoint compromise.** The device can fabricate its local value or answers. Commitment does
   not prove the device's actual state (A15).
7. **Attacker-chosen reference provenance.** Equality may be established correctly against the
   wrong reference. This is not a soundness failure for equality; it is an authenticity failure.

An authenticated screen share remains authenticated if its participant identity and content
integrity are protected. Screen sharing does not inherently turn case 1 into case 5. It does
expose the first nonce to a malicious last mover, so the proposed UX requires commitment whenever
hostile counterparty software remains in scope (A3–A6, A12–A13).

### Q2 verdict

Premises: observation, modification, peer malice, and endpoint compromise confer different
capabilities; SAS relies on an authenticated comparison channel, not necessarily an authenticated
primary data channel (A3–A6, A12–A15).

Inference: the rebuttal correctly isolates fixed substitution but incorrectly groups all live
relays into an impossible case.

Conclusion: **The rebuttal's decomposition is directionally useful but incomplete. SEAM-3
identifies a real last-mover problem, while overstating screen-share observation as entropy
loss.** The design must define what authenticates the live channel.

## Independent derivation: Q3

Paper §5.2 explicitly uses commitment to remove a last mover's ability to choose the check order.
Paper §5.3 separately observes that a full text read is stronger than a partial walk.

Premises:

1. If both participants are honest, values are locked, and the attacker is absent from an
   authenticated ceremony, no party steers (A3–A6, A13).
2. If a peer or its software is hostile, revealing one nonce before receiving the other permits
   steering (A10, A13).
3. Commitment removes that steering advantage but cannot prevent a compromised endpoint from
   lying about its value (A12, A15).
4. The design explicitly assumes hostile counterparty software (decision F).

Inference: commitment is unnecessary in the narrow honest-endpoint branch but required to
preserve the paper's uniform-coverage argument in the design's stated hostile-peer branch.

Conclusion: **Decision E is sound only under explicitly stated honest-endpoint,
authenticated-channel, value-lock conditions. Under the design's current F assumption,
commitment must be the default.** This is not because text has zero value; commitment prevents
the `log2 C(K,L)`-bit steering discount.

Human-sourced click entropy does not protect against a malicious local tool: such a tool can
ignore or falsify the gesture. If the local tool is trusted, a platform CSPRNG is preferable.
Thus the click-harvest justification needs revision independently of commitment (A4, A15).

## Verdicts Q1–Q5

### Q1 — Text security

**Four-way classification: (ii) true only under unstated conditions.**

The rebuttal's estimate holds for full 24-bit cells of constrained, pseudorandom candidate
generation. It does not hold uniformly across the spec's alphabets, structured formats, partial
tokens, or directly editable values (A2–A11).

The panel's S1 is **false** in the canonical fixed-public-key case and **true only** for freely
programmable values, attacker-authored artifacts, or lying endpoints. Those cases must not be
projected onto ordinary substitution (A3–A9, A15).

### Q2 — Threat decomposition

**Four-way classification: (iii) true but incomplete and overstated.**

The rebuttal correctly separates absent substitution from endpoint compromise. It incorrectly
says all unauthenticated relays defeat SAS and omits the malicious-last-mover case between honest
substitution and full endpoint compromise (A3–A6, A12–A15).

SEAM-3 is correctly weighted as a requirement to authenticate the ceremony and prevent last-mover
steering. Its claim that observing a screen-shared click reduces security to zero is false once
values are locked and no observer can modify the ceremony (A3–A6, A13).

### Q3 — Commitment

**Four-way classification: (ii) optional only under stated conditions.**

Commitment is optional under A3–A6 and A13. It is required under the design's
hostile-counterparty assumption to preserve uniform coverage (A10, A12–A13). It does not address
endpoint compromise (A15).

Thus neither headline is fully correct:

- “Commitment is always mandatory” is too broad.
- “Commitment is merely a high-assurance option” is incompatible with decision F.

### Q4 — Finding-by-finding

| Finding | Classification | Ruling |
|---|---|---|
| **S1** | **(i) false** for the canonical case; **(ii)** for programmable/lying cases | It conflates choosing one candidate with controlling both exact text streams. |
| **S2** | **(iii) true, significance overstated** | Homoglyph and case errors reduce effective entropy; they do not automatically make every cell cost zero. Measurement is needed before assigning bits. |
| **S3** | **(ii) true under a permissive SVG implementation** | Strict closed-profile validation already forbids extra instances and out-of-channel rendering. Nevertheless, untrusted SVG must be validated, recomputed, and re-rendered before `IDENTICAL`. The panel overstates this as an established code bug because no comparison implementation exists. |
| **S6** | **(iii) true, rationale overstated** | Joint grind cost must be used. Sharing one SHA-512 digest does not itself imply dependence—disjoint pseudorandom bits can be independent—but overlapping derived features cannot be blindly added. |
| **S9** | **(iv) true and correctly weighted** | Rubber-stamping makes the human report unreliable regardless of cryptographic order. The paper explicitly calls this ergonomics unmeasured. |
| **S10** | **(ii) true only if probe success forwards positive credit** | The proposed probe licenses disproof, not authentication. `UNKNOWN` must carry zero credited comparison evidence. |
| **S12** | **(ii) true under ambiguous or permissive detection** | Strict parsing and fail-closed routing prevent the upgrade. This is a required parser boundary, not a demonstrated exploit. |
| **S16** | **(iv) true and correctly weighted** | Actual cell cost is type- and position-specific; programmable values may cost zero. The large-input middle remains 24 bits per cell under an honest renderer. |

The rebuttal is right that S3, S6, S9, S10, and S12 motivate concrete engineering requirements
independent of the commitment dispute. It is wrong to treat all five as already-demonstrated
defects; S3, S10, and S12 depend on implementation choices not yet made (A1).

### Q5 — Grade of the rebuttal

The rebuttal's main correction is valid: the panel did not perform the necessary partial-preimage
calculation before declaring text free in the canonical case (A2–A8).

Its remaining errors are:

- It treats 24 bits as universal instead of position- and format-specific.
- It says matching any `J` cells costs `2^(24J)`, omitting `C(K,J)`.
- It does not quantify the no-commitment steering discount.
- It treats a malicious last mover as either endpoint compromise or an impossible relay, omitting
  a meaningful intermediate threat.
- It says no SAS survives an unauthenticated relay, although SAS specifically addresses
  unauthenticated primary channels when the short comparison uses an authenticated OOB channel.
- It invokes paper §5.1/§5.3 for text anchoring while underweighting paper §5.2 and Principle 6,
  which make unsteerable selection part of the proposed partial-comparison protocol.
- It accepts S3 too readily despite the spec's strict closed-profile rules.
- It does not confront the contradiction between “honest authenticated endpoints” and decision
  F's “counterparty software is hostile, always.”
- It does not distinguish equality soundness from reference authenticity.

The rebuttal's three concessions are appropriate but incomplete. Structured encoding costs are
fatal to a universal “24 bits per cell” meter; they are not fatal to a properly scoped public-key
text anchor. Homoglyph erosion is hardening unless human studies show much larger error rates. The
authenticated-channel uncertainty is decisive for whether commitment can remain optional
(A1–A15).

## Corrected prioritized fix list

### Must change before positive live verdicts

1. **Define two explicit live threat profiles.**
   - Honest authenticated endpoints, fixed values: no commitment required.
   - Hostile peer/software: commitment required.
   Do not claim one protocol covers both without qualification.
2. **Lock both compared values before seed generation.** Seed observation after lock is harmless
   to an absent attacker; adaptive value selection is not.
3. **Make commitment the default while decision F remains.** Use a randomized hiding commitment,
   not a hash of a short nonce.
4. **Define real `K`, `L`, preset thresholds, and seed support.** Enforce
   `H_min(seed) ≥ log2 C(K,L)` for the actual preset. The panel's 14/17/21-bit claims are
   illustrative because the design provides no actual mappings (A14).
5. **Use a hard exact-text floor for affirmative human results.** Gestalt channels should reject
   quickly; they should not independently fill a positive probability meter.
6. **Use type- and position-specific text costs.** Do not credit a full 24 bits to 5-bit
   alphabets, short final cells, fixed prefixes, UUID structure, checksums, or programmable
   identifiers.

### Machine-reference boundaries

7. **For SVG:** strict closed-profile validation first; recover a complete core only at ≤512
   bits; recompute all derived fields; re-render locally; reject any inconsistency. Never produce
   `IDENTICAL` for a >512-bit SVG without the original full value.
8. **For raster:** probe success licenses disproof only. `UNKNOWN` contributes zero evidence to a
   later human walk.
9. **For auto-detection:** reject ambiguity or select the least-authoritative engine. Never let
   sniffing upgrade an artifact into an `IDENTICAL` path.

### Human process

10. **Replace `N bits` with checked coverage unless the probability model is formally
    specified.** Use “No difference found in L checks,” not a nominal `2^-N` assurance.
11. **Harden exact reads:** case-explicit read-back, a controlled disambiguating font in
    comparison chrome, and conservative treatment of confusable cells.
12. **Keep the meter and guidance local.** A counterparty's shared meter or highlights are not
    evidence.
13. **Surface reference provenance.** “These values match” must not be presented as “this
    reference is authentic.”
14. **Test habituation empirically.** The paper identifies this as the central unmeasured human
    claim (§6.3).

### Documentation corrections

The threat model still describes the large-input middle as hexadecimal, while spec v11 uses
Crockford base32; both carry 96 bits. Its user-note constraints also disagree with the current
spec. These should be synchronized.

## Bottom line

The panel's headline is wrong for the canonical fixed, usable-public-key substitution: exact text
cells are not free, and the rebuttal correctly restores their partial-preimage cost. The rebuttal
is wrong to generalize from that narrow model to the proposed live UX. Commitment is optional
only for honest, authenticated endpoints with values locked before seed generation; the design
explicitly assumes hostile counterparty software, so under its own standard threat model
commitment belongs in the default protocol. The correct position is therefore: **text remains the
primary soundness anchor for constrained high-entropy values, but it does not replace commitment
when a live participant may steer the check order.**

Confidence on Q1 is high (~0.9) for the conditional derivation and medium for exact
format-specific costs. Confidence on Q3 is high (~0.9) at the protocol level and medium on
product severity because `K`, `L`, presets, channel authentication, and the state machine are
unspecified.

Evidence that would change the ruling: measured output distributions and key-generation costs
for every supported typed format; a concrete protocol specifying value lock, authenticated
channel, seed mapping, and preset thresholds; implementation evidence that SVG validation and
raster fallback already enforce the stated boundaries; and controlled human studies measuring
case/homoglyph errors and habituated walk completion.
