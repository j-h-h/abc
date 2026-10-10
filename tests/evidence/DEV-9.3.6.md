# DEV-9.3.6 — numbers after a daily GTFS update; recent searches

Code 3645414472f64b0534684746731ed7288aa9702a passed CI 38044487283 (verify 114191147350), including all source/history/traffic suites, metadata-refresh unit tests, real address and station flows, history reopen and GTFS 4945dd6a3d37688c / 911 lines / 6680 routes. DEV-only deployment dpl_HBkafW7aK4P3EEo4gyicXabD1zR2 created after success. Canonical public desktop/phone and mixed old-index / actual-provider recovery checks pending.

Real diagnosis: DEV-9.3.5 deployed GTFS version 560a61f2a20156ec (2026-10-09T10:26:15+00:00), while the live dataset API returned 4945dd6a3d37688c (2026-10-10T08:47:25+00:00). The client silently discarded the deployed route index when versions differed, leaving all area reports without public numbers. All 58 Nazareth reports sampled at 2026-10-10T10:05:17.252Z matched deployed exact operator/route keys; those old values are diagnostic evidence, not permission to reuse outdated metadata.

Fix: deployed index is a download hint if its version differs. The current official per-line file must independently validate operator and route; new routes use nearby served lines as bounded download candidates. Missing, contradictory, or failed metadata stays missing. Version checks also refresh open pages once per minute. No GPS clocks, identity, speed units or ETA semantics change.

Search: eight recent place/station/query entries on this device, deduplicated and validated; quick selection, persistence after reload and clear action.

Real convoy check at 2026-10-10T10:10:20.826Z: 58 distinct operator/vehicle identities, no exact coordinate duplicates, 32 reported speeds equal 0 km/h, report ages 85–170 seconds. This does not prove a moving convoy, fleet service status or independent GPS truth. No fabricated movement, route or mechanical fault.

Synthetic tests cover a changed catalog version, current metadata confirmation, a route missing from old hints, operator collision, further update on an open page, versioned caches and provider failure; history validation and persistence. Public desktop/phone route-number and map flow verification required after green CI.

Traffic remains connected=true / available=false / coverage-unavailable (TomTom Israel). No fake traffic or adjusted provider ETA. DEV only; LIVE-WORK unchanged.


First canonical public run 38044706968 passed both jobs 114191785309 and 114191785471. Real Nazareth: 27 desktop line-number markers, 32 phone reports; real Haifa: 3 desktop / 14 phone. Phone history reopened and fit inside its viewport. Mixed old-index fixture/current real GTFS and live source proof resolved 29 reports with 19 current line-file requests; this is explicitly mixed testing, not a wholly real feed change. TomTom coverage blocker remains confirmed. Real stop 23014 had no valid live arrivals; no positive real ETA claim.

A further focused regression found that a public line rename under an unchanged operator/route id could remain unresolved. Nearby candidate lookup now also checks such remaining pairs, skipping already-verified or backed-off line files. Exact current file confirmation remains mandatory; no old hint number is reused. Bounded batches can advance across later polls. Updated GTFS test covers this transition. Final exact-code CI and re-deploy/public check pending.

Final runtime commit c0140605128d78c62ff9c11e3314311d6e9e9ad6 passed CI 38044963013, verify job 114192529316, before deployment dpl_7bQkwP7BZrCnuRqSnZ6CCgnNBxoR. Exact DEV project and canonical alias READY. GTFS remains 4945dd6a3d37688c / 911 public lines / 6680 routes. Browser artifact 11667562378 digest sha256:baf3bdb217513205f86370314614748f0cc167d6b26c49bf8be665c60beeec3e. Final canonical verification queued.

Previous final public run 38045187611 succeeded. Final resilience fix: metadata waiting is capped at 1.2 seconds so slow GTFS cannot hold validated position frames or periodic polls. Late current metadata upgrades route labels; old versions cannot supply numbers. Synthetic tests/metadata_wait.cjs preserves vehicle identity and original observation clocks. New exact-code CI/deployment/public proof required.
