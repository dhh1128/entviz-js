# SECURITY LOW (F10): URL fetch follows redirects while the displayed provenance origin stays the pre-redirect one
kind: todo
tags: security
created: 2026-08-04T04:49Z

- 2026-08-04T04:49Z Full write-up: reviews/security-scan-2026-07-31/RESULTS.md F10 (EntvizCompare.ts:557, onFetch). Verdict engines unaffected; damage is limited to provenance and consent integrity. Fix: re-derive the origin from res.url, or use redirect: 'error'/'manual' and re-confirm.
