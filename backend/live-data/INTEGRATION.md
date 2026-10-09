# Integration handoff — live data version 1.0.0

Work branch: `work/live-data-20261009`. Backend root: `backend/live-data`.
Production base URL: https://eifo-batuach-live-relay.vercel.app

No shared frontend file or public branch was edited. The UI owner should integrate these
changes in their own branch and review the behavior below before publishing.

## 1. Select the actual route, not only the display line number

`GET /v1/routes?line=72&stopCode=2360` returns alternatives with routeId,
operatorRef, gtfsDirectionId, routeDesc, ordered stops, catalogVersion and real
GTFS shape coordinates in [longitude, latitude] order. Choose the same routeId used
by the map, then pass it on every arrival/corridor request.

For stop 2360: 72/34120, 531/33244 and 92/33252 are operator 16.
The SIRI direction values are 2, 3 and 3; GTFS values are 1, 0 and 0 respectively.
These namespaces differ. The current UI's strict comparison in getCurlbus must be
removed; use exact routeId + operator + requested stop + destination as verified by
this backend. Do not relax matching to line name alone.

## 2. Fetch normalized arrivals and source-report vehicle positions

```js
const LIVE_BASE = 'https://eifo-batuach-live-relay.vercel.app';
const q = new URLSearchParams({line: state.line, routeId: state.route.properties.routeId});
const res = await fetch(LIVE_BASE + '/v1/stops/' +
  encodeURIComponent(state.stop) + '/arrivals?' + q,
  {headers: {Accept: 'application/json'}, cache: 'no-store'});
const data = await res.json();
if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
// Consume data.arrivals and data.vehicles using the mappings below.
```

Preserve request revision checks already in app.js, so an old response cannot replace a newly
selected route. Poll approximately every 45–60 seconds while visible. On 429 honor Retry-After;
on upstream failure show unavailable and do not retain an expired forecast as live.

| Backend field | UI meaning |
| --- | --- |
| arrivals[].reportedArrivalAt | Verified fresh SIRI expected arrival; countdown derived from this absolute time |
| arrivals[].realtime | Only true after both report and response clocks pass checks |
| arrivals[].sourceObservedAt | SIRI source report time |
| sourceResponseAt | Source response clock, not a new GPS measurement |
| retrievedAt | Relay fetch time; cache hits preserve this and all source times |
| sourceAgeSeconds | Report age at normalization; client must also age the absolute clocks while open |
| unverified[] | Old/invalid report; no live countdown; unverifiedArrivalAt must not be promoted to a schedule |
| vehicles[].vehicleRef / vehicleKey | Provider vehicle reference / operator-scoped stable grouping key |
| vehicles[].tripId | SIRI journey reference, separate from vehicle identity |
| vehicles[].lat / lon | Reported coordinate after route geometry matching |
| gpsMeasuredAt=null, clockType=source-report | Independent GPS measurement time is unavailable |
| computedArrivalAt=null, appliedTrafficDelaySeconds=0 | No invented ETA and no extra congestion added to a live forecast |

Current normalized source positions may be displayed as **positions from a fresh source report**
with report time and the GPS-clock limitation. Do not label them independently measured live GPS.
Do not assign `observed_at=sourceObservedAt` and then `clockType='gps-measurement'`.
In particular, do not pass these observations to the current SafeBusHistory.ingest GPS-only
stationary/motion anomaly analysis. That analyzer's clock guard is intentional.

Both `arrivals=[]` and `vehicles=[]` are legitimate. They do not prove cancellation,
departure, failure of a vehicle or a mechanical fault.

## 3. Vehicle history across different routes

`GET /v1/vehicles/70138502/history?operatorRef=16&days=14&limit=200`

Group by vehicleKey, not line or trip. Preserve observationId, snapshotId, rideId, tripId,
routeId and sourceObservedAt. The query intentionally has no route filter, so the same
reference can return different lines/journeys if the external archive contains them.
Do not treat VehicleRef as a confirmed licence plate or permanent VIN.

History is fetched from Open Bus on demand; availability and retention are external.
For older dates pass explicit ISO timestamps with timezones as `from` and `to`
(maximum 14-day window, up to 366 days back). For pagination keep returned from/to fixed
and use nextOffset; stop when null, capped at offset 2000. The response exposes truncation
and rejected observations. Empty results are absence of usable records, not absence of journeys.
History first selects up to 100 exact vehicle/operator ride associations (including starts up to
24 hours before the observation window). rides[].scheduledStartAt is a planned-trip clock;
rides[].sourceObservedAt and gpsMeasuredAt are null. These are traceable source associations,
not proof of completed movement. Check rideSelectionTruncated, observationStatus, partial and
observationError. A 200 response can contain valid associations while its position request failed;
a 502 UPSTREAM_TIMEOUT means the upstream ride query itself failed, not an empty history.
No local or paid database was enabled. Stable identity enables later history collection,
but this release does not promise a complete lifetime archive.

## 4. Traffic overlay and directional delay

The licensed traffic provider is currently disabled: flow/incidents return HTTP 503 with
`TRAFFIC_PROVIDER_NOT_AUTHORIZED`. Display “אין מקור עומסים מורשה פעיל”; clear stale vector
layers. An empty or failed response must never turn a road green.

After actual provider entitlement, licence and direction validation:
- `/v1/traffic/flow?bbox=west,south,east,north&routeId=...&stopCode=...` supplies viewport
  road speeds, free-flow speeds, geometry, direction evidence, confidence and observation times.
  It always has validated=false and matchMethod=viewport-only: it is not a route delay.
- `/v1/traffic/incidents?bbox=...` provides separate road events.
- `/v1/traffic/corridor?line=...&stopCode=...&routeId=...&vehicleRef=...` chooses the server's
  fresh route-matched vehicle and clips the remaining real GTFS shape to the requested stop.
  Do not supply caller-invented positions or ask for the whole route from its origin.

The corridor response conforms to WORK_LIVE_DATA_AND_TRAFFIC.md:
routeId, stopCode, observedAt, source, segments, matchMethod=directed-route-corridor,
validated, coveredMeters, remainingRouteMeters, delaySeconds and numeric confidence.
Coverage, reason, blockedRoute and etaDecision give the limitations.

Current transit sources do not supply an independent GPS clock, so a production corridor
calculation remains unvalidated with INDEPENDENT_FRESH_GPS_REQUIRED even after traffic
credentials become available. A fresh independently timed GPS source must be integrated
before enabling this calculation. The geometry algorithm is regression-tested; an actual
licensed, end-to-end congestion correction has not been verified.

The existing `SafeBusApp.applyTrafficSnapshot(snapshot)` can draw normalized segment geometries,
but the UI owner must additionally filter to segment.live, fresh observedAt and applicable
licence terms. Clear expired layers after 180 seconds. Provider confidence <=0.70 is historical
or speed-limit data and must not be colored as current congestion. Colors derive from
numeric speed/free-flow ratio: green >=0.75, yellow >=0.50, orange >=0.25, red <0.25.
Color is output, never an input to the delay formula.

**Do not use the current UI's generic weightedEta schedule correction with this backend.**
Live ETA must keep the provider's original time. A timetable is not a proven traffic-free
baseline either. Apply only etaDecision.computedArrivalAt when non-null; otherwise keep
reportedArrivalAt distinct from covered-road delay. Partial coverage must not be extrapolated
to the entire remaining journey; closures have no finite manufactured ETA.

The corridor endpoint currently caps the bounding box at 0.1 degrees per axis. Longer remaining
routes return a bounded-input error; partitioned licensed requests/topological matching are future
work, not a nationwide delay-computation claim. Nationwide transit routes/arrivals are supported.

## 5. Compatibility and deployment ownership

Setting the current UI relay field to the production base supports `/curlbus/:stopCode`
and restricted `/mot/...` paths. This alone does not fix its SIRI/GTFS direction comparison
or timestamp handling. Prefer the normalized endpoints above.

There is intentionally no generic /proxy, /stride passthrough or /busnearby passthrough.
Move archive access to the normalized history API. The provider's public archive is not a
confirmed live GPS feed. Keys must stay in server secret settings; never add a traffic key
to the browser UI or repository.

CORS allows https://j-h-h.github.io. A different preview origin requires an explicit allowlist
change owned by the backend maintainer, not an open wildcard. No-origin read-only API calls
are supported; CORS is not an authentication or billing limit.

Vercel's independent project is eifo-batuach-live-relay, root backend/live-data; no GitHub Pages
deployment was changed. Build requires all regression tests. This delivery was deployed directly
through the connected project, without configuring a paid upgrade or an automatic main-branch
production deployment. Future backend code changes require an intentional deploy of this root.
Cloudflare Worker files are an optional portability adapter, not a second active deployment.

See README.md for provider activation gates and VALIDATION.md for real test evidence.
