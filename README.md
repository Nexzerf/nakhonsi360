# Nakhonsi360

**มองนครศรีฯ รอบด้าน เห็นสิ่งแวดล้อมทุกพื้นที่**
*Every corner of Nakhon Si Thammarat, every environmental signal.*

An interactive environmental map of Nakhon Si Thammarat Province, Thailand. It brings together data from Thai government agencies and open sources so anyone can pick any place and see its environmental situation. Every value shows its source and time.

- Map-first: the first screen is a full-screen map of the province.
- No fake data: a missing value is shown as "ไม่มีข้อมูลสาธารณะสำหรับพื้นที่นี้". The repository contains no demo data.
- Every value carries its source, observation time and freshness.
- Free-first, and no AI features.
- Anyone can report a hazard at a point (flood depth, what they need, …); anyone can mark that they are on the way or that help arrived, with no sign-in; reports update live. See [REPORTS.md](REPORTS.md).
- Emergency numbers for the province and the country, each with its source: in the app and at `/emergency`.
- Installable as an app (PWA). The emergency numbers work offline; live data is never served from cache, so offline the app says so instead of showing old values as current.
- Typeface: LINE Seed Sans TH (© LINE, SIL OFL 1.1; `app/fonts/LICENSE-OFL.txt`).

## Status

**Phase 1 (map foundation): code complete; real data import pending.** See [PHASE1_REPORT.md](PHASE1_REPORT.md).

## Docs

- [SETUP.md](SETUP.md) — install, database, loading the real data, API keys, deploy
- [DATA_SOURCES.md](DATA_SOURCES.md) — every source with endpoint, key, licence, update frequency and verification status
- [PHASE1_REPORT.md](PHASE1_REPORT.md) — what works, what failed verification, what is stubbed

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
