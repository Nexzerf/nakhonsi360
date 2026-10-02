# Data sources

Status: ✅ verified (real sample saved in `data/samples/<id>/`) · 🟡 adapter built, not yet verified against a real response · ⚪ not started

The machine-readable registry is `lib/registry/sources.ts`; this file is the verification log.

**Verification log**

- 2026-09-29: the build environment's network policy denied every source host; nothing verified.
- 2026-09-30: DOPA village file obtained through the project owner (see below).
- 2026-10-01: USGS earthquake catalog (FDSN event service) verified with a real response; adapter connected. `www.usgs.gov` (licence policy page) is denied by the build environment's proxy, so the licence is recorded as stated by USGS policy, to confirm.
- 2026-09-30: network access opened for most hosts. Verified with real downloads: HDX COD-AB, ThaiWater water level, ThaiWater 24-h rain, OpenFreeMap. Still blocked from the build environment: `opendata_tst.dopa.go.th` (DOPA file host), `download.geofabrik.de` (connection reset upstream), `air4thai.pcd.go.th` (http not allowlisted; https certificate chain does not verify), `api-gateway.gistda.or.th` (upstream 502). Keyed sources (TMD, FIRMS, GISTDA) need their keys.

## Phase 1 — base geography

| Source id | Organisation | Endpoint | Key | Licence | Update | Verified | Status |
|---|---|---|---|---|---|---|---|
| `hdx.cod-ab-tha` | กรมแผนที่ทหาร via UN OCHA (HDX) | CKAN `package_show?id=cod-ab-tha` → `tha_admin_boundaries.shp.zip` (HDX 2026-01-26) | No | CC BY-IGO (as stated on HDX) | Static (manual re-import) | 2026-09-30 | ✅ imported TH80: 1 province, 23 districts, 170 subdistricts. Schema `admN_name` (en) / `admN_name1` (th, `lang1=th`) / `admN_pcode`. Data date = `valid_on` 2022-01-22. Sample: `data/samples/hdx.cod-ab-tha/package_show.json` |
| `dopa.villages` | กรมการปกครอง | CKAN `gdcatalog.go.th … gdpublish-gis-01` (76 provinces) → JSON `https://opendata_tst.dopa.go.th/downloads/15/จังหวัดนครศรีธรรมราช.json` (data_release_date 2023-09-05, yearly) | No | "Open Data Common" (as stated on GD Catalog) | Static, yearly | 2026-09-30 | ✅ real file supplied by the project owner (the file host has an underscore in its name and is not reachable from the build environment); SHA-256 `e1eb6bf6…` in `data/samples/dopa.villages/excerpt.json`. 1,636 records → **1,588 imported, 48 rejected**: 7 with projected metres in lat/lon (ต.นาแว … อ.ฉวาง, not converted: datum not stated), 41 outside the province + 5 km (24 at a placeholder point in central Bangkok, 13.727068 100.534087; others with digit typos). 20 imported villages share an identical point with another village (flagged in the UI). 125 points lie in a different HDX subdistrict polygon than DOPA names; the UI shows DOPA's names. No หมู่ที่ field; codes are shown instead |
| `osm.geofabrik` | OpenStreetMap contributors (Geofabrik extract) | `https://download.geofabrik.de/asia/thailand-latest.osm.pbf` (+ `.md5`, `thailand-updates/state.txt`) | No | ODbL 1.0 | Static (daily extract, re-import manually) | — | 🟡 importer built; Geofabrik resets connections from the build environment. Run `fetch:sources --only osm` elsewhere (or GitHub Actions) |
| `basemap.openfreemap` | OpenFreeMap | `https://tiles.openfreemap.org/styles/positron`, `/styles/dark` | No | unknown — verify (data ODbL) | — | 2026-09-30 | ✅ style loads; terms to confirm. If unreachable, the map falls back to a plain background and says so |
| `basemap.eox-s2cloudless` | EOX IT Services | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/…` | No | unknown — verify (EOX states CC BY 4.0 for 2016) | Imagery 2016–2017, not current | — | 🟡 |
| `basemap.opentopomap` | OpenTopoMap | `https://{a,b,c}.tile.opentopomap.org/{z}/{x}/{y}.png` | No | unknown — verify (CC-BY-SA) | — | — | 🟡 fair-use policy |

## Phase 2 — live conditions

| Source id | Organisation | Endpoint | Key | Update | Verified | Status |
|---|---|---|---|---|---|---|
| `thaiwater.waterlevel` | สสน. (HII), aggregating HII, ชป. (RID), พพภ and others | `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` | No | ~10 min–2 h per station | 2026-09-30 | ✅ adapter `lib/adapters/thaiwater.ts`; ~806 stations nationwide, 28 within province + 5 km. Uses `waterlevel_data` (telemetry); `waterlevel_manual_data` not ingested (no NST records in the sample). Official status = `situation_level` mapped to the `scale` published in the same response (text + colour). `storage_percent` stored as `water_level_bank_pct` (can be negative). Sample: `data/samples/thaiwater.waterlevel/` |
| `thaiwater.rain24h` | สสน. (HII), aggregating ทน. (DWR), ชป., สสน., ปภ., อต., กฟผ. | `…/thaiwater30/public/rain_24h` | No | hourly | 2026-09-30 | ✅ adapter; ~4,400 stations, 163 within province + 5 km; each value credits its operating agency. Sample: `data/samples/thaiwater.rain24h/` |
| `usgs.earthquakes` | U.S. Geological Survey (ComCat, with contributing networks) | `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventtype=earthquake&starttime=<now − 30 d>&latitude=8.58&longitude=99.79&maxradiuskm=2000&minmagnitude=4&orderby=time` (centre = province extent centre) | No | Events within minutes; ingested every 15 min | 2026-10-01 | ✅ adapter `lib/adapters/usgs.ts`; 21 events M4.0–6.5 in the sample (Sumatra, Java, Andaman, Myanmar, Vietnam), all `reviewed`. Times are epoch ms UTC (no timezone inference). Stored as returned (regional, **not** clipped to the province). Magnitude, magnitude type, place (English), depth, review status and event URL are USGS's own; no intensity or risk is derived. Each run removes events in the 30-day window that USGS no longer lists (deleted or merged under another id). Smaller local events are usually missing from this catalog; TMD remains the primary source. Licence: U.S. public domain per USGS policy (policy page blocked from the build environment — confirm). Acceptance check on 2026-10-01: all 21 events served by `/api/layers/earthquake` equal a direct USGS request (id, magnitude, place, time, coordinates). Sample: `data/samples/usgs.earthquakes/` |
| `nst.cctv` | Nakhon Si Thammarat City Municipality, NST Smart City CCTV | `https://nstcctv.nakhoncity.org/api/cameras/public` (id, name, group, lat, lng) + `/api/camera-status` (online/offline); live view = the municipality's player at `/cam/<id>_sub/` (HD: `/cam/<id>/`) | No | Status refreshed every 60 s; video is live | 2026-10-02 | ✅ `lib/cctv/schema.ts`, `/api/cctv` (CDN-cached 60 s, so the municipality sees one request per minute, not one per visitor). 222 cameras: traffic 133 (TF), school fronts 41 (SC), water level 30 (WL), safety zone 18 (SZ); 214 online at verification. City municipality area only. Video is never relayed or recorded by this app: the panel embeds the municipality's own player (no frame-blocking headers; CORS `*` on the JSON). No explicit terms of use found on the site: permission from the municipality is recommended before wide promotion. Sample: `data/samples/nst.cctv/` |
| `tmd.weather`, `tmd.warnings`, `tmd.earthquake` | กรมอุตุนิยมวิทยา | `https://data.tmd.go.th/api/…` | Yes (free) | — | — | ⚪ host reachable; needs `TMD_UID`/`TMD_UKEY`. Must credit "กรมอุตุนิยมวิทยา" every time shown |
| `air4thai.aqi` | กรมควบคุมมลพิษ | `http://air4thai.pcd.go.th/services/getNewAQI_JSON.php` | No | — | — | ⚪ blocked: http host not allowlisted; https certificate chain does not verify |
| `gistda.flood`, `gistda.hotspots` | GISTDA | `https://api-gateway.gistda.or.th/api/2.0/resources` | Yes | — | — | ⚪ upstream 502 from the build environment (possibly non-Thai IPs blocked); needs `GISTDA_API_KEY` |
| `firms.hotspots` | NASA FIRMS | Area API (CSV by bbox) | Yes (free) | — | — | ⚪ host reachable; needs `FIRMS_MAP_KEY` |

**Timezone (ThaiWater).** Timestamps such as `2026-09-30 04:00` carry no timezone. They are read as Thai time (+07:00): a response fetched at 21:17 UTC contained readings stamped 04:00, which would be 7 hours in the future if read as UTC, and later fetches at 12:40 Bangkok showed readings stamped 12:20. This is inferred from the data, not from documentation; confirm with HII. Readings more than 1 h in the future are rejected, so a wrong assumption would show up as rejections rather than wrong values.

**Verification against the source (acceptance check).** On 2026-09-30 every station served by `/api/layers/water-stations` (28) and `/api/layers/rain-24h` (163) had the same value as a direct ThaiWater request for the same observation time.

## Not from agencies

| Source id | What | Status |
|---|---|---|
| `community.reports` | Hazard reports from the public, stored in `citizen_reports` | Live. Always labelled unverified until a responder updates the status. Not merged with any agency value. See [REPORTS.md](REPORTS.md) |
| Emergency numbers | `lib/registry/emergency.ts` | Checked 2026-10-01 against the Government Public Relations Department notice "รวมเบอร์โทรศัพท์สำคัญ ช่วยเหลือเหตุอุทกภัยภาคใต้" (prd.go.th) and several publications that list the same numbers. Agency websites and news sites were blocked from the build environment, so the pages themselves were not opened and no number is marked confirmed with the agency. Hospital and district-office numbers were left out because no consistent published number was found |

## Phase 3–4 (not started)

`gistda.soilmoisture`, `dmr.landslide`, `dmr.shoreline`, `dmcr.coast` (no public API found — contact DMCR), `ldd.landuse`, `dwr.wetlands`, `copernicus.sentinel2`. Protected forests / national parks: source not yet identified.
