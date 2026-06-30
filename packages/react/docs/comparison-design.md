# `<EntvizCompare>` — comparison feature (design)

**Status:** design, pre-implementation. **Audience:** implementers of `@entviz/react`.
**Depends on:** the entviz spec (`../entviz/docs/spec.md`), paper (`entviz-paper.md`), and
threat model (`threat-model.md`) in the sister repo; and the sibling
[`<EntvizPill>` design](./pill-design.md) (recognition ≠ verification; closed profile;
comparison-text definition; terminology — an entviz is a *visualization*, not a
"fingerprint").

This doc designs the feature that helps a human decide whether *their* entviz matches a
*reference*. Its security-bearing decisions were **stress-tested adversarially** before being
written down; every load-bearing claim links to the supporting review below
([§13 Provenance](#13-provenance--how-this-design-was-validated)). Where this doc states a
security property, it states it **conditionally** — naming the assumptions — because the
review process showed that unconditional phrasing was the main source of error.

---

## 1. Terminology (precise; used consistently)

Operational definitions, adopted from the adjudications because the analyses repeatedly
conflated distinct notions:

- **exact cell match** — two entvizes' cell *i* have identical canonical token text.
- **forge a cell** — produce a *distinct, usable* candidate value whose cell exactly matches a
  cell of a target the attacker **does not control** (for a public key, the attacker must
  retain a usable private key — A "witness").
- **steer the order** — a live participant chooses their seed contribution *after* learning the
  other's, biasing which checks come up early.
- **verified** — the workflow reaches an affirmative verdict. This is split into two:
  **IDENTICAL** (the machine compared both sides in full) and **NO DIFFERENCE** (a human walk
  found no difference across the checks performed — probabilistic, never the machine's `=`).
- **soundness** — P(affirmative verdict │ the values differ) ≤ the advertised bound, under
  stated assumptions.
- **unmatchable** — computationally expensive to forge under a stated work factor; never
  literally impossible.
- **authenticated channel** — the comparison/out-of-band channel (voice/video) has integrity
  and is bound to the intended peer (you recognize them). *Confidentiality is not required.*
- **substitution** — the attacker fixed a different candidate value **before** the ceremony and
  is **not** a live participant. **relay** — an active intermediary observes/modifies ceremony
  messages in real time. **endpoint compromise** — the attacker controls a party's own
  rendering/comparison tool.
- **equality-soundness** vs **reference-authenticity** — proving `A = B` is distinct from
  proving the reference is the value you *should* trust. This feature does the former, never
  the latter.

---

## 2. First principles

1. **Recognition ≠ verification** (paper §2.3, §5.1; [pill design](./pill-design.md) §2). A
   glance recognizes; only a deliberate check verifies. The walk forces deliberate checks.

2. **Proof is asymmetric.** A single mismatch proves inequality with certainty. "Identical" is
   machine-provable only when the machine sees **both** sides in full (text/SVG engines), or a
   tool-driven **complete** read; a raster or a partial human walk yields only *"no difference
   found across what was checked."* (Adjudicated; see
   [synthesis](../../../reviews/comparison-redteam/findings-04-synthesis.md) Ruling 3.)

3. **The text channel is the primary soundness anchor — for *constrained* high-entropy values.**
   For a value whose token bytes the attacker cannot freely choose (a key whose private key
   must remain usable), forging a checked cell is a **partial preimage** costing ≈2^(bits in
   that cell) — see the per-format table in [§7.3](#73-the-confidence-meter). Across the
   spec's alphabets this is **2²⁰–2²⁴ per cell**, never zero. Both independent adjudications
   confirmed this and refuted the panel's "matched for 0 bits" headline for the canonical case
   ([local](../../../reviews/comparison-redteam/findings-05-adjudication.md) Q1;
   [foreign](../../../reviews/comparison-redteam/findings-06-independent-adjudication.md) Q1).
   **Crucial caveat:** for **programmable / attacker-authored** values (arbitrary-text
   fallback, vanity values, a UUID whose bits the attacker fills) the per-cell cost is ~0. So
   *"high entropy"* is **not** the qualifying property; **constrained generation** is. The
   meter credits a cell its real min-entropy, and **0 for any value not locally generated** in
   adversarial mode.

4. **Equality-soundness ≠ reference-authenticity.** A green verdict means "your value equals
   *this reference*," never "this reference is trustworthy." An attacker-supplied reference
   (pasted, dropped, or URL-fetched) makes a correct equality verdict meaningless. Surface
   provenance as first-class, not a footnote.

5. **Endpoint trust is irreducible** (decision-F limit; Signal-safety-number parity). A
   compromised counterparty tool can show *its own user* a fabricated entviz; no comparison
   protocol proves a remote device's state. We state this limit; we do not pretend to solve it.

---

## 3. Verdict state machine (four states)

| state | look | meaning | reachable by |
|---|---|---|---|
| **DIFFERENT** | red `≠` | a mismatch was found — **certain** | every engine; one mismatch |
| **PENDING** | gray `?` | not enough checked | initial / mid-walk |
| **NO DIFFERENCE · coverage** | a **coverage** meter (checks completed of the target), **not** a `1-in-2^N` thermometer | probabilistic; "no difference found in the checks performed" | the human walk, raster fallback |
| **IDENTICAL** | solid green `=` | machine compared both sides in full | text engine; SVG engine (≤512-bit, self-consistent) |

Rules: **a human-driven comparison never reaches IDENTICAL** (the machine cannot certify the
human's eyes). The affirmative human state shows **coverage**, not a nominal `2^-N` (the bits
are correlated and human-eroded; a probability would mis-state them — paper §4.3.9, adjudicated
[synthesis](../../../reviews/comparison-redteam/findings-04-synthesis.md) S6/S13). Reserve any
green/`=` treatment for machine-IDENTICAL.

---

## 4. User surface — two situational choices + one knob

The naive user picks based on situation, never on a security mode:

1. **"I have something to check it against"** — paste a value, or drop/link an entviz (file,
   image, URL). The engine **auto-detects** the medium (§5–6) and does as much by machine as it
   can.
2. **"I'm comparing live with another person"** — the guided two-party ceremony (§8).

The only exposed security knob is a confidence target the user **declares** (there is no
default): **Quick / Good / Complete**, mapping to concrete check plans — pinned in
[§14](#14-m2--the-guided-walk-pinned-specification). The *sensible* choice is **size-aware**
(for a small value Complete is cheap and the spot-check presets degenerate; §14.4). No
commitment / entropy-method / nonce-length choice is ever surfaced; all are derived (and, per
§8, commitment is the live default for the remote ceremony, not a user choice).

---

## 5. Reference acquisition

The medium (text / SVG / raster) is orthogonal to how it arrives: **paste**, **drop**,
**file-pick** (browser file picker / drag-drop; a typed path only in a desktop host), or
**URL-fetch** (`fetch`, then route by type). Caveats baked into the UI:

- **Auto-detect must fail closed.** On ambiguity (polyglots; a value-shaped string that's also
  a URL; an image that is actually an SVG), **reject and ask**, or route to the **least
  authoritative** engine (raster, which can never bless). Sniffing must never *upgrade* an
  artifact onto the IDENTICAL path. (Adjudicated S12.)
- **URL fetch** carries CORS limits, a privacy/referrer leak (surface the origin *before*
  fetch), and the attacker-chosen-reference problem (§2.4). Never present a URL-fetched
  reference with the authority of a locally-held known-good copy.
- **Secret-input warning.** "Paste your value" invites pasting private keys / seed phrases;
  confidentiality is out of scope per the threat model, so the UI must warn on known
  secret-material formats rather than lull (S21).

---

## 6. Per-medium engines

### 6.1 Text → value-level compare (definitive)
Normalize both sides (case/punctuation per the spec's per-alphabet rules) and compare normalized
cores (or normalized comparison-texts). Distinguish **reference entropy** (compare values) from
**reference comparison-text** (compare the text channel). Definitive `IDENTICAL`/`DIFFERENT`.

### 6.2 SVG → recompute, re-render, self-consistency (the hardened path)
A pasted SVG is **attacker-authorable** and the feature has **no golden raster**, so the
conformance checker's "trust the declared `<text>`/`data-*`" stance is unsafe here: Tier-B
excludes glyph pixels, so an SVG whose `<text>` says X while its ink shows Y could otherwise
reach IDENTICAL **with no preimage** (adjudicated S3 — a *requirement* for the unwritten engine,
not a demonstrated bug). The engine MUST:

1. run **strict closed-profile + self-containment validation first** (reject `<foreignObject>`,
   `<style>`, `<image>`, external `href`/`url()`, `@font-face`, `transform` on text, media
   queries, extra per-cell instances) — before extracting any value;
2. recover the normalized core **only at ≤512 bits** (>512-bit cores are unrecoverable from the
   cells; **never IDENTICAL** there);
3. **recompute** all fingerprint-derived fields from the recovered core (do not trust declared
   `data-*`), **re-render** through the tool's own pinned font, and require **self-consistency**
   (gestalt = SHA-512 of its own cells; glyphs = `<text>`);
4. reject any inconsistency → route to the human walk, never IDENTICAL.

### 6.3 Raster → disprove-only, fidelity-probed
A raster **can never reach EQUAL** — color and text are unbound in an attacker-authored image,
and we do not OCR. It may only **DIFFERENT** or **UNKNOWN**. A **fidelity self-probe** (sample
the input-independent constants: bounding fill `#ffffff`, borders `#808080`, color-bar bands =
exact palette entries) decides whether sampling is trustworthy enough to **disprove** on
mismatch; if degraded/lossy/screen-shared, exclude the nucleus channel and bail to the human.
**A passed probe credits zero comparison evidence** — it licenses disproof, not authentication;
an UNKNOWN resets any subsequent human walk to **zero** credited bits (adjudicated S10). Surface
"couldn't read the reference" distinctly from "DIFFERENT" to deny the false-DIFFERENT social
lever (S18).

---

## 7. The guided walk (human path: raster-fallback and live)

### 7.1 Interaction
One feature at a time; the human reports **[Matches] / [Differs]**; one **Differs** → certain
DIFFERENT. The target feature is indicated by an **ephemeral focus ring drawn *around* (never
over) it**, in a **tool-controlled container** (iframe/shadow-DOM at a fixed integer scale the
host cannot transform), anchored in the entviz's own coordinate system by re-measuring the
live-laid-out cell geometry — so a host CSS `transform` can't shift the ring to the wrong cell
(S14). The closed profile is preserved (the ring is never baked into the entviz SVG).

### 7.2 Hard exact-text floor
**No affirmative verdict is reached until a fixed floor of *forced, case-confirmed, read-back*
text checks pass.** Gestalt channels (colour bar, ellipse, blank map, quartile, nucleus colour)
may only **fail-fast to DIFFERENT**; they never independently fill the affirmative meter. This
makes the soundness claim true *by construction* rather than by hoped-for ordering, and it
neutralises order-steering (a steered order cannot avoid the required text checks). (Converged
fix; [synthesis](../../../reviews/comparison-redteam/findings-04-synthesis.md) Ruling 2.)

### 7.3 The confidence meter
Shows **coverage**, not `1-in-2^N`. Credits **effective min-entropy**, and only genuinely
**independent** bits:

- **Independence is per-derivation, not per-channel.** Disjoint slices of the one SHA-512 digest
  *are* independent and may be summed; **overlapping derivations of the same bits must not be**
  (e.g. a cell's edge-singleton, surround, and quartile all ride the same ftok-quant — credit
  the quant once). (Foreign adjudication refinement of S6.)
- **Per-cell text cost is type- and position-specific** — credit a cell its real bits, **not a
  flat 24**:

  | format / position | exact-match cost (constrained generation) |
  |---|---|
  | full hex / base64url token | 24 bits |
  | UUIDv4 cells | ≈24, 24, 18, 24, 24, 8 (six version/variant bits in one token) |
  | CESR first / final token | ≈18 / ≈22 variable bits |
  | 4 base58 chars | ≤ 23.4 bits |
  | 4 base36 chars | ≤ 20.7 bits |
  | 4 chars, 5-bit alphabet (bech32/base32/Crockford) | 20 bits (bit-extension adds none) |
  | 6 decimal chars | ≤ 19.9 bits |
  | Ethereum | six 24-bit cells + one 16-bit final; EIP-55 case adds no identity bits |
  | large-input fingerprint-middle | 24 bits/cell, 96 for all four — **under an honest renderer** |
  | programmable / arbitrary-text / vanity | **~0** (credit 0 for any non-locally-generated value) |

  (Both adjudications; [local](../../../reviews/comparison-redteam/findings-05-adjudication.md) /
  [foreign](../../../reviews/comparison-redteam/findings-06-independent-adjudication.md) Q1.)
- **Viewer-relative (a11y == security, paper §5.4)** but **computed locally and conservatively**
  — never accept discriminability signals from the counterparty; gate a discrete check's credit
  on its *measured rendered size* (don't credit a quartile orientation or plus/dot shape blurred
  below discriminability at the actual scale) (S20/R-F9).

### 7.4 Anti-habituation
Forced one-at-a-time clicks **relocate** rather than defeat rubber-stamping (S9). Mitigations:
**attention probes** (occasionally an item that must be reported `Differs`, scored), and
**active-recall read-back** (the human types/reads a credited cell, not merely clicks
`Matches`). "Quick" must **not** reach an affirmative verdict — cap it at PENDING with
"insufficient checks" language.

### 7.5 Homoglyph hardening
The text anchor is byte-exact but the human reads **glyphs over a noisy channel**; confusables
(`0/O`, `1/l/I`, `5/S`, `8/B`, `-/_`) and dropped case erode effective bits by a bounded,
alphabet-dependent amount (S2 — hardening, not a break). Render the comparison text in a
**pinned, embedded, high-disambiguation font** in the comparison chrome (the spec's
font-embedding "out of scope" applies to the conformant artifact, not a verification tool), and
require an **explicit case + NATO-style readout** (`zero`/`cap-oh`, `one`/`ell`/`cap-eye`) for
credited cells. Lean on the **Crockford-middle** cells for large inputs — single-case and
homoglyph-clean by construction.

---

## 8. The two-party live ceremony

**Threat posture (adjudicated).** Assume the counterparty's **software is hostile** (decision
F). The irreducible requirement is an **authenticated comparison channel** (you recognize the
person on voice/video); confidentiality is *not* required. The compared values are **locked
before the seed** (you don't change your key mid-ceremony) — so observation of the seed is
harmless; the only live threat is a **last-mover steering** the seeded check-order.

**Commitment is the default, not an upsell.** Because a hostile last-moving peer who reveals
their nonce after seeing yours can steer the order (paper §5.2), and the design assumes hostile
counterparty software, the ceremony uses **commit-and-reveal with a high-entropy randomizer**
(binding + hiding; not a bare hash of a short nonce) by default. It removes the
**≈log₂C(K,L)-bit steering discount** (≈14 bits at K=20,L=5; both adjudications quantified
this). Commitment may be **dropped only** when the channel is authenticated, both endpoints
honest, and the seed provably unobserved — a narrow case we do not make the default. *Why this
reverses the pill-era "drop commitment" instinct:* not because text is weak (it isn't — §2.3),
but because the live UX admits a steering peer; see
[local](../../../reviews/comparison-redteam/findings-05-adjudication.md) Q3 and
[foreign](../../../reviews/comparison-redteam/findings-06-independent-adjudication.md) Q3.

**Seed.** Entropy is **scaled to the preset**: require `H_min(seed) ≥ log₂C(K, L_preset)`
(define real K, L, presets — a fixed "14 bits" is right only for Quick). The
**click-harvest** idea is **reconsidered**: human-sourced click entropy does *not* defend
against a malicious local tool (it can falsify the gesture), and an honest tool should use a
platform CSPRNG; harvest the seed from the CSPRNG and reserve any human contribution for the
commitment exchange (foreign adjudication Q3). A short Crockford code is read aloud for the
commit and reveal.

**Local-only evidence.** The verdict, meter, and focus highlights are trusted **only on the
verifying user's own endpoint**; a counterparty's shared screen/meter is *not* evidence (S /
N-4). Over a screen-share, force commitment (or off-screen seed transfer).

**Honest scope.** This ceremony detects a **MITM on the primary (key-exchange) channel** by
comparing over the authenticated OOB channel — the standard SAS guarantee; *contra* an earlier
rebuttal claim, SAS **does** survive a relayed primary channel when the comparison channel is
authenticated. It does **not** defend a compromised endpoint, nor a relay of the comparison
channel itself with no peer authentication.

---

## 9. Property split & API sketch

Mirrors the [pill](./pill-design.md) split: **deterministic entviz render inputs** vs.
**contextual comparison chrome**. A new component composes the existing renderer:

```ts
// <EntvizCompare> — drives a comparison; renders pristine <Entviz> artifacts as panels.
interface EntvizCompareProps {
  // the user's own value (entviz render inputs are deterministic/context-free)
  value: string;
  targetAr?: number; fontSizePt?: number; note?: string | null;
  // reference acquisition (mutually exclusive with `live`)
  reference?: { kind: "text" | "svg" | "raster"; data: string | Blob } | { url: string };
  live?: boolean;                          // the two-party ceremony
  confidence?: "quick" | "strong" | "paranoid";
  // chrome (contextual; localized; a11y) — see pill design §5, §8, §9
  locale?: string; messages?: Partial<Messages>;
  onVerdict?: (v: Verdict) => void;        // { state, coverageBits?, provenance }
  className?: string; style?: React.CSSProperties;
}
type Verdict =
  | { state: "different" }
  | { state: "pending" }
  | { state: "no-difference"; coverageBits: number; complete: boolean }
  | { state: "identical" };
```

Localization, RTL (chrome mirrors, the entviz never does), and a11y follow the
[pill design](./pill-design.md) §8–9, with the same two non-negotiables: never localize/transform
the value or comparison text; never use locale-aware casing on the value.

---

## 10. What must be pinned before implementation (the adjudicators' "unspecified")

Both adjudications stressed that *product severity* is uncertain because these are unspecified.
They are prerequisites, not afterthoughts:

1. **Concrete K (checklist size), L per preset, and the bit thresholds** Quick/Good/Complete
   map to — and the seed `H_min` each requires. *(Pinned for M2 in
   [§14](#14-m2--the-guided-walk-pinned-specification); seed `H_min` is an M3 item.)*
2. **The channel-authentication model** the live ceremony assumes (what makes the OOB channel
   "authenticated" in the UX).
3. **The full verdict state machine** (transitions, what credits/resets the meter).
4. **Measured per-format keygen/output distributions** for the supported typed values (to
   confirm the §7.3 table against real key formats).
5. **Human-factors studies** the paper itself flags as unmeasured (§6.3): habituated walk
   completion; case/homoglyph error rates. Until measured, treat S2 as *necessary* hardening and
   do not advertise nominal bits.

---

## 11. Security rationale index (decision → supporting finding)

| decision | grounding |
|---|---|
| Text is the primary anchor (constrained high-entropy) | adjudications Q1; paper §5.1/§5.3 |
| Credit per-format bits; 0 for programmable/non-local | S16; both adjudications Q1 |
| Coverage meter, not `1-in-2^N`; independent bits only | S6/S13; paper §4.3.9 |
| Hard text floor; gestalt fail-fast only | Ruling 2; S2/S5/S7 |
| Commitment is the live default (steering, not weak text) | Ruling 1 corrected; both adjudications Q3; paper §5.2 |
| Seed scaled to preset; reconsider click-harvest | foreign Q3; S5/S8 |
| SVG: recompute+re-render+self-consistency; no >512 IDENTICAL | S3 (requirement) |
| Raster: disprove-only; UNKNOWN = zero evidence | S10 |
| Auto-detect fail-closed | S12 |
| Anti-habituation (probes, read-back) | S9 |
| Local-only evidence; provenance first-class | S17; endpoint-trust limit |
| Equality-soundness ≠ reference-authenticity | foreign Q2/Q5 |

---

## 12. Deferred / out of scope

- The **adversarial seeded-walk protocol's** full formal specification (the §10 items).
- **Desktop-host** typed-path file references and OS clipboard integration.
- Anything the [pill design](./pill-design.md) §11 defers.

---

## 13. Provenance — how this design was validated

This design's security decisions were adversarially stress-tested through a five-stage chain
(all archived under `reviews/comparison-redteam/`):

1. **Adversarial panel** — three independent single-lens red-teams:
   [cryptography](../../../reviews/comparison-redteam/findings-01-cryptography.md),
   [usable-security](../../../reviews/comparison-redteam/findings-02-usable-security.md),
   [rendering/forensics](../../../reviews/comparison-redteam/findings-03-rendering-forensics.md).
2. **Synthesis** — [consolidated panel verdict](../../../reviews/comparison-redteam/findings-04-synthesis.md)
   (findings **S1–S22**, seams **SEAM-1..6**).
3. **Rebuttal** — a [first-principles counter-analysis](../../../reviews/comparison-redteam/rebuttal-01-orchestrator.md)
   challenging the panel's headline.
4. **Adjudication (local)** — an [independent third derivation](../../../reviews/comparison-redteam/findings-05-adjudication.md)
   under mandatory rigor rules.
5. **Adjudication (foreign)** — a [second independent adjudication by a different model](../../../reviews/comparison-redteam/findings-06-independent-adjudication.md).

**Net, two-model-converged outcome:** the panel's dramatic headline ("text-anchoring doesn't
survive → reinstate commitment because text is matched for 0 bits") is **false for the canonical
constrained-high-entropy substitution case** — forging text is a real 2²⁰–2²⁴-bit-per-cell
partial preimage. The genuine, philosophy-independent requirements are the machine-path and
meter fixes (S3, S6, S10, S12) plus human hardening (S2, S9). And commitment **does** belong in
the live default — not because text is weak, but because the live ceremony admits a last-mover
who could steer the check-order. This doc encodes that corrected, adjudicated position.

---

## 14. M2 — the guided walk (pinned specification)

This section pins the guided walk for implementation. It **supersedes the §7 sketch and the §4
preset names where they differ** — notably: presets are **Quick / Good / Complete**; gestalt
dimensions **contribute coverage**, not fail-fast only; attention probes are **opt-in for
Complete only**; commitment/seed/channel-auth move to the live ceremony (M3, §8). It is grounded
in the companion adversarial paper *Measuring the Glance*: the operative strength is a **curve**,
the casual glance is loose and parallel, and a difference is reliably *perceived* only when
attention is **directed** to a feature. The walk's job is to spend scarce attention well.

It covers the **single-user** walk (when the machine path bailed to `unknown` — an inconsistent
SVG, a raster, a >512-bit input — and the human verifies anyway) and the shared mechanics the
live ceremony builds on.

### 14.1 What a walk checks: text cells and gestalt dimensions

A difference can be checked along many **features**, of two kinds:

- **Text cells** — a cell's glyphs. *Local, lossless* (at ≤512 bits the text *is* the value),
  *input-driven* (steerable: an attacker can set them by choosing the input). They are the
  **certainty backstop** — matching one exactly is positive proof for that slice of the value.
- **Gestalt dimensions** — each one **dimension along which the figure-as-a-whole is
  characterized**, and each a deterministic function of SHA-512 of the *entire* value
  (*hash-driven / un-steerable*), so **a difference anywhere in the value avalanches every
  gestalt dimension at once** — together they are a **whole-value CRC**, and being un-steerable
  they are the *true* grind cost against the realistic constrained attacker. The checkable pool
  (all carried by ringable elements):
  - *Salient (read loosely in the parallel glance; focus to confirm):* **background colour**
    (~2 bits); **colour-bar pattern** — band order + heights (~4.6 bits for the order);
    **ellipse** — orientation / aspect / size (~7 bits, factored); **blank pattern** — which
    cells are holes.
  - *Positional CRC (need directed attention; higher positional bits):* **colour-bar markers**
    (the two gutter circles' slot positions); **quartile marks** (the four triangles' cell
    positions, ~4·log₂N); **blank-map markers** (the plus = max, dot = min inside the one map
    cell).

  Two clarifications. The **blank pattern** (where the holes are) and the **blank-map markers**
  (where the map's plus/dot point) are *separate* dimensions — the map is the single
  lowest-indexed blank and *additionally* carries the min/max marks. The per-cell **surround
  texture** (24 box on/offs = `data-surround-bits`) is *machine-grade* — it is why `compareSvg`
  is strong, but 24 on/offs are below reliable eyeball discrimination, so it stays out of the
  human pool (offered only as a diligent extra in Complete). Nucleus *colour* re-encodes the
  cell's text bits, so it is checked *as* the text, not as a separate dimension.

> **"Gestalt" means "characterizing the whole rather than the parts," along one dimension of
> analysis** — the way light/dark ratio and clumpiness are both properties of a bitmap, yet a
> viewer attends one *independently* of the other. It does **not** mean "absorbed automatically
> in one glance": a casual glance reads the gestalt loosely and in parallel and can miss any
> given dimension (crowding, overlay-tint coupling, masking — *Measuring the Glance* §5–6). Each
> gestalt dimension must have attention **directed** to it to be discriminated reliably — which
> is exactly why the walk focuses *every* feature, gestalt or text. (A dimension too diffuse to
> localise — overall "clumpiness", grid aspect ratio — is not a checkable feature; we check only
> dimensions carried by a *ringable element*, and a gross structural difference like a different
> grid shape is caught for free.)

### 14.2 The check plan

A walk executes a **check plan**: an **unpredictable, ordered subset** of features.

- **Mixed.** A plan combines text cells and gestalt dimensions (e.g. *2 text + colour-bar order +
  ellipse*, or *4 text + colour-bar order*). It always includes **≥ 2 text cells** as the lossless
  backstop — a gestalt match is only *within human tolerance* and cannot, alone, bless. The exact
  recipe per preset is a tunable knob, not a blocker.
- **Unpredictable selection + order** — from the **local CSPRNG** (single-user) or the
  **committed-then-revealed seed** (live remote, M3), so neither the user's habit nor a steering
  peer can pre-empt it. *This unpredictability is the anti-habituation mechanism*: the user can't
  pre-load a rote answer, they must look at whatever the ring lands on. (It retires planted
  decoys for Quick/Good; see §14.6 for the Complete-only probe.)
- The **familiar ends** (first/last cells) are **recognition-only, zero credit** — eligible for
  the random pool but never privileged, so an attacker who vanity-grinds the ends gains nothing.
- For **>512-bit** inputs the **fingerprint-middle (Crockford) cells are the mandatory anchor** —
  SHA-512-derived (hard to forge unconditionally) and single-case / homoglyph-clean; head/tail are
  recognition-only.

### 14.3 Directing attention (any feature)

Because the tool renders both figures, it knows the **exact geometry** of every element from the
render model (`describeChannels` + geometry). The §7.1 focus ring therefore **generalises to every
feature**: a computed highlight **around** (never over) the element that carries it — a cell, the
colour-bar rect, the ellipse's contour/bounding box, a marker, a blank cell — drawn in the
**tool-controlled container** (fixed integer scale, host-transform-proof), anchored by re-measuring
live geometry. One feature at a time, on **both** figures. For a **gestalt dimension** the ring
lands on its carrying element and a short prompt names the dimension ("same colours, top to
bottom?"; "does the oval lean the same way?").

- **SVG / value reference** (we re-render it): both rings are precise.
- **Raster reference** (an image we can't geometry): we ring **our** side precisely and prompt the
  user to find the matching feature on the reference.

### 14.4 Presets — the user declares; the menu is size-aware

There is **no default**: the user **declares** the standard before the walk. But which presets are
*sensible* depends on the value's **size in cells**, so the tool presents a **size-aware** menu and
may *advise* — it never silently defaults.

- **Small (the whole value is only a handful of cells — roughly ≤128 bits):** reading every cell is
  trivial, so **Complete is the natural target and the only non-degenerate one** — a "Quick" check
  of a 5-cell LEI is nonsensical (a subset is nearly the whole). Offer Complete (noting the value is
  small enough to verify in full); mark the spot-check presets redundant. Complete here = the
  **lossless whole value → certainty**.
- **Large, ≤512-bit (up to ~22 cells):** all three are meaningful — Complete = lossless certainty
  (a chore); Quick / Good = spot-check. The tool may *advise* by stakes ("256-bit value; for
  anything irreversible, Complete") without defaulting.
- **>512-bit (a huge value; only 20 cells are displayed):** the whole value can't be read
  regardless, so even **Complete = "all 20 displayed cells," which is strong but not lossless**
  (head + tail recognition + the 96-bit fingerprint-middle) — it reaches **NO-DIFFERENCE**, never
  the lossless certainty of a small Complete. Quick / Good are lighter spot-checks of the same.

The meter is a **coverage bar** (features checked of the plan), **not** a `1-in-2^N` probability;
a conservative bit estimate lives in a tooltip only, labelled an upper bound before human-error
discount. The three names are **anchors on a continuous scale** — the user may keep checking past
Good (the meter shows where they are), so no fourth level is needed. **Quick caps at PENDING** ("a
sanity look, not a verification"); **Good** and **Complete** reach **NO-DIFFERENCE**. **Credit is
binary per feature and 0 for any non-locally-generated input cell** (a programmable / vanity value
can't reach Good through its text — though a >512-bit one still can via the always-credited
fingerprint-middle).

### 14.5 Reporting a check (by mode)

A focused check is reported **Matches / Differs**; *how* depends on the channel:

- **Single-user (visual, both figures in the pinned font, side by side):** **click**. No read-back —
  the pinned high-disambiguation font makes glyph differences (incl. base64url confusables) visible,
  and focusing supplies the attention, so homoglyph erosion ≈ 0.
- **Live + a trusted digital channel:** the parties **copy/paste** the value or comparison text and
  we run the **machine compare** — definitive, no walk. Strictly better than reading aloud whenever
  available. (Pasting the *value* is definitive; pasting *comparison text* is definitive ≤512, but
  only a strong-but-`unknown` match >512 — the text isn't lossless there.)
- **Live, voice-only:** **typed or spoken read-back**. **No NATO**; homoglyphs are *tolerated* and
  compensated by **one extra credited text cell** when the plan contains base64url cells (arbitrary
  text / DID / URN) — never for >512 (the Crockford anchor is clean) or homoglyph-safe alphabets
  (hex, base58, bech32, base32, Crockford, decimal, Ethereum).

### 14.6 Verdict state machine

States: **DIFFERENT** (terminal) · **PENDING** · **NO-DIFFERENCE** (coverage; affirmative-but-
probabilistic) · **IDENTICAL** (machine-only — **never** reachable from a walk; reserve `=`/green
for it).

- **Any feature reported Differs → re-look prompt.** *Maintained* → **DIFFERENT** (terminal,
  certain). *Retracted* ("misclick") → the feature is **re-queued as a fresh check**, never silently
  credited, so a hasty or pressured retraction can't become a free pass. (We never offer a "confirm
  your Matches" — that would coach a stamper.)
- **A gestalt dimension fails-fast to DIFFERENT** like any feature; a *match* contributes
  **coverage** (the whole-value CRC + un-steerable bits), but the **affirmative still requires the
  ≥ 2 lossless text cells** — only text certifies *same value*.
- **Each distinct feature counts once** (no re-credit for re-checking).
- **PENDING → NO-DIFFERENCE** only when the text backstop is met **and** coverage ≥ the declared
  preset target.
- **Resets:** a **failed optional probe** (Complete) → warn + **reset the meter to 0 → PENDING**
  (graduated: a second miss ends the walk "inconclusive — do this with full attention"); a
  **preceding raster `unknown`** → the walk **starts at 0** (a degraded reference credits nothing,
  §6.3).

### 14.7 Anti-habituation

The primary mechanism is the **unpredictable mixed plan** (§14.2) — relocation by surprise, not by
ceremony. On top of that, a **transparent planted difference** is **standard for Complete on a
large value** (more than ~10–12 cells, where the exhaustive read is long enough to breed
inattention) and used **nowhere else** (a small Complete is too short to need it; Quick/Good rely
on the unpredictable plan).

It is **disclosed, not a hidden decoy**: the tool tells the user it has planted **exactly one**
mismatch and asks them to find it. The outcomes are unambiguous:
- **found zero** → inattention (→ reset, §14.6);
- **found exactly one** → attention calibrated; the planted difference is discarded;
- **found more than one** → the values genuinely differ (a real mismatch avalanches into many).

Because it is disclosed, it adds confidence without the tool ever deceiving the user, and the
single planted difference doubles as the calibration baseline against which any *real* difference
stands out.

### 14.8 Messaging & mental model

How the walk is framed teaches a mental model and calibrates risk, so it is a **first-class part
of the design, not chrome**. Three ideas the copy must instill:

- **A glance can miss things; this walk *aims* your attention so you actually see.** (Counters the
  "I looked, it's fine" overconfidence the paper warns of.)
- **Text *proves* a slice of the value; the picture *covers* the whole** — a real difference lights
  up many features at once.
- **You declared the standard; here is exactly what it does and does not promise.**

Per-preset framing (illustrative; localized per the pill catalog):

- **Quick** — "A sanity peek, not a verification — this proves nothing on its own."
- **Good** — "We'll aim your attention at a handful of unpredictable features — some exact text,
  some whole-figure patterns. If anything differs, stop. A strong spot-check, not exhaustive."
- **Complete (large)** — "We'll walk every cell in a deliberate, unpredictable order, and we've
  planted **exactly one** difference — find it. Find none and you weren't really looking; find more
  than one and the values genuinely differ."
- **Complete (small)** — "This value is small enough to verify in full; we'll read every cell."

Verdict copy keeps the §3 discipline: reserve `=` / green / the word "identical" for a **machine**
result; a human walk yields **"no difference found across what you checked,"** never certainty.

### 14.9 Out of scope → M3 (the live ceremony, §8)

The **committed seed + reveal**, the **channel-authentication affirmation** (what the UX requires to
treat the out-of-band channel as authenticated), and the **copy/paste-vs-voice routing** for the
*remote* ceremony are M3. This section specifies the single-user walk and the shared mechanics
(plan, focus, presets, state machine) the ceremony reuses.
