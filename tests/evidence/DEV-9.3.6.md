# DEV-9.3.6 — numbers after a daily GTFS update; recent searches

Code and CI / public deployment pending.

Real diagnosis: DEV-9.3.5 deployed GTFS version 560a61f2a20156ec (2026-10-09T10:26:15+00:00), while the live dataset API returned 4945dd6a3d37688c (2026-10-10T08:47:25+00:00). The client silently discarded the deployed route index when versions differed, leaving all area reports without public numbers. All 58 Nazareth reports sampled at 2026-10-10T10:05:17.252Z matched deployed exact operator/route keys; those old values are diagnostic evidence, not permission to reuse outdated metadata.

Fix: deployed index is a download hint if its version differs. The current official per-line file must independently validate operator and route; new routes use nearby served lines as bounded download candidates. Missing, contradictory, or failed metadata stays missing. Version checks also refresh open pages once per minute. No GPS clocks, identity, speed units or ETA semantics change.

Search: eight recent place/station/query entries on this device, deduplicated and validated; quick selection, persistence after reload and clear action.

Real convoy check at 2026-10-10T10:10:20.826Z: 58 distinct operator/vehicle identities, no exact coordinate duplicates, 32 reported speeds equal 0 km/h, report ages 85–170 seconds. This does not prove a moving convoy, fleet service status or independent GPS truth. No fabricated movement, route or mechanical fault.

Synthetic tests cover a changed catalog version, current metadata confirmation, a route missing from old hints, operator collision, further update on an open page, versioned caches and provider failure; history validation and persistence. Public desktop/phone route-number and map flow verification required after green CI.

Traffic remains connected=true / available=false / coverage-unavailable (TomTom Israel). No fake traffic or adjusted provider ETA. DEV only; LIVE-WORK unchanged.
