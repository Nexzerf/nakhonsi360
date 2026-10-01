# Phase 2 progress — Live conditions

Date: 2026-09-30

## Working with real data

- **ThaiWater water level** (28 stations in the province + 5 km) and **24-h rain** (163 stations): adapters written against real samples, ingested into Postgres, served on the map and in the inspector.
- **Acceptance check "values match the source at the same time": passed.** All 28 water-level and 163 rain stations served by the app equal a direct ThaiWater request for the same observation time.
- **Official status only from the source:** ThaiWater's `situation_level`, its text and its colour, from the scale published in the same response (e.g. "น้ำมาก", level 4). Rain has no official class from this source, so it is shown uncoloured.
- **Provenance:** every value shows the operating agency ("กรมทรัพยากรน้ำ ผ่าน สสน."), station, distance, observation time and freshness. Map attribution credits only the sources actually delivering data.
- **Nearest-station rules:** rain 15 km, weather 30 km, PM2.5 25 km. Water level counts as local only on the same named waterway (within 20 km, with the point within 2 km of that waterway in OSM). Otherwise the nearest reading is shown and labelled as a value from elsewhere. Sources are never merged; disagreement is flagged.
- **Ingest:** runs are logged in `ingest_runs`, values are validated (plausible ranges, sentinels, timestamps not in the future), data is clipped to the province + 5 km, and dedupe is on (source, station, variable, observed time). Network errors are retried with backoff, and one failing source leaves the others working (seen in a live run). Retention is 90 days for observations and 1 year for hotspots. A scheduled GitHub workflow runs every 15 minutes.
- **NASA FIRMS hotspots (2026-09-30):** VIIRS S-NPP, NOAA-20, NOAA-21 and MODIS from the Area API with the project's `FIRMS_MAP_KEY`. Live run ok with 0 hotspots in the province (rainy season); the NRT archive held 208 detections in the bbox for Jul–Aug 2026. Confidence is shown as published (VIIRS l/n/h, MODIS 0–100). Layer `hotspots` (7 days) and a live hazards card (5 km, 7 days, "a hotspot is not a confirmed fire"; "last checked, nothing found" when empty).
- **TMD NWP forecasts (2026-09-30):** hourly (24 h) and daily (7 days) WRF forecasts for all 170 subdistricts with `TMD_NWP_TOKEN`; TMD geocodes equal HDX pcodes. Stored apart from observations; at most every 3 h because of TMD's quota (60 requests/min, 100,000 datapoints/h). New inspector card "พยากรณ์อากาศ", labelled as a model forecast for the subdistrict's reference point.
- **Villages (2026-09-30):** all 1,636 DOPA records kept. The 7 metre-coordinate villages of ต.ห้วยปริก are converted as UTM 47N and accepted only because each lands in that subdistrict (±~700 m, drawn hollow). Villages whose point stays unusable (41 outside the province in the full file) are kept without a location: searchable, listed under their DOPA subdistrict, never drawn. Re-run `import:villages` with the full file to load them.
- **Tests:** 89 unit tests (adapters on real samples), 15 database tests on real data, and 10 browser tests.

## Not done yet, and why

| Item | Reason |
|---|---|
| TMD weather observations, warnings | Needs `TMD_UID` / `TMD_UKEY` (free; a different API from the NWP token). The API answers: 3 TMD stations in the province + 2 in the buffer (once-daily WeatherToday summary) |
| TMD earthquakes | `earthquake.tmd.go.th` blocked by the environment's network policy |
| Air4Thai PM2.5 | `air4thai.pcd.go.th`: https resets the connection; http only redirects to https |
| GISTDA flood / hotspots | Needs `GISTDA_API_KEY` (the gateway now answers 407 "Authentication Required") |
| Water level as "local" | Needs OSM waterways; Geofabrik resets connections from the build environment |

## Phase 2 acceptance

- [x] Stations inside the province appear with real values that match the source at the same time — ThaiWater water level and rain
- [x] Every value shows observed time and freshness; satellite layers never say LIVE (enforced in `classifyFreshness`)
- [x] Turning off one provider leaves the others working — tested (a failing adapter is logged; data from other sources is still served)
- [x] A point with no nearby station shows the empty state with the radius used — e.g. "ไม่มีสถานีตรวจวัดในรัศมี 15 กม."
- [x] FIRMS connected (2026-09-30); TMD NWP forecasts connected (2026-09-30)
- [ ] TMD observations, Air4Thai, GISTDA — blocked (see table)
