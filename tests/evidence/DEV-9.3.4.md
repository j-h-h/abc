# DEV-9.3.4 — test evidence

Status: pending exact-commit CI, DEV-only deployment and canonical public desktop/phone verification.

Synthetic regression fixtures explicitly exercise delayed area requests during map pan, partial replies, provider 503, original-clock expiry, operator-scoped identities, changed trips, newer reports outside the view, number-only markers and enlarged source arrows. Supplier arrival forecasts stay unchanged. Traffic fixture colors are synthetic and never evidence of active Israel traffic.

Real TomTom account: authenticated Freemium, no credit card, daily enforced request limit; key stored sensitive on DEV server only. Actual public run 38036642142 (2026-10-10T08:05:49Z) failed positive traffic proof with coloredPixels=0. Current official legacy/Orbis v2 country lists omit Israel. Coverage-confirmed flag remains unset; public expected behavior is connected=true, available=false, coverage-unavailable and compact ״אין כיסוי״ without traffic image requests.

No paid plan, payment, card or credit enabled. History+traffic weighted ETA remains blocked by missing verified arrival observations and directed live flow. DEV and LIVE-WORK are separate; no WORK mutation.
