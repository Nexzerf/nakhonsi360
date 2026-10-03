Real responses from the NASA FIRMS area API (2026-10-03), requested for
98.9,7.5,100.7,9.7 (province extent + margin), last 5 days:

- `area_viirs_noaa21_5d.csv` — `/api/area/csv/[MAP_KEY]/VIIRS_NOAA21_NRT/98.9,7.5,100.7,9.7/5`, unmodified.
- Same request for VIIRS_SNPP_NRT returned 1 row, VIIRS_NOAA20_NRT 2 rows, MODIS_NRT 0 rows
  (MODIS uses `brightness`/`bright_t31` instead of `bright_ti4`/`bright_ti5`, and a numeric confidence).
- MAP_KEY status: transaction_limit 5000 per 10 minutes.

`acq_time` is HHMM in UTC without leading zeros (e.g. `648` = 06:48 UTC). VIIRS confidence is
`l`/`n`/`h` (low/nominal/high).
