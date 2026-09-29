# Data sources

Status: ✅ verified (real sample saved in `data/samples/<id>/`) · 🟡 adapter built, not yet verified against a real response · ⚪ not started

The machine-readable registry is `lib/registry/sources.ts`; this file is the verification log.

**Verification attempt, 2026-09-29:** the environment used to build Phase 1 has an outbound network policy that denies every source host below (HTTP 403 from the egress proxy for `data.humdata.org`, `gdcatalog.go.th`, `download.geofabrik.de`, `tiles.openfreemap.org`, `api-v3.thaiwater.net`, `air4thai.pcd.go.th`, `gis.dmr.go.th`, `overpass-api.de`). **No source is verified yet** and `data/samples/` is empty. Run `npm run fetch:sources` (see SETUP.md) from a machine with internet access to verify them.

## Phase 1 — base geography

| Source id | Organisation | Endpoint | Key | Licence | Update | Verified | Status |
|---|---|---|---|---|---|---|---|
| `hdx.cod-ab-tha` | กรมแผนที่ทหาร via UN OCHA (HDX) | CKAN `https://data.humdata.org/api/3/action/package_show?id=cod-ab-tha` → GeoPackage / SHP resource | No | unknown — verify on HDX | Static (manual re-import) | — | 🟡 importer built; field names detected from the file (supports `ADMn_TH/ADMn_EN/ADMn_PCODE` and `admn_name/admn_name1/admn_pcode`); Thai-name field checked to contain Thai script |
| `dopa.villages` | กรมการปกครอง | CKAN `https://gdcatalog.go.th/api/3/action/package_show?id=gdpublish-gis-01` → resource for นครศรีธรรมราช | No (verify) | unknown — verify | Static | — | 🟡 importer built; **file schema unknown**, fields detected from candidates or given with `--map`; may be geo-blocked outside Thailand |
| `osm.geofabrik` | OpenStreetMap contributors (Geofabrik extract) | `https://download.geofabrik.de/asia/thailand-latest.osm.pbf` (+ `.md5`, `thailand-updates/state.txt`) | No | ODbL 1.0 | Static (daily extract, re-import manually) | — | 🟡 importer built; small-canal completeness still to be checked after import |
| `basemap.openfreemap` | OpenFreeMap | `https://tiles.openfreemap.org/styles/positron`, `/styles/dark` | No | unknown — verify (data ODbL) | — | — | 🟡 if unreachable, the map falls back to a plain background and says so |
| `basemap.eox-s2cloudless` | EOX IT Services | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/…` | No | unknown — verify (EOX states CC BY 4.0 for 2016) | Imagery 2016–2017, not current | — | 🟡 |
| `basemap.opentopomap` | OpenTopoMap | `https://{a,b,c}.tile.opentopomap.org/{z}/{x}/{y}.png` | No | unknown — verify (CC-BY-SA) | — | — | 🟡 fair-use policy |

## Phase 2 — live conditions (not started)

| Source id | Organisation | Endpoint (to verify) | Key | Status |
|---|---|---|---|---|
| `thaiwater.waterlevel` | สสน. (HII) | `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` | No | ⚪ host blocked from build env |
| `thaiwater.rain24h` | สสน. (HII) | `…/thaiwater30/public/rain_24h` | No | ⚪ |
| `tmd.weather`, `tmd.warnings`, `tmd.earthquake` | กรมอุตุนิยมวิทยา | `https://data.tmd.go.th/api/…` | Yes (free) | ⚪ must credit "กรมอุตุนิยมวิทยา" every time shown |
| `air4thai.aqi` | กรมควบคุมมลพิษ | `http://air4thai.pcd.go.th/services/getNewAQI_JSON.php` | No | ⚪ |
| `gistda.flood` | GISTDA | `https://api-gateway.gistda.or.th/api/2.0/resources` | Yes | ⚪ |
| `gistda.hotspots` | GISTDA | `https://fire.gistda.or.th` | Verify | ⚪ |
| `firms.hotspots` | NASA FIRMS | Area API (CSV by bbox) | Yes (free) | ⚪ |

`expectedUpdateMinutes` values for Phase 2 sources in the registry are placeholders for freshness classification and must be confirmed from each source when its adapter is written.

## Phase 3–4 (not started)

`gistda.soilmoisture`, `dmr.landslide`, `dmr.shoreline`, `dmcr.coast` (no public API found — contact DMCR), `ldd.landuse`, `dwr.wetlands`, `copernicus.sentinel2`. Protected forests / national parks: source not yet identified.
