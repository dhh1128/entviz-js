/**
 * The TrustAssumption gate (this.i ujdwjtex) — the security spine of the corpus
 * recognition affordances.
 *
 * entviz's collapsed pill is built for the WILD posture: cross-channel and
 * adversarial, where it must carry ZERO identity bits so it can never be
 * glance-compared. A host that owns a closed, single-origin body of values (a
 * CORPUS — e.g. a KERI KEL from the user's own machine) can instead ask for
 * derived, low-entropy gestalt channels that make recurrence scannable: the
 * mnemonic label, the colorbar icon, and the auto-color tint.
 *
 * A TrustAssumption is a shareable, host-declared, v1-IMMUTABLE object. Provenance
 * is per-VALUE, not per-viewport: a host configures one assumption for a set of
 * same-origin values and references it from each of those pills; foreign entropy
 * gets a different assumption (or none). It is greppable and auditable — a reviewer
 * finds every pill that references a TRUSTING assumption and asks whether that
 * origin is really trusted.
 *
 * `resolveChannels` is the pure gate. The load-bearing invariant: outside the
 * corpus posture (no object, or any other posture) EVERY value-derived channel is
 * OFF, and a stray channel flag can never override that. Within corpus, each
 * channel is opt-in (default off), so turning on a visible channel stays deliberate.
 */

/** Trust posture. `wild` (the default) is adversarial/cross-channel; `corpus` is a
 *  closed, single-origin, already-trusted body of values. */
export type Posture = "wild" | "corpus";

export interface TrustAssumption {
  /** The trust posture. Only `corpus` opens the value-derived channels. */
  posture: Posture;
  /** Opt in to the mnemonic label channel (this.i mmtxrg4w). Corpus posture only. */
  mnemonic?: boolean;
  /** Opt in to the value-derived colorbar icon (this.i wn3r6aex). Corpus posture only. */
  icon?: boolean;
  /** Opt in to the auto-color background tint (this.i tgowi7go). Corpus posture only. */
  autoColor?: boolean;
  /** Palette for the auto-color tint; consumed by the color channel when enabled. */
  palette?: readonly string[];
  // v2 reserved (this.i xlqpkhfy, tick ~2lia): a `verifiedFingerprints` set for
  // EARNED PROMOTION — a value elevates to trusting once the user completes a
  // successful formal comparison. Not built in v1; the shape is reserved here so
  // v2 slots in without a breaking change.
  //
  // idea (tick ~43ml): an `autoLabel` RESOLVER — a (possibly async, lazy) function
  // that looks a value up (registry / address book / KEL alias table) and returns a
  // human name for the pill's label slot. Unlike the deterministic mnemonic channel
  // (mmtxrg4w), this is a host-supplied LOOKUP, not value-derived; still corpus-gated
  // and rule-out-never-rule-in (a looked-up name is not verification). Not built.
}

/** Which value-derived channels are enabled, after applying the posture gate. */
export interface ResolvedChannels {
  mnemonic: boolean;
  icon: boolean;
  autoColor: boolean;
}

/**
 * The posture gate. Returns which value-derived channels are enabled for a given
 * {@link TrustAssumption} (or none). Outside the `corpus` posture, all are OFF
 * regardless of any channel flags (maximum safety); within `corpus`, a channel is
 * on only when its flag is strictly `true`.
 */
export function resolveChannels(assumption?: TrustAssumption | null): ResolvedChannels {
  // Early-return keeps the safety gate obvious AND narrows `assumption` to non-null
  // for the typechecker: anything but the corpus posture yields all-off.
  if (assumption?.posture !== "corpus") {
    return { mnemonic: false, icon: false, autoColor: false };
  }
  return {
    mnemonic: assumption.mnemonic === true,
    icon: assumption.icon === true,
    autoColor: assumption.autoColor === true,
  };
}
