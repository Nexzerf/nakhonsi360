Real response from GISTDA's PM2.5 service (no key), fetched on a GitHub runner at
2026-10-03T18:36:32.731Z and copied unmodified from the job log:

- `pm25_by_amphoe_80.json` — `https://pm25.gistda.or.th/rest/getPm25byAmphoe?pv_idn=80`

One record per district (ap_idn = DOPA district code): hourly `pm25` and `pm25Avg24hr`
(µg/m³, GISTDA's estimate from satellite data and models, not a ground station).

`dt` is written as "2026-10-04T01:00:00.000Z" but is Thai local time: the response was
fetched at 18:36 UTC (01:36 on 4 October in Thailand) and its own `datetimeThai` says
"เวลา 1:00 น." on 4 October. Read as UTC it would be 6½ hours in the future.
