# Work-only task: real-time transit and real road traffic (Israel)
Branch: work/live-data-20261009.
Do not commit to eifo-batuach-site, main or dev/vehicle-history-map-20261009.
Current public site: https://j-h-h.github.io/abc/
The UI branch already includes SafeBusTraffic.normalize and SafeBusApp.applyTrafficSnapshot, plus SafeBusHistory for cross-trip vehicle anomalies.

## Real-time buses
Find, validate and integrate authoritative SIRI / Israeli MOT, curlbus, Open Bus, BusNearby or licensed alternatives. Verify stable GTFS route_id ↔ SIRI LineRef, stop/direction, trip identity and vehicle_ref. Preserve distinct source timestamp, independent GPS measurement time, predicted arrival, schedule-only departures, and explicit data age/confidence. Never fabricate locations or ETAs.
Deploy a securely restricted backend on a provider with authorized account access; do not build an open arbitrary proxy. Validate stop 2360 and lines 72, 531, 92 and generalize nationally.

## LIVE TRAFFIC: map and ETA weighting
Research live traffic flow and incidents for Israel from TomTom Flow Segment Data, HERE Traffic API or other legitimately accessible data. Check Israel coverage, licensing, usage/quotas, fees and API freshness.
Supply real geolocated road segment geometries for visible color-coded congestion, with timestamp, direction, current speed, free-flow speed and confidence.
A traffic color tile is not numeric speed data and MUST NOT alone be used for ETA correction.
For ETA corrections, map-match the remaining road corridor in the bus's direction up to target stop, avoiding double-counting overlapping road segments. Require fresh readings, measured corridor coverage and a validated direction. Never add a congestion delay on top of live SIRI ETA if provider ETA already accounts for traffic.
Match the UI's traffic snapshot contract using these exact names (replace example numbers with real data only):
{
  "routeId":"34119", "stopCode":"2360",
  "observedAt":"2026-10-09T10:00:00Z", "source":"licensed-traffic-provider",
  "segments":[{"geometry":{"type":"LineString","coordinates":[[35.19,31.74],[35.20,31.75]]},
               "currentSpeedKmh":18,"freeFlowSpeedKmh":48,"confidence":0.85}],
  "matchMethod":"directed-route-corridor","validated":true,
  "coveredMeters":2300,"remainingRouteMeters":2800,"delaySeconds":210,"confidence":0.8
}
Use validated=false until coverage/direction evidence is sufficient. The existing UI's traffic-analysis.js applies safety gates.

## Historical vehicle observations
Provide stable vehicle_ref across separate trips, trip id, source and independently measured timestamps when available, to support cross-trip history and fault-pattern screening in the UI. A long stop or broken GPS does not prove mechanical failure. If server history is feasible, return traceable observations rather than categorical fault claims.

## Delivery
Provide tested reachable live HTTPS service, true timestamped endpoint samples, API contract, automated tests, licensing/usage assessment, exact integration instructions and a PR. Do not change the production site branch yourself; do not edit common frontend files while the UI agent is working. If deployment access is blocked, identify exact missing permission and hand over completed tested code.