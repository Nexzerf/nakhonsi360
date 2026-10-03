Real responses from the GISTDA API gateway (2026-10-03), header `API-Key`:

- `flood_30days_national.json` — `/api/2.0/resources/features/flood/30days?limit=2&offset=0`
  (no province filter, to get a real feature: the province had none). First feature kept
  unmodified; `links` removed (they can carry the key). numberMatched 121,916 nationally.
- `/features/flood/{1day,3days,7days,30days}?pv_idn=80` all returned numberMatched 0 for
  Nakhon Si Thammarat on 2026-10-03.

Each feature is one H3 cell (res 9) of detected flood water: district/subdistrict codes and
names, flooded area `f_area` (m²), affected `population`, `building`, crop areas, and
`file_name`, the satellite scenes (sensor_YYYYMMDD_HHMM) the detection used.
