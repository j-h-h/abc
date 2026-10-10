# DEV-9.3.4 — test evidence

Code 71e7eda125fe0f4a4965a4497de7df19cbe2d777; exact-commit CI 38038005106 passed all suites and desktop/phone browser flow. GTFS build verified 911 lines / 6680 routes / 560a61f2a20156ec. DEV deployment dpl_8gvXQQhhhuUAacaJ55jaf97eALt1 created after CI success. Canonical public verification pending.

Synthetic regression fixtures explicitly exercise delayed area requests during map pan, partial replies, provider 503, original-clock expiry, operator-scoped identities, changed trips, newer reports outside the view, number-only markers and enlarged source arrows. Supplier arrival forecasts stay unchanged. Traffic fixture colors are synthetic and never evidence of active Israel traffic.

Real TomTom account: authenticated Freemium, no credit card, daily enforced request limit; key stored sensitive on DEV server only. Actual public run 38036642142 (2026-10-10T08:05:49Z) failed positive traffic proof with coloredPixels=0. Current official legacy/Orbis v2 country lists omit Israel. Coverage-confirmed flag remains unset; public expected behavior is connected=true, available=false, coverage-unavailable and compact ״אין כיסוי״ without traffic image requests.

No paid plan, payment, card or credit enabled. History+traffic weighted ETA remains blocked by missing verified arrival observations and directed live flow. DEV and LIVE-WORK are separate; no WORK mutation.
