# Validation checkpoint

Initial real upstream checks: 2026-10-09 10:36:54–10:38:09 UTC (13:36–13:38 Jerusalem).
Evidence: https://github.com/j-h-h/abc/actions/runs/37918669786
and https://github.com/j-h-h/abc/actions/runs/37918792433

- curlbus /2360: HTTP 200 JSON, including fresh SIRI 72 route 34120, vehicle 31625601,
  trip 584954644_091026, report 10:36:30Z, ETA 10:37:00Z;
  and 531 route 33244, vehicle 70138502, trip 584864940_091026,
  report 10:36:28Z, ETA 10:39:00Z.
- 92 route 33252 included only old reports (e.g. 04:26:17Z), no position:
  not verified live. Future ETA itself does not prove freshness.
- MOT stop lookup: HTTP 200, confirms stop 2360 = יפה רום/צביה ויצחק,
  latitude 31.733251, longitude 35.187968.
- MOT RefreshStopTimesAtStop without day: HTTP 503; endpoint is not treated as a reliable fallback.
- BusNearby: HTTP 403; no bypass/circumvention attempted.
- Open Bus schema and locations: HTTP 200. An unbounded descending query returned
  recorded_at_time 2038-01-14 from a March 2026 snapshot. Application queries use both
  time bounds and validate each returned row independently.
- Open Bus route 34120 within the contemporaneous ten-minute window: HTTP 200, [].
  This cannot serve as confirmed live GPS for that route.
- HERE actual unauthenticated flow request for Gilo: HTTP 401,
  {"error":"Unauthorized","error_description":"No credentials found"}.
- The separately deployed Vercel /api/probe?source=curlbus performed a real server-side
  request and returned HTTP 200 JSON with original SIRI timestamps.

GTFS mapping from real application catalog:
| line | route_id / LineRef | operator | GTFS direction_id | SIRI DirectionRef | destination |
| --- | --- | --- | --- | --- | --- |
| 72 | 34120 | 16 | 1 | 2 | 2599 |
| 531 | 33244 | 16 | 0 | 3 | 2535 |
| 92 | 33252 | 16 | 0 | 3 | 2535 |

## Final normalized production verification

Deployment READY: dpl_FBKCc8GmUpo3J7WBSWeCcs7at5iv, code commit
93682fdf172aa248bbb47e5a17fb7d969ca83d0f. Production alias:
https://eifo-batuach-live-relay.vercel.app
Immutable deployment:
https://eifo-batuach-live-relay-8dulllsj1-s-0522.vercel.app

Real HTTPS checks ran 2026-10-09 11:08:47–11:09:15 UTC (14:08–14:09 Jerusalem):
https://github.com/j-h-h/abc/actions/runs/37921919652
38 regression tests passed, 0 failed. 17 real HTTPS assertions passed, including the documented
failure/partial-response behavior; this is not a claim that all upstreams were available.
Full normalized timestamped samples: LIVE_ENDPOINT_SAMPLES.json.

| Real deployed request | Result |
| --- | --- |
| /v1/health | 200, version 1.0.0, traffic disabled, independent GPS clock unavailable |
| /v1/routes for 72/34120, 531/33244, 92/33252 at 2360 | 200, real national catalog geometries and exact operator/destination |
| /v1/stops/2360/arrivals for 72 | 200, zero verified live rows at 11:08:48Z; newest report 11:05:00Z was over 180s old and rejected |
| /v1/stops/2360/arrivals for 531 | 200, vehicle 70153902, trip 584864943_091026, report 11:07:00Z, reported ETA 11:15:00Z; one route-matched source position |
| /v1/stops/2360/arrivals for 92 | 200, old rows explicitly unverified; zero fabricated live departures |
| /v1/routes line 5, stop 37487, route 2261, operator 5 | 200, 490 actual shape points, stop משרד הרישוי/הלוחמים 32.034209 / 34.770086, proving the pipeline is not hardcoded to Gilo |
| /curlbus/2360 compatibility | 200 JSON with original report times |
| wrong browser origin / POST | 403 / 405 |
| arbitrary /proxy URL / unknown URL parameter | 404 / 400, no arbitrary upstream access |
| nationwide oversized traffic bbox | 400, bounded input enforced |
| licensed flow request for Gilo | 503 TRAFFIC_PROVIDER_NOT_AUTHORIZED, not empty green roads |
| recent vehicle 70138502 / operator 16 / 14 days | 502 UPSTREAM_TIMEOUT after about 12s; absence of data is not asserted |
| historical vehicle 89094003 / operator 15 / March 18–21 | 200 partial: 22 ride association records across 10 route IDs, position query UPSTREAM_TIMEOUT, zero invented coordinates |

The historical ride selection includes starts one day before the position window. The ten IDs
are 23398, 23397, 5224, 5189, 7700, 22825, 5193, 16352, 16353 and 23992. These are source
route IDs, not a claim that all ten are distinct public line numbers. Scheduled start clocks
are not measured GPS clocks or proof of completed journeys.

The last live 531 source position was about 30m from some part of its GTFS shape; the circular
route means this alone does not prove which traversal/lap it belongs to. It must not become
an independently timed GPS measurement or bypass the remaining-corridor ambiguity/clock guards.

The initial deployment's named rewrite captures leaked into query validation. This was caught
by real HTTPS tests, corrected in the Vercel adapter, and covered by a regression test. A
platform-owned 404 appropriately lacks API CORS headers; the test distinguishes this from
routed API responses. All final normalized requests above use the repaired deployment.

## Additional direct source checks

Evidence: https://github.com/j-h-h/abc/actions/runs/37921508634
This research workflow's overall status was failure because the then-strict recent-history
availability assertion failed; its separate read-only research step succeeded. Do not call it
an all-provider availability pass.

MOT stop times with day=2026-10-09T12:00:00 returned 200, 172 timetable rows,
zero non-null realTimeDepartureTime. This corrects the initial omitted-day 503 observation;
a valid timetable is available but it is not a live forecast.

The Tel Aviv public Waze layer returned actual numerical speeds and geographic road paths.
At 11:05:04Z it supplied updateDate=14:03:04Z, nearly three hours in the future.
Publication times differed and are not independent speed measurement times. The numeric
records are preserved in a research fixture and are not presented as verified current traffic.
See SOURCE_ASSESSMENT.md for access/coverage/licence references.

No end-to-end live numeric traffic delay was verified: licensed HERE access is absent, road
direction still needs actual licensed validation, and connected transit sources lack an independent
GPS clock. Geometry/overlap/coverage/closure calculations were tested offline only, with synthetic
algorithm fixtures explicitly separated from all production data. No live SIRI ETA is increased.

Public eifo-batuach-site and main branch heads remained c99000ef2764f744196df3f91bb0331b139913c9
and fbae0be8bb035f07a9ebf78c26521413ebe9912f during the final branch audit.
Only backend, its validation workflow and the pre-existing work contract appear in the PR diff;
no shared frontend file was modified by this work. Do not read any captured observation as a
promise that the same vehicle, forecast or provider will remain available after the check.
