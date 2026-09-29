# Phase 1 report — Map foundation

Date: 2026-09-29

## Summary

The Phase 1 code is complete and tested. **The real data has not been loaded yet**: the build environment's network policy blocked every source host, so no source could be downloaded or verified. The app contains no demo or sample data. Until the import runs, it says honestly that data is not available ("ไม่มีข้อมูลสาธารณะสำหรับพื้นที่นี้" + "ยังไม่ได้ตั้งค่าฐานข้อมูล" / "ยังไม่ได้นำเข้าข้อมูลจากแหล่งนี้").

To finish Phase 1: run `npm run fetch:sources` then `npm run import:all` from a machine with internet access (or the GitHub Actions workflow), commit `data/samples/`, then tick the acceptance checklist below against the real data.

## What was built

- **Next.js 15 + TypeScript (strict)**, Tailwind v4 tokens (light + deep-navy dark), IBM Plex Sans Thai with a system Thai-font fallback.
- **Full-screen MapLibre map** with no landing page. Basemaps: Light/Dark (OpenFreeMap), Satellite (EOX Sentinel-2 cloudless 2016), Terrain (OpenTopoMap). If a basemap cannot load, the overlays stay on a plain background and the layer panel says so.
- **Initial view = province extent derived from the imported TH80 polygon** (`province_extent`, with a 5 km buffer). Nothing is hard-coded: without an import the map shows Thailand and explains why.
- **Layers** from a registry (`lib/registry/layers.ts`): province, district, subdistrict (zoom ≥ 10), villages as points (zoom ≥ 12, with labels), rivers, streams, canals, reservoirs, water bodies, roads (main ≥ 10, minor ≥ 14), coastline. Later-phase layers are listed but disabled, marked "ระยะที่ N". Each row has an icon, a legend swatch, a status dot and an ⓘ button. There is a gentle warning above 6 visible overlays.
- **Vector tiles** from PostGIS (`/api/tiles/:layer/:z/:x/:y`, `ST_AsMVT`), or PMTiles when `NEXT_PUBLIC_PMTILES_BASE_URL` is set (`npm run build:pmtiles`).
- **Location inspector** (`/api/inspect`): each card is loaded, timed out (4 s) and retried on its own. It shows admin containment, the nearest DOPA villages with geodesic distance, and the nearest river / canal / stream / drain / reservoir / water body / main road / road / coastline within 30 km. Current conditions, hazards and satellite are shown as categories with the empty-state message ("ระยะที่ 2/4"). There is a sources list, coordinates with a copy button, a clickable GeoBreadcrumb, and highlighting of the selected subdistrict or village.
- **Search** (`/api/search`): a gazetteer built from admin areas, DOPA villages and named OSM features. It does partial Thai matching ("ท่าศ" → ท่าศาลา) and strips prefixes (อำเภอ/อ., ตำบล/ต., บ้าน, คลอง, แม่น้ำ…). An exact typed name ranks first. Results are grouped by type with an admin path and limited to the province + 5 km. Coordinates are accepted as `lat,lng`, `lng,lat` (detected by range) and DMS.
- **Data provenance everywhere**: the source registry (`lib/registry/sources.ts`), `/api/sources` health (import counts from `dataset_imports`), the ⓘ dialog (organisation, dataset, licence, attribution, data date, import time, source file, *source-file count vs imported vs rejected*, verification status, link), a StatusBar, the "About the data" page, and map attribution per active layer.
- **Freshness**: `classifyFreshness` (satellite capped at RECENT) and quality badges. Dates are in the Buddhist Era in the Thai UI and in Thai relative time. A missing source date is labelled as such and never replaced by the import time.
- **Importers** (`scripts/`): `fetch-sources` (CKAN APIs, MD5 check for OSM, raw samples + manifest), `import-admin`, `import-villages`, `import-osm`, `import-all`, `migrate`, and `build-pmtiles`. Every rejected record is counted with a reason and nothing is moved or invented. Swapped lat/lng is detected and rejected, not fixed silently.
- **Mobile**: a bottom-sheet inspector with 3 snap points (peek 120 px / half / full; drag or tap the handle) and a bottom-sheet layer panel. Touch targets are ≥ 44 px, which is tested.
- **Accessibility**: Thai `lang`, skip link, ARIA labels on icon buttons, visible focus rings, arrow keys pan the map, Enter inspects the map centre, `prefers-reduced-motion`, and the inspector is plain HTML.
- **i18n**: `lib/i18n/th.json` (default) and `en.json` with a key-parity test. Official Thai names are never translated; English comes only from the source's own English field.
- **Error isolation**: a map error boundary, a failing tile source marks only its layer ("ไม่สามารถโหลดข้อมูลได้ชั่วคราว" + last success), and per-card timeouts.

## Tests

| Suite | Result |
|---|---|
| Unit (`npm test`): coordinates, freshness/format, validation, importer parsing, registry/i18n | 51 passed |
| E2E (`npm run test:e2e`, desktop + 375 px, no database): full-screen map, inspector empty states, keyboard Enter, ⓘ dialog, 44 px targets, no `NaN/undefined/null` text | 10 passed |
| Database (`npm run test:sql`) against the **real** COD-AB / DOPA / OSM files | Written; **not yet run** — needs the real files |
| `lint`, `typecheck`, `next build` | clean |

The migrations and spatial SQL were also exercised end to end against a local PostGIS 3.4 (C.UTF-8 locale, as on Supabase). That run found and fixed two ranking bugs in search (NULL ordering; exact raw-name match) and GDAL's `name:en` → `name_en` field laundering. The synthetic fixtures used for that run have been **deleted** at the product owner's request, so no demo data remains in the repository.

## Failed verification

Every source. The egress proxy returned HTTP 403 for `data.humdata.org`, `gdcatalog.go.th`, `download.geofabrik.de`, `tiles.openfreemap.org`, `api-v3.thaiwater.net`, `air4thai.pcd.go.th`, `gis.dmr.go.th` and `overpass-api.de`. All registry entries remain `verified: false`, and licences not confirmed from the publisher are marked "unknown — verify".

## Stubbed and why

- `/api/proxy/:provider/*`: has an allow-list with no providers, because Phase 1 needs no keys.
- `/api/layers/:id`: live GeoJSON layers start in Phase 2; later-phase layers return `not_connected`.
- Conditions / hazards / satellite cards: shown with the empty state until their sources are connected (Phase 2–4).

## Known risks to check with real data

- **DOPA file schema** is unknown. The importer detects the fields or accepts `--map` overrides, and fails loudly otherwise. The server may block non-Thai IPs.
- **COD-AB field names** changed between releases. Both known schemas are supported, and the Thai-name field is validated to contain Thai script.
- **Thai label rendering in MapLibre** (village/river labels): MapLibre does not do complex-script shaping, so tone marks may be slightly misplaced on map labels. All text outside the map canvas is normal HTML and renders correctly.
- **Small-canal completeness in OSM** varies. The inspector says so next to canal and stream distances.

## Phase 1 acceptance checklist (to complete after the real import)

- [ ] Map opens centred on the province; boundaries match the official polygon — *code ready (extent from TH80); needs the HDX import*
- [ ] Searching "ท่าศาลา" returns the district, subdistrict and matching villages — *covered by `test:sql` on real data*
- [ ] Clicking any point returns the correct subdistrict and district, and the nearest village with distance — *covered by `test:sql` on real data*
- [ ] Every village shown comes from the DOPA dataset; the registry count matches the source file — *ⓘ shows source/imported/rejected counts; `test:sql` checks imported + rejected = source count*
- [x] Works on a 375 px wide screen with touch — *E2E at 375 px*
- [x] Every layer has an ⓘ panel with real source metadata — *registry metadata; licences not yet confirmed are marked "unknown — verify"*
