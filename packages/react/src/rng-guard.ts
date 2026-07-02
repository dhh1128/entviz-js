/**
 * `safeRng` — the production gate for an injected `rng` (proposal-2026-07-02-v2
 * §5.4). The walk/ceremony sampling draws its check ORDER from an unpredictable
 * source; letting a host inject a seeded/predictable `rng` is a legitimate DevX
 * affordance for tests and repro demos, but shipping that predictability to
 * PRODUCTION would defeat the unpredictable-sampling defense (an attacker who
 * knows the order pre-forges exactly the sampled cells → a false NO-DIFFERENCE).
 *
 * So the rule is airtight, not advisory: in a production build the injected `rng`
 * is IGNORED and the platform CSPRNG is always used, regardless of any config
 * drift or a compromised host that passes an `rng`. Dev/test may inject.
 *
 * Route Walk, Voice, and Compare's `rng` through this ONE helper so all three
 * honor the gate uniformly.
 */

/** The platform CSPRNG [0,1) — the SAME source the components already use
 *  (crypto.getRandomValues over 2^32). This is what a prod bundle always draws. */
export function csprng(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/**
 * True in a production build. Robust against a browser bundle where `process`
 * is undefined (must not throw) and against a `process` that carries no `env`.
 */
function isProduction(): boolean {
  return typeof process !== "undefined" && !!process.env && process.env.NODE_ENV === "production";
}

/**
 * Return the [0,1) source the sampling should use. In production the injected
 * `rng` is discarded and the platform CSPRNG is returned. Otherwise the injected
 * `rng` is honored, falling back to the CSPRNG when none is supplied.
 */
export function safeRng(rng?: () => number): () => number {
  if (isProduction()) return csprng;
  return rng ?? csprng;
}
