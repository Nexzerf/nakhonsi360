Real response from the GISTDA API gateway (2026-10-03), header `API-Key`:

- `viirs_7days_national.json` — `/api/2.0/resources/features/viirs/7days?limit=2&offset=0`,
  unmodified except `links` removed. The province had none (pv_idn=80 → 0 for 1/3/7 days).
- `modis/1day` and `hotspot/1day` → 404 "Service not found".

`acq_date`/`acq_time` are UTC (HHMM); `th_date`/`th_time` are the same instant in Thai time.
`confidence` is a word (nominal/low/high). `hotspotid` is GISTDA's stable id.
