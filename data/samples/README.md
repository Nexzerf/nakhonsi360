# Raw samples

Real responses from each source, saved unmodified, one folder per source id. Adapters are written and tested against these files (`tests/unit/adapters/`).

| Folder | Content |
|---|---|
| `hdx.cod-ab-tha/package_show.json` | HDX CKAN metadata for the COD-AB Thailand dataset (resources, licence, dates) |
| `thaiwater.waterlevel/waterlevel_load.json` | ThaiWater `waterlevel_load`: the Nakhon Si Thammarat records (province_code 80) unmodified, plus the `scale`, `basin` and `agency` sections; `_sample` holds the URL, fetch time and SHA-256 of the full response |
| `thaiwater.rain24h/rain_24h.json` | ThaiWater `rain_24h`: the Nakhon Si Thammarat records unmodified; `_sample` as above |

No synthetic or demo data is stored here.
