# Entviz-JS Intent File
# Component: entviz-js (@entviz/core + @entviz/react)
# Format: intent code (YAML) — see docs/intent-methodology.md
#
# Node NAMES are meaningful and may be renamed freely; the 8-char `id:` is an
# OPAQUE base32 handle that never changes, so references (in prose, commits, and
# other nodes) stay stable across renames.
#
# The core entviz algorithm/spec intent is authoritative in the sister `entviz`
# repo (this.i + docs/spec.md). THIS file records intent for the JS/TS surface —
# the @entviz/core derivations and the @entviz/react component chrome — that sits
# AROUND the closed, deterministic entviz artifact and never alters it. Seeded
# 2026-07-15 to capture the "corpus recognition" work; it does not retroactively
# document features that shipped before it (the pill, the compare/voice ceremony).

Entviz-JS Port = goal:
  id: kciqzyev
  why: >
    Port entviz to TS with a browser-safe @entviz/core (isomorphic, @noble/hashes,
    no node:crypto/fs/Buffer) and an @entviz/react component layer. New features may
    be added here, but must never violate the spec/docs whose definitive embodiment
    is the sister entviz repo. The split that governs everything below: the entviz
    SVG is the CLOSED, context-free, deterministic artifact (spec's job); the pill /
    container is CONTEXTUAL chrome that inherits font/theme and may add affordances
    around — never on top of — the artifact.

  children:

    Corpus Recognition Affordances = goal:
      id: hcnqi6xk
      why: >
        Two postures, one artifact. entviz was built for the WILD posture:
        cross-channel, adversarial, where the collapsed pill must carry ZERO
        identity bits so it can never be glance-compared (pill-design.md §3.3, §10).
        A first real consumer — cesrview (../bakobo/cesrview), a KERI KEL viewer —
        introduces the CORPUS posture: a closed, single-origin body of values the
        user already trusts (their own machine's microledger), where the same
        identifier recurs dozens of times and the job flips from "prevent false
        sameness judgments" to "aid TRUE sameness recognition." This subtree adds
        derived, low-entropy gestalt channels (mnemonic text, icon, color) that make
        recurrence scannable — but ONLY when a host explicitly declares the corpus
        posture. The wild default is unchanged. Driving requirement set discussed and
        adjudicated 2026-07-15.

      children:

        Rule-out, never rule-in = constraint:
          id: uibwfl47
          why: >
            The security invariant that makes every derived channel below safe. A
            mnemonic / icon / color is a DIFFERENCE DETECTOR, not a sameness
            confirmer: because it is a deterministic function of the value, two
            DIFFERENT displays prove DIFFERENT values (rule a match OUT at a glance);
            two MATCHING displays prove nothing (never rule a match IN) — sameness
            still routes through expand -> formal verification. This is just
            "recognition != verification" restated. Low entropy (a ~6px icon, ~16
            colors) is therefore a FEATURE for the rule-out direction and a
            non-threat for verification, since we never sell the rule-in. It also
            means these channels must be visually distinguishable from, and never
            mixed confusingly with, the constant zero-identity badge.

        Trust Assumption object = decision:
          id: ujdwjtex
          why: >
            The gate that opens the value-derived channels (mnemonic/icon/color) is a
            first-class, shareable TrustAssumption object, NOT a pile of independent
            cosmetic booleans and NOT an app/page-wide mode. Rationale: provenance is
            PER-VALUE, not per-viewport. A host creates and configures one assumption
            for a set of same-origin values and references it from each of those
            pills; foreign entropy brought into the same UI gets a DIFFERENT
            assumption (or none). Default (no object) => maximum safety = wild posture
            = the three value-derived channels OFF; still ON are the constant badge,
            type text, role caption, corner shape (ungated), and all copy/compare
            affordances. The object is greppable and auditable: a reviewer finds every
            pill that references a TRUSTING assumption and asks "is that origin really
            trusted?" — one path to audit instead of scattered flags. It carries the
            corpus's whole presentation policy: which channels are on, palette,
            mnemonic format. v1 shape (proposed for review):
              { posture, mnemonic?, icon?, autoColor?, palette?, /* v2: verifiedFingerprints */ }
            v1 is host-declared and IMMUTABLE. Alternatives rejected: (a) app/context
            provider — wrong granularity, provenance isn't per-screen; (b) independent
            autoLabel/autoColor booleans — not greppable, easy to cargo-cult a
            value-leak into a wild context.
          status: drafted

        Earned promotion (reserved) = decision:
          id: xlqpkhfy
          why: >
            DEFERRED to v2 — reserved, not built. See tick ~2lia. Idea: an entviz's
            effective posture may ELEVATE from wild to trusting for THAT value once
            the user completes a SUCCESSFUL formal comparison (the voice/walk verdict).
            Sound because promotion never lights up an UNVERIFIED value: the only
            values that ever get gestalt channels are host-declared-trusted OR
            personally-formally-verified, so an attacker's forgery can't masquerade via
            the channel unless the user already ran it through — and passed —
            verification (the strong gate). It extends cheap recognition over an
            already-verified set without defeating verification. Deferred because: it
            forces the assumption object (ujdwjtex) to become a STATEFUL/observable
            store keyed by fingerprint (effective = baseline shared+immutable UNION
            earned per-value), it couples the pill to the ceremony's success state, and
            it is NOT needed for cesrview (fully host-declared-trusted). v1 reserves a
            `verifiedFingerprints`-shaped hole so v2 slots in.
          status: deferred

        Auto mnemonic label = decision:
          id: mmtxrg4w
          why: >
            Gated by ujdwjtex. Renders a short deterministic mnemonic (in the pill's
            label slot, monospace) so recurring values are recognizable at a glance in a
            trusted corpus. CONSISTENCY PRINCIPLE (owner, 2026-07-15): the mnemonic must
            only ever show characters the ENTVIZ ITSELF shows — otherwise a user reads a
            group that appears NOWHERE when they expand, which is disorienting. So it is
            built PURELY from the entviz's own displayed cells (`mnemonic(cells, sizeBits)`
            in describe.ts), never from a base64url slice of the primary SHA-512 (the
            REJECTED v1: the entviz never renders that digest as text — value cells for
            ≤512-bit, and only a Crockford base32 fingerprint-MIDDLE for >512-bit). Shape
            scales with entropy so it stays distinctive: <256 bit -> first-cell…last-cell;
            >=256 bit -> first-two-cells…middle-cell…last-cell, where for a >512-bit input
            the middle IS a genuine fingerprint-middle cell (still shown by the entviz).
            The `…` is honest — it marks the omitted middle cells, all present on expand.
            Divergence is fine: two Ed25519 AIDs almost never share both head and tail, and
            in a trusted corpus the entviz itself is the real disambiguator. Explicit host
            `label` still wins over the mnemonic. (129-255 bit falls in the <256 branch.)
          status: drafted

        Colorbar icon = decision:
          id: wn3r6aex
          why: >
            Gated by ujdwjtex. Replace the constant zero-identity badge with a
            value-derived micro-icon — a variation on the entviz colorbar (rotate
            horizontal, squished to pill height; the two colorbar markers positioned
            across the full horizontal extent). Directly reintroduces the value-derived
            visual that §3.3 forbids in the wild, so it is STRICTLY corpus-only. Safe
            under uibwfl47: a ~3-bit gestalt is an honest difference-detector and
            grind-trivial for the rule-in it never claims. The real hazard is MIXING a
            constant badge (wild) and a derived icon (corpus) on one screen — a user
            can't tell which icons carry signal. Mitigations: (i) keep the derived icon
            VISUALLY DISTINCT from the constant 2x2 badge (block vs. horizontal
            micro-bar); (ii) prefer a uniform posture per screen. Derive the icon from a
            DIFFERENT slice of the fingerprint than autoColor (tgowi7go) so the two
            channels are semi-independent (color+shape = accessibility win + more
            combined rule-out).
          status: drafted

        Auto color tint = decision:
          id: tgowi7go
          why: >
            Gated by ujdwjtex. An `autoColor` that hashes the value into a small palette
            (~16 colors) and paints a subtle background tint, so "the red ones" pop when
            scanning a microledger with a few dozen uniques recurring many times. cesrview
            reached this same conclusion independently (its this.i §v7kd3m): color is
            DECORATIVE, the fingerprint glyph is the sameness invariant, and hue collides
            badly at scale (~2100 tokens/stream) and fails for colorblind users. So ~16
            colors = 4 bits = GUARANTEED collisions with dozens of uniques => a SOFT
            PRE-FILTER ("the red ones catch my eye -> then I check"), never a partition —
            exactly the uibwfl47 invariant. Cautions: a full-opacity wash can wreck text
            contrast, so palette must be contrast-checked against light AND dark themes
            (or use a low-saturation tint); a full-row tint IS more scannable than a
            border, which is the tradeoff to weigh at build time. Pure
            `autoColorIndex(value) -> 0..N` + palette in @entviz/core.
          status: drafted

        Corner shape by role = decision:
          id: gk37dm5n
          why: >
            UN-GATED (needs no TrustAssumption) — the exception in this subtree. Corner
            geometry encodes the semantic TYPE, not the value, so it carries NO new
            identity bits: the type is already disclosed as trusted pill text, and the
            shape derives from entviz's own characterize(), which an attacker can't forge
            without actually producing that value-type. So it is safe even in the wild.
            Keyed on the closed `role` enum (key | signature | digest | address |
            identifier) with null normalized to "raw". role — not entropyType — is the
            right axis because it is the SEMANTIC-CATEGORY axis a KEL scanner cares about
            ("signature vs digest vs key"), whereas entropyType drags in encoding
            distinctions (base64 vs hex) that aren't the point AND collapses all CESR to
            "cesr" (a KEL is mostly CESR, so that collapse is fatal). role splits CESR
            correctly — audited 2026-07-15: E->digest, D->key, 0B->signature; DID/UUID
            ->identifier, SSH->key, BTC->address. null->"raw" is not a gap but MORE
            HONEST: role is null exactly when the recognizer has no basis for a category
            (bare hex is just hex), and shaping it "digest" would assert knowledge entviz
            doesn't have. Shape is a separate, shareable CornerMap object (kept out of the
            trust policy, since an app may want one shape vocabulary across both trusted
            and foreign pills):
              type CornerKey = Role | "raw"
              type CornerMap = Partial<Record<CornerKey, CornerToken>> & { default?: CornerToken }
            Corner tokens are a small CURATED enum of named treatments — NOT raw radii,
            which would mint 50 confusable shapes. Settled to SIX (one per role bucket),
            chosen for mutual distinctiveness at pill size: round | sharp | leaf | bevel |
            notch | arrow (leaf/bevel = the rounded/angular diagonal pair; notch/arrow =
            leading-edge treatments). DEFAULT_CORNER_MAP is a full bijection
            (identifier→round, raw→sharp, signature→leaf, key→bevel, digest→notch,
            address→arrow). Resolver-FUNCTION form dropped from v1 (role is a clean closed
            set; reserve it if a real entropyType-level need appears).
          status: drafted

    Pill vertical density = decision:
      id: yja5x6pf
      why: >
        Trim the pill's vertical extent so it sits with less disruption on lines whose
        leading is near 1.0. Settled 2026-07-15: pillBody lineHeight 1.35 -> 1.25
        (1.20 was only barely tolerable; 1.25 gives a little breathing room). Risk: the type/label text and the constant
        badge both rely on a generous line box for descender room (g/y/p) and optical
        centering (the translateY(-0.06em) nudge), so 1.2 is near the floor; if
        descenders shear, back off to ~1.25 or restore a hair of paddingBlock rather
        than clip. Interacts with autoColor (tgowi7go): a very tight pill WITH a color
        wash starts to read like a highlighter marker.
      status: drafted
