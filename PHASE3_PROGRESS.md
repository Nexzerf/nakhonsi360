# Phase 3 progress — Environment

Date: 2026-10-01

## Working with real data

- **Land cover — ESA WorldCover 2021 (10 m, CC BY 4.0).** `npm run import:worldcover` reads the province window of the two real Cloud-Optimised GeoTIFF tiles from ESA's public S3 bucket (no download of whole tiles), sums the area of every 10 m pixel from its latitude on the WGS 84 ellipsoid, and stores the share of each class per subdistrict. Check against the boundaries: the per-subdistrict totals equal the HDX polygon areas within 0.05% (province 9,901.7 km²).
- **Mangroves layer.** Mangrove pixels (class 95, 135.7 km² inside the province) traced to 958 polygons ≥ 200 m², served as vector tiles. The layer's ⓘ panel and the inspector say it is a satellite classification, not DMCR's official map.
- **Inspector card "สิ่งปกคลุมดิน".** Land-cover shares of the subdistrict at the point, mangroves at or near the point (10 km), and a note that rubber and oil palm plantations count as tree cover (as defined in the WorldCover manual) and that this is not LDD's land-use survey.
- **Data issue found in HDX:** two subdistrict names are cut to 48 bytes in every HDX format (TH801210 / TH801214 → both `ปากพนังฝั่งตะวัน`). Detected by comparing all 170 names with TMD's. Kept as published; code-based matching accepts the cut name. Worth reporting to OCHA/HDX.
- **Tests:** WorldCover helpers (tile names, pixel area checked against PostGIS geodesic area), SQL test for the cut names.

## Blocked, and why

Every Thai agency host for Phase 3 is refused by this environment's network policy (HTTP 403 to CONNECT): DMR (landslide, shoreline), DMCR (coast, erosion, official mangroves), LDD (land use, soil), DWR (wetlands), RFD/DNP (forests, national parks), data.go.th and the `*.gdcatalog.go.th` sub-catalogs. The list of hosts is in DATA_SOURCES.md. To continue: allow these hosts in the environment's network settings, or run the importers from a machine in Thailand. GISTDA soil moisture needs `GISTDA_API_KEY`.

## Phase 3 acceptance (draft)

- [x] One environmental layer from a verified open source, with licence, attribution, date and method shown (WorldCover mangroves + land cover)
- [x] Values checked against an independent reference (pixel areas vs. HDX polygon areas)
- [ ] Official Thai sources (DMR landslide, DMCR coast, LDD land use, DWR wetlands) — blocked
- [ ] Soil moisture / drought (GISTDA) — needs key
