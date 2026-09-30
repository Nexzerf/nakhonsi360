# Phase 2 progress — Live conditions

Date: 2026-09-30

## Working with real data

- **ThaiWater water level** (28 stations in the province + 5 km) and **24-h rain** (163 stations): adapters written against real samples, ingested into Postgres, served on the map and in the inspector.
- **Acceptance check "values match the source at the same time": passed.** All 28 water-level and 163 rain stations served by the app equal a direct ThaiWater request for the same observation time.
- **Official status only from the source:** ThaiWater's `situation_level`, its text and its colour, from the scale published in the same response (e.g. "น้ำมาก", level 4). Rain has no official class from this source, so it is shown uncoloured.
- **Provenance:** every value shows the operating agency ("กรมทรัพยากรน้ำ ผ่าน สสน."), station, distance, observation time and freshness. Map attribution credits only the sources actually delivering data.
- **Nearest-station rules:** rain 15 km, weather 30 km, PM2.5 25 km. Water level counts as local only on the same named waterway (within 20 km, with the point within 2 km of that waterway in OSM). Otherwise the nearest reading is shown and labelled as a value from elsewhere. Sources are never merged; disagreement is flagged.
- **Ingest:** runs are logged in `ingest_runs`, values are validated (plausible ranges, sentinels, timestamps not in the future), data is clipped to the province + 5 km, and dedupe is on (source, station, variable, observed time). Network errors are retried with backoff, and one failing source leaves the others working (seen in a live run). Retention is 90 days for observations and 1 year for hotspots. A scheduled GitHub workflow runs every 15 minutes.
- **Tests:** 67 unit tests (including the adapters and station rules on the real samples), 5 database tests on real data, and 10 browser tests.

## Not done yet, and why

| Item | Reason |
|---|---|
| TMD weather, warnings, earthquakes | Needs `TMD_UID` / `TMD_UKEY` (free registration) |
| Air4Thai PM2.5 | `air4thai.pcd.go.th` over http is not in the allowlist; its https certificate chain does not verify |
| GISTDA flood / hotspots | Gateway returns 502 from the build environment (possibly non-Thai IPs); needs `GISTDA_API_KEY` |
| NASA FIRMS hotspots | Needs `FIRMS_MAP_KEY` |
| Hazards card | Waits for the first hazard adapter (FIRMS or GISTDA) |
| Water level as "local" | Needs OSM waterways; Geofabrik resets connections from the build environment |
| Villages | DOPA file host `opendata_tst.dopa.go.th` is not in the allowlist |

## Phase 2 acceptance

- [x] Stations inside the province appear with real values that match the source at the same time — ThaiWater water level and rain
- [x] Every value shows observed time and freshness; satellite layers never say LIVE (enforced in `classifyFreshness`)
- [x] Turning off one provider leaves the others working — tested (a failing adapter is logged; data from other sources is still served)
- [x] A point with no nearby station shows the empty state with the radius used — e.g. "ไม่มีสถานีตรวจวัดในรัศมี 15 กม."
- [ ] TMD, Air4Thai, GISTDA and FIRMS connected — blocked (see table)
