# Setup

Nakhonsi360 runs at zero cost: Next.js on Vercel (free tier), Postgres + PostGIS on Supabase (free tier), and free public data sources. No paid APIs.

## 1. Requirements

- Node.js ≥ 20
- GDAL ≥ 3.7 (`ogr2ogr`, `ogrinfo` — used by the importers). Ubuntu/Debian: `sudo apt install gdal-bin`; macOS: `brew install gdal`
- A Postgres database with the **PostGIS** and **pg_trgm** extensions (Supabase has both)
- Optional: `tippecanoe` ≥ 2.17 to build PMTiles

```bash
npm ci
cp .env.example .env.local   # then fill in DATABASE_URL
```

## 2. Database

Create a Supabase project, then copy **Project Settings → Database → Connection string → Transaction pooler** (port 6543) into `DATABASE_URL`.

```bash
DATABASE_URL=… npm run db:migrate      # or: supabase db push
```

The migrations enable RLS on every table without policies: the app reads only through its own server routes, never through the public PostgREST API.

## 3. Load the real data (Phase 1)

**All data must come from the real sources.** The app never ships sample or demo data; until the import runs, every panel says that the data is not imported yet.

The download must run on a machine that can reach the source hosts (`data.humdata.org`, `gdcatalog.go.th`, `download.geofabrik.de`). Some Thai government servers block non-Thai IPs — if `gdcatalog.go.th` fails from abroad, run the fetch from a machine in Thailand.

### Option A — your computer

```bash
npm run fetch:sources             # downloads to data/static/, writes data/samples/ + manifest
DATABASE_URL=… npm run import:all # migrate + import boundaries → villages → OSM
```

Each importer prints the source record count, the imported count and every rejection reason (missing coordinates, swapped lat/lng, sentinel values, outside the province, duplicate ids). These counts are stored in `dataset_imports` and shown in each layer's ⓘ panel.

If a file's field names differ from what the importer detects, it stops and lists the available fields. Name them explicitly, e.g.:

```bash
npm run import:villages -- --file data/static/<file>.json --map id=VILLAGE_CODE --map nameTh=VILLAGE_NAME --map lat=LAT --map lng=LONG
npm run import:admin -- --file data/static/<file>.gpkg --map level3.nameTh=ADM3_TH
```

### Option B — GitHub Actions

1. Add the repository secret `DATABASE_URL` (Settings → Secrets and variables → Actions).
2. Run **Actions → Import static data (Phase 1) → Run workflow**.
3. Download the `samples-and-manifest` artifact and commit `data/samples/` so adapter tests can run against the real samples.

## 4. Live data (Phase 2)

```bash
DATABASE_URL=… npm run ingest                          # every registered adapter + retention
DATABASE_URL=… npm run ingest -- --source thaiwater.rain24h
```

Each run is logged in `ingest_runs` (fetched, stored, rejected with reasons); `/api/sources` and the status bar read it. One failing source never stops the others. On GitHub, the **Ingest live data** workflow runs every 15 minutes once the `DATABASE_URL` secret is set.

Behind a corporate proxy, Node's `fetch` only uses `HTTPS_PROXY` when started with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

## 5. Vector tiles

Without extra setup, map layers are served as vector tiles straight from PostGIS (`/api/tiles/...`, cached by the CDN). For large layers, build PMTiles and host them on object storage:

```bash
DATABASE_URL=… npm run build:pmtiles        # → data/tiles/<layerId>.pmtiles
```

Upload the files to a public Supabase Storage bucket (or Cloudflare R2) and set `NEXT_PUBLIC_PMTILES_BASE_URL` to the folder URL.

## 6. Run

```bash
npm run dev            # http://localhost:3000
npm test               # unit tests
npm run test:e2e       # Playwright (builds are served with `next start`)
```

The database tests use the real downloaded files only:

```bash
TEST_DATABASE_URL=postgres://…/postgres CODAB_FILE=… DOPA_FILE=… OSM_FILE=… npm run test:sql
```

## 7. API keys for later phases (all free)

Keys stay server-side (never `NEXT_PUBLIC_`). None are needed in Phase 1.

| Variable | Service | How to get it |
|---|---|---|
| `TMD_UID`, `TMD_UKEY` | กรมอุตุนิยมวิทยา (TMD) open data API | Register at https://data.tmd.go.th → the account page shows `uid` and `ukey`. Data is copyrighted: credit "กรมอุตุนิยมวิทยา" wherever it is shown. |
| `GISTDA_API_KEY` | GISTDA API Gateway (flood, soil moisture) | Register at https://api-gateway.gistda.or.th and create an API key. |
| `FIRMS_MAP_KEY` | NASA FIRMS (hotspot backup) | Request a MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/map_key/ (limit 5,000 requests / 10 min). |
| `COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET` | Copernicus Data Space (Sentinel-2) | Create a free account at https://dataspace.copernicus.eu, then create OAuth client credentials in the dashboard. Check the free monthly quota. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Project Settings → API. Only for scheduled ingest jobs. |

## 8. Deploy (Vercel)

Import the repository in Vercel, set `DATABASE_URL` (and `NEXT_PUBLIC_PMTILES_BASE_URL` if used), and deploy. In Phase 2, test each live source from the deployment region; if a Thai server blocks it, run that ingest from GitHub Actions or a Thai-hosted runner and store the results in Postgres.
