# Source, access and usage assessment — 2026-10-09

This is an engineering assessment of documented access and actual responses, not a guarantee of
legal rights, uptime or zero future hosting charges. No paid account, traffic subscription, plan
upgrade, paid static IP, paid store or paid database was activated. No provider secret is in this
repository. Browser and upstream blocking were handled with a fixed-host managed HTTPS relay.

## Transit

| Source | Actual result | Use in release |
| --- | --- | --- |
| curlbus JSON API | HTTP 200, real SIRI forecasts and source-report coordinates for stop 2360; both fresh and old report rows | Primary live-report source, explicit age and route gates, 20s cache |
| MOT stop metadata | HTTP 200, official coordinates/name for 2360 | Strict legacy metadata relay |
| MOT stop times | HTTP 503 when day omitted; HTTP 200 with day=2026-10-09T12:00:00, 172 scheduled rows and zero non-null realTimeDepartureTime | Strict legacy path available with day; never call these rows verified live forecasts |
| Open Bus Stride | Schema/query access HTTP 200; current route window empty; recent vehicle history timed out; older ride associations returned | Best-effort history, not confirmed independent live GPS |
| BusNearby | HTTP 403 | Not connected; no circumvention |
| Direct MOT SIRI | Published access process requires applicant registration/static IP; no approved credentials/static egress present | Not activated; no fake credentials, paid static-IP product or registration on owner's behalf |

Curlbus explicitly documents its JSON endpoint with Accept: application/json:
https://github.com/elad661/curlbus/blob/main/README.md

Its SIRI parser preserves RecordedAtTime as a report timestamp; it does not establish a
separate GPS measurement clock. This backend independently consumes the documented API.
It does not copy or deploy curlbus's server code or its random mock server.
Public access is best-effort, with no SLA or account-wide throughput agreement established.
For larger deployments obtain an explicit service agreement or approved direct SIRI access.

The official SIRI access form, including static IP and applicant signature:
https://www.gov.il/BlobFolder/generalpage/real_time_information_siri/he/real_time_information_receipt_form.pdf
Official developer information:
https://www.gov.il/he/Departments/Topics/developer_information
A read of the current government page was HTTP 403 in the browsing environment; the indexed
official form and curlbus's own documentation corroborate the access prerequisites.
No registration form was signed or person-directed email sent.

Open Bus schema and implementation:
https://open-bus-stride-api.hasadna.org.il/docs
https://github.com/hasadna/open-bus-stride-api/blob/main/open_bus_stride_api/routers/siri_rides.py
https://github.com/hasadna/open-bus-stride-api/blob/main/open_bus_stride_api/routers/siri_vehicle_locations.py
https://github.com/hasadna/open-bus-stride-api/blob/main/USAGE_GUIDE.md

The locations archive returned a 2038 timestamp inside a March 2026 snapshot on an unbounded
descending query. Both time bounds and independent output checks are mandatory. A retrieved
time cannot make an old or future source timestamp valid. Vehicle association records supply
scheduled trip starts, not measured positions or proof a trip completed. Recent queries can
time out even with exact vehicle/operator/window filters; the relay bounds their execution and
retains a successful ride association if a subsequent position query fails.

The national route catalog is the existing application's daily MOT GTFS build, not synthetic
straight-line geography or per-stop hardcoding:
https://j-h-h.github.io/abc/data/version.json
https://j-h-h.github.io/abc/data/catalog.json

## Numeric traffic flow

### HERE Traffic API v7: implemented, disabled

HERE's official coverage material declares Israel flow/incident coverage:
https://www.here.com/developer/blog/june-2025-platform-release-notes
https://docs.here.com/traffic-api/docs/traffic-vector-tile-traffic

The API supplies location geometries, speed, freeFlow, confidence, jam factor, traversability
and sourceUpdated. Speed units are metres/second. Confidence above 0.70 is real-time probe
data; 0.70 or below must not be promoted to actual live speed. The normalizer preserves these
distinctions and treats a closure separately from a finite time estimate.
https://docs.here.com/traffic-api/docs/flow
https://docs.here.com/traffic-api/docs/send-request-readme

The actual Gilo request without credentials returned HTTP 401 Unauthorized / No credentials
found. No licensed flow response or road direction convention was verified on this account.
No production congestion correction is claimed.

HERE's Limited Plan was retired on 2025-08-31. The currently documented Base Plan has free
thresholds followed by pay-as-you-go charges; “free quota” alone does not meet the owner's
no-paid-service instruction:
https://knowledge.here.com/csm_kb?id=public_kb_csm_details&number=KB0028268

Platform terms place restrictions on caching/prefetching, use and raw-result redistribution.
The adapter uses per-request bounded areas, no advancedFeatures, no shared HERE cache/fan-out
and no prefetch. The owner's exact entitlement and intended display licence must be confirmed
before activation; this is not a claim that a generic key grants every intended use:
https://legal.here.com/us-en/terms/here-platform-terms

Activation requires the server-side flags documented in README.md and an actual provider-enforced
nonbilling entitlement. Setting flags is not a technical cost cap. A normal pay-as-you-go key must
not be activated under the current authorization. If only a billable plan is offered, the missing
authorization is the owner's explicit cost approval in addition to the provider licence/credentials.

### TomTom: product coverage not verified for the required endpoint

The currently inspected Traffic API market table did not list Israel. Other TomTom products,
including Route Monitoring, and older traffic announcements mention Israel. Those claims do
not establish usable Israel Flow Segment Data responses on a current key.
No TomTom key or paid product was activated and no production adapter claims coverage.
https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/product-information/market-coverage
https://docs.tomtom.com/route-monitoring/documentation/product-information/market-coverage

### Tel Aviv municipal Waze layer: actual numeric records, incomplete evidence

The official open-data catalog advertises online Waze congestion and incidents:
https://opendatasource.tel-aviv.gov.il/he/Pages/category.aspx
The public numeric/geometry endpoint is:
https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/892

A bounded real query returned HTTP 200 and real geometries in EPSG:4326, speedKMH, length,
delay, level, pubMillis, updateDate and endNode. The captured data are in
tests/fixtures/tlv-traffic-20261009.json. Example: Chelnov, 6.93 km/h, 490 metres,
reported jam delay 189 seconds. This is numeric data, not a raster-color extraction.

However, retrievedAt was 11:05:04Z while updateDate decoded to 14:03:04Z, nearly three hours
in the future. pubMillis is a publication clock, not confirmed speed-measurement time, and one
closure publication was two weeks old. A timezone conversion issue is a possible inference;
subtracting three hours without verified publisher semantics would invent freshness.
The layer does not expose an independently verified freeFlow speed, measurement confidence
or validated travel-direction convention. It is Tel Aviv area coverage, not Gilo/all Israel.
It is therefore research evidence, not an active substitute for a complete fresh national flow feed.

Official Waze documentation defines reported jam delay relative to free flow and pubMillis as
publication time. We do not reconstruct/claim a verified freeFlow measurement from these records
or use reported congestion level/color as input to a bus arrival calculation:
https://support.google.com/waze/partners/answer/13458165?hl=en

The municipal public open-data terms permit use subject to their terms and disclaim availability.
They do not automatically grant access to a nationwide Waze partner feed or other third-party
services:
https://opendatasource.tel-aviv.gov.il/he/Pages/faq.aspx
No private Waze live-map API was scraped and no partner agreement was signed.

### Other official open data

MOT's 2022 speed survey and occasional/periodic vehicle counts are historical, not a substitute
for actual current congestion. The discovered speed-monitor ArcGIS app metadata was last
modified in 2022; no current numeric flow or applicable licence was established.
https://data.gov.il/he/datasets/ministry_of_transport/speed_survey_2022
https://data.gov.il/he/datasets/ministry_of_transport/vehicle_counts
https://data.gov.il/he/datasets/ministry_of_transport/ayalontrafficcounts

## Hosting / operations

Managed Vercel project: eifo-batuach-live-relay. No user's computer, downloads, database import,
cron maintenance or local service is required to call the deployed API.
The connected account's team/plan-reading operation was forbidden, so its pricing plan and
account-level enforced usage cap could not be independently certified. Do not interpret an
existing account deployment as a zero-cost hosting guarantee. No upgrade was requested.

The in-memory rate/budget controls are bounded warm-instance protections, not a distributed
hard spending cap. No traffic provider is active, hence no paid traffic transactions are initiated.
For a wider audience verify the hosting account's enforced limits and provider agreements.
