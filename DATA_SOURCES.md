# Data sources

Status: ✅ verified (real sample saved in `data/samples/<id>/`) · 🟡 adapter built, not yet verified against a real response · ⚪ not started

The machine-readable registry is `lib/registry/sources.ts`; this file is the verification log.

**Verification log**

- 2026-09-29: the build environment's network policy denied every source host; nothing verified.
- 2026-09-30: DOPA village file obtained through the project owner (see below).
- 2026-09-30: network access opened for most hosts. Verified with real downloads: HDX COD-AB, ThaiWater water level, ThaiWater 24-h rain, OpenFreeMap. Still blocked from the build environment: `opendata_tst.dopa.go.th` (DOPA file host), `download.geofabrik.de` (connection reset upstream), `air4thai.pcd.go.th` (http not allowlisted; https certificate chain does not verify), `api-gateway.gistda.or.th` (upstream 502). Keyed sources (TMD, FIRMS, GISTDA) need their keys.

## Phase 1 — base geography

| Source id | Organisation | Endpoint | Key | Licence | Update | Verified | Status |
|---|---|---|---|---|---|---|---|
| `hdx.cod-ab-tha` | กรมแผนที่ทหาร via UN OCHA (HDX) | CKAN `package_show?id=cod-ab-tha` → `tha_admin_boundaries.shp.zip` (HDX 2026-01-26) | No | CC BY-IGO (as stated on HDX) | Static (manual re-import) | 2026-09-30 | ✅ imported TH80: 1 province, 23 districts, 170 subdistricts. Schema `admN_name` (en) / `admN_name1` (th, `lang1=th`) / `admN_pcode`. Data date = `valid_on` 2022-01-22. Sample: `data/samples/hdx.cod-ab-tha/package_show.json` |
| `dopa.villages` | กรมการปกครอง | CKAN `gdcatalog.go.th … gdpublish-gis-01` (76 provinces) → JSON `https://opendata_tst.dopa.go.th/downloads/15/จังหวัดนครศรีธรรมราช.json` (data_release_date 2023-09-05, yearly) | No | "Open Data Common" (as stated on GD Catalog) | Static, yearly | 2026-09-30 | ✅ real file supplied by the project owner (the file host has an underscore in its name and is not reachable from the build environment); SHA-256 `e1eb6bf6…` in `data/samples/dopa.villages/excerpt.json`. 1,636 records, **all kept**: 7 have metres in lat/lon (ต.ห้วยปริก อ.ฉวาง; UTM with the axes swapped), converted as UTM 47N/WGS 84 and accepted only because every converted point lies in the subdistrict DOPA names (uncertainty stored as 700 m = the WGS 84 vs Indian 1975 shift, rounded up; original values kept; drawn hollow on the map); 41 lie outside the province + 5 km (24 at a placeholder point in central Bangkok, 13.727068 100.534087; others with digit typos) and are kept **without a location** in `villages_unlocated`: searchable, listed under their DOPA subdistrict, never drawn, no position guessed. The conversion was verified on the real excerpt (`tests/sql/villages-location.test.ts`); re-run `import:villages` with the full file to load the 41. 20 imported villages share an identical point with another village (flagged in the UI). 125 points lie in a different HDX subdistrict polygon than DOPA names; the UI shows DOPA's names. No หมู่ที่ field; codes are shown instead |
| `osm.geofabrik` | OpenStreetMap contributors (Geofabrik extract) | `https://download.geofabrik.de/asia/thailand-latest.osm.pbf` (+ `.md5`, `thailand-updates/state.txt`) | No | ODbL 1.0 | Static (daily extract, re-import manually) | — | 🟡 importer built; Geofabrik resets connections from the build environment. Run `fetch:sources --only osm` elsewhere (or GitHub Actions) |
| `basemap.openfreemap` | OpenFreeMap | `https://tiles.openfreemap.org/styles/positron`, `/styles/dark` | No | unknown — verify (data ODbL) | — | 2026-09-30 | ✅ style loads; terms to confirm. If unreachable, the map falls back to a plain background and says so |
| `basemap.eox-s2cloudless` | EOX IT Services | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/…` | No | unknown — verify (EOX states CC BY 4.0 for 2016) | Imagery 2016–2017, not current | — | 🟡 |
| `basemap.opentopomap` | OpenTopoMap | `https://{a,b,c}.tile.opentopomap.org/{z}/{x}/{y}.png` | No | unknown — verify (CC-BY-SA) | — | — | 🟡 fair-use policy |

## Phase 2 — live conditions

| Source id | Organisation | Endpoint | Key | Update | Verified | Status |
|---|---|---|---|---|---|---|
| `thaiwater.waterlevel` | สสน. (HII), aggregating HII, ชป. (RID), พพภ and others | `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` | No | ~10 min–2 h per station | 2026-09-30 | ✅ adapter `lib/adapters/thaiwater.ts`; ~806 stations nationwide, 28 within province + 5 km. Uses `waterlevel_data` (telemetry); `waterlevel_manual_data` not ingested (no NST records in the sample). Official status = `situation_level` mapped to the `scale` published in the same response (text + colour). `storage_percent` stored as `water_level_bank_pct` (can be negative). Sample: `data/samples/thaiwater.waterlevel/` |
| `thaiwater.rain24h` | สสน. (HII), aggregating ทน. (DWR), ชป., สสน., ปภ., อต., กฟผ. | `…/thaiwater30/public/rain_24h` | No | hourly | 2026-09-30 | ✅ adapter; ~4,400 stations, 163 within province + 5 km; each value credits its operating agency. Sample: `data/samples/thaiwater.rain24h/` |
| `tmd.weather`, `tmd.warnings`, `tmd.earthquake` | กรมอุตุนิยมวิทยา | `https://data.tmd.go.th/api/…` | Yes (free) | — | — | ⚪ host reachable; needs `TMD_UID`/`TMD_UKEY`. Must credit "กรมอุตุนิยมวิทยา" every time shown |
| `air4thai.aqi` | กรมควบคุมมลพิษ | `http://air4thai.pcd.go.th/services/getNewAQI_JSON.php` | No | — | — | ⚪ blocked: http host not allowlisted; https certificate chain does not verify |
| `gistda.flood`, `gistda.hotspots` | GISTDA | `https://api-gateway.gistda.or.th/api/2.0/resources` | Yes | — | — | ⚪ upstream 502 from the build environment (possibly non-Thai IPs blocked); needs `GISTDA_API_KEY` |
| `firms.hotspots` | NASA FIRMS | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/<SENSOR>/<bbox>/<days>` (VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, MODIS_NRT; days 1–5) | Yes (free `FIRMS_MAP_KEY`; 5,000 transactions / 10 min) | several overpasses a day | 2026-09-30 | ✅ adapter `lib/adapters/firms.ts`, 2 days per run. CSV, `acq_time` = HHMM UTC without zero padding. Confidence kept as published (VIIRS l/n/h, MODIS 0–100), never mapped to one scale. Errors arrive as plain text with HTTP 200 and are detected; the key is removed from every error. No hotspots in the last 5 days on 2026-09-30 (rainy season); 208 detections in the province bbox for Jul–Aug 2026. Layer `hotspots` (7 days) and inspector hazards card (5 km, 7 days). Licence: unknown — verify (terms page not reachable from the build environment). Sample: `data/samples/firms.hotspots/` |

**Timezone (ThaiWater).** Timestamps such as `2026-09-30 04:00` carry no timezone. They are read as Thai time (+07:00): a response fetched at 21:17 UTC contained readings stamped 04:00, which would be 7 hours in the future if read as UTC, and later fetches at 12:40 Bangkok showed readings stamped 12:20. This is inferred from the data, not from documentation; confirm with HII. Readings more than 1 h in the future are rejected, so a wrong assumption would show up as rejections rather than wrong values.

**Verification against the source (acceptance check).** On 2026-09-30 every station served by `/api/layers/water-stations` (28) and `/api/layers/rain-24h` (163) had the same value as a direct ThaiWater request for the same observation time.

## Phase 3–4 (not started)

`gistda.soilmoisture`, `dmr.landslide`, `dmr.shoreline`, `dmcr.coast` (no public API found — contact DMCR), `ldd.landuse`, `dwr.wetlands`, `copernicus.sentinel2`. Protected forests / national parks: source not yet identified.
