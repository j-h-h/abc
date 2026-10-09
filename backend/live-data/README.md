# Isolated live data backend — version 1.0.0

Branch: `work/live-data-20261009`. Contract: `WORK_LIVE_DATA_AND_TRAFFIC.md`.
Shared frontend files and the public-site branch are not modified.

## Runtime

Dependency-free Node >=22, compatible with Vercel Functions and Cloudflare Workers.
Vercel project root is `backend/live-data`; build runs `npm test`.
Cloudflare entrypoint is `cloudflare-worker.mjs`. Do not deploy a paid plan without the owner's consent.

Production relay: https://eifo-batuach-live-relay.vercel.app
- GET /v1/health
- GET /v1/routes?line=72&stopCode=2360&routeId=34120
- GET /v1/stops/2360/arrivals?line=72&routeId=34120
- GET /v1/vehicles/70138502/history?operatorRef=16&days=14&limit=200
- GET /v1/traffic/flow?bbox=35.18,31.73,35.20,31.75&routeId=34120&stopCode=2360
- GET /v1/traffic/incidents?bbox=35.18,31.73,35.20,31.75
- GET /v1/traffic/corridor?line=72&stopCode=2360&routeId=34120&vehicleRef=VEHICLE_REF
- Compatibility: GET /curlbus/2360 and strictly restricted /mot/... paths.

A traffic endpoint returns **503 TRAFFIC_PROVIDER_NOT_AUTHORIZED** until licensed credentials
and a provider-enforced nonbilling entitlement are present. No traffic data is invented.
A scheduled target arrival is null when the source only supplies a stale expected arrival.
An empty list never proves a departure was cancelled or did not happen.

## Precision

Curlbus supplies SIRI forecasts, vehicle references, journey IDs and report-time coordinates.
`sourceObservedAt`, `sourceResponseAt`, and `retrievedAt` are separate.
`gpsMeasuredAt=null` and `clockType=source-report` are deliberate: no independent GPS clock is present.
Freshness requires both response and report clocks within 180 seconds, and rejects future values >30 seconds.
Vehicle positions must lie within 140 metres of the selected real GTFS shape.
Clock/route status is an evidence category, not a calibrated probability of ETA accuracy.

Direction matching uses LineRef, operator, ordered stop sequence and destination.
SIRI DirectionRef is preserved but is not compared to GTFS direction_id as if they shared a namespace.

History uses the external Open Bus archive on demand, with operator-scoped VehicleRef and source IDs.
History selects at most 100 exact vehicle/operator ride IDs before requesting positions.
Ride associations have scheduled-trip-start clocks, separate from source-report observations.
A successful ride list survives a position timeout with partial=true and observationStatus=unavailable.
Recent archive requests can return 502 UPSTREAM_TIMEOUT. No local persistent database or paid store is configured. Coverage, availability and permanence of
provider vehicle references are not guaranteed. History from report clocks must not be passed to
GPS-only anomaly analysis. No mechanical fault classification is made.

## Traffic configuration (disabled by default)

HERE Traffic API v7 is the researched provider with declared Israel coverage.
Use only credentials entered directly into the server secret settings, never in GitHub or the UI.
Activation requires all of:
- `HERE_API_KEY`
- `HERE_TRAFFIC_ENABLED=true`
- `HERE_LICENSE_CONFIRMED=true`
- `HERE_PROVIDER_ENFORCED_NONBILLING=true`

These flags are operator assertions, not a billing-control implementation.
The provider must enforce the nonbilling cap/entitlement. Local rate limits do not guarantee it.
Do not set the nonbilling flag on an ordinary pay-as-you-go account.
`HERE_SHAPE_DIRECTION_VERIFIED=true` additionally requires confirmation against actual licensed
flow responses and the provider's direction convention. Until then road delay validation stays false.

HERE calls have no advancedFeatures, no shared caching, no prefetch or cross-user fan-out.
Confidence <=0.70 is historical/model data, not real-time speed. Speeds in m/s convert to km/h.
Subsegments are split proportional to their physical length in ordered geometry.
Geometries, timestamps, speed ratios and closure status are returned distinctly.
Incidents are separate from flow; a closed road never receives an invented finite delay.

The corridor matcher uses 15m intervals, 15m lateral tolerance, max 35-degree heading difference,
rejects ambiguous parallel roads, and counts each interval once. Coverage and confidence gates
are conservative. It is geometric map matching, not a certified road-topology match; grade-separated
roads, bus lanes and misaligned GTFS shapes require care. Missing independent vehicle GPS time
blocks route-delay validation. Partial road delay is never extrapolated to uncovered distance.

Live provider ETA is **never** increased. Even a schedule is not assumed traffic-free.
Experimental correction requires an explicitly verified free-flow baseline and >=98% road coverage.
Road movement time excludes passenger dwell, signals beyond the provider's speed model and dispatch.

## Security and limits

Fixed upstream hosts and paths only; no arbitrary URL, headers, redirects or arbitrary SQL filters.
GET and OPTIONS only; browser origin restricted to https://j-h-h.github.io.
Streaming byte limits, 12-second upstream deadline, bounded history/viewport and in-memory budgets.
Transit cache: 20 seconds; external archive cache: 60 seconds; route cache: 5 minutes.
Original timestamps survive cache hits; expired failed requests do not return cached data as live.

CORS is not authentication. Warm-instance IP and upstream rate limits are best-effort, not distributed
account-wide controls. Vercel plan usage must be monitored using the account's enforced limits.
No plan upgrade, paid static IP, paid database or paid traffic subscription was configured.

## Verification

`npm test` runs regression tests, including a timestamped real SIRI response replay.
Synthetic geometries occur only in clearly marked algorithm tests, not in API production responses.
`LIVE_BASE_URL=https://eifo-batuach-live-relay.vercel.app npm run check:live` runs real HTTPS tests.
GitHub workflow is restricted to the work branch; it does not deploy or alter GitHub Pages.
Recorded verification: 38 regression tests and 17 real HTTPS checks passed on 2026-10-09.
This includes explicit unavailable/partial history and disabled-traffic responses, not a claim
that every provider is healthy. See `INTEGRATION.md`, `VALIDATION.md`, `SOURCE_ASSESSMENT.md`
and `LIVE_ENDPOINT_SAMPLES.json` for the handoff and actual timestamped results.
