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

Do not read this historical checkpoint as today's continuing availability. Final normalized
endpoint deployment and live test results will be recorded below after verification.
