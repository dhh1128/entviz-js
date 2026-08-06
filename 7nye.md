# SECURITY LOW (F10): URL fetch follows redirects while the displayed provenance origin stays the pre-redirect one
kind: todo
tags: security
created: 2026-08-04T04:49Z
closed: 2026-08-06T06:37Z

- 2026-08-04T04:49Z Full write-up: reviews/security-scan-2026-07-31/RESULTS.md F10 (EntvizCompare.ts:557, onFetch). Verdict engines unaffected; damage is limited to provenance and consent integrity. Fix: re-derive the origin from res.url, or use redirect: 'error'/'manual' and re-confirm.
- 2026-08-06T06:37Z Fixed in f0c6b90. redirect: 'manual' was rejected — in a browser it yields an opaque-redirect response with an empty url and no readable Location, so the one fact re-consent needs (the new origin) is exactly what it hides; 'error' fails closed but breaks benign http->https and trailing-slash redirects and still cannot name a target. Shipped: follow, re-derive originOf(res.url), and split the consents — egress stays consented at the Fetch click, but ADOPTING the bytes as the reference is gated behind a fresh confirmation naming both origins whenever the redirect crossed origins. fetch.success carries the true origin plus requestedOrigin when they differ. Rationale at this.i:kwt1faw7.
