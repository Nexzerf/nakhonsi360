# Nakhonsi360

**มองนครศรีฯ รอบด้าน เห็นสิ่งแวดล้อมทุกพื้นที่**
*Every corner of Nakhon Si Thammarat, every environmental signal.*

An interactive environmental map of Nakhon Si Thammarat Province, Thailand. It brings together data from Thai government agencies and open sources so anyone can pick any place and see its environmental situation. Every value shows its source and time.

- Map-first: the first screen is a full-screen map of the province.
- No fake data: a missing value is shown as "ไม่มีข้อมูลสาธารณะสำหรับพื้นที่นี้". The repository contains no demo data.
- Every value carries its source, observation time and freshness.
- Free-first, and no AI features.

## Status

- **Phase 1 (map foundation):** code complete; boundaries and villages verified with real files. See [PHASE1_REPORT.md](PHASE1_REPORT.md).
- **Phase 2 (live conditions):** ThaiWater water level and rain, NASA FIRMS hotspots and TMD NWP forecasts are live. TMD observations, Air4Thai and GISTDA are blocked. See [PHASE2_PROGRESS.md](PHASE2_PROGRESS.md).
- **Phase 3 (environment):** started with ESA WorldCover land cover and mangroves. Thai agency sources are blocked from the build environment. See [PHASE3_PROGRESS.md](PHASE3_PROGRESS.md).

## Docs

- [SETUP.md](SETUP.md) — install, database, loading the real data, API keys, deploy
- [DATA_SOURCES.md](DATA_SOURCES.md) — every source with endpoint, key, licence, update frequency and verification status
- [PHASE1_REPORT.md](PHASE1_REPORT.md) — what works, what failed verification, what is stubbed
- [PHASE2_PROGRESS.md](PHASE2_PROGRESS.md), [PHASE3_PROGRESS.md](PHASE3_PROGRESS.md) — live sources and environment layers

## Quick start

```bash
npm ci
cp .env.example .env.local            # set DATABASE_URL (Postgres + PostGIS)
npm run fetch:sources                 # real files from HDX, GD Catalog, Geofabrik
DATABASE_URL=… npm run import:all
npm run dev
```

## Layout

```
app/            Next.js routes: map page, /about-data, /api/{inspect,search,sources,tiles,layers,proxy}
components/     EnvironmentalMap, LocationSearch, LayerControl, LocationInspector, GeoBreadcrumb,
                MapLegend, DataFreshness, DataProvenance, StatusBar
lib/            registry (sources, layers), db queries, importers, freshness, validation, geo, i18n
scripts/        fetch-sources, migrate, import-{admin,villages,osm,all}, build-pmtiles
supabase/       SQL migrations (PostGIS schema, gazetteer, spatial functions)
tests/          unit (Vitest), sql (real data), e2e (Playwright)
```
