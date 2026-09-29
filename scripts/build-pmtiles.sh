#!/usr/bin/env bash
# Build one PMTiles file per vector layer from the imported PostGIS tables.
# Requires: DATABASE_URL, psql, tippecanoe (≥ 2.17, writes .pmtiles).
# Output: data/tiles/<layerId>.pmtiles — upload to object storage and set
# NEXT_PUBLIC_PMTILES_BASE_URL to the folder URL.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT=data/tiles
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# layerId | source-layer | minzoom | SQL
LAYERS=(
  "admin-province|admin_province|0|select pcode, name_th, name_en, geom from admin_areas where level = 1"
  "admin-district|admin_district|0|select pcode, name_th, name_en, geom from admin_areas where level = 2"
  "admin-subdistrict|admin_subdistrict|8|select pcode, name_th, name_en, geom from admin_areas where level = 3"
  "villages|villages|10|select id, name_th, name_en, moo, geom from villages"
  "water-rivers|rivers|0|select osm_id, kind, subkind, name_th, name_en, geom from osm_features where kind = 'river'"
  "water-streams|streams|10|select osm_id, kind, subkind, name_th, name_en, geom from osm_features where kind = 'stream'"
  "water-canals|canals|10|select osm_id, kind, subkind, name_th, name_en, geom from osm_features where kind in ('canal','drain')"
  "water-reservoirs|reservoirs|0|select osm_id, kind, subkind, name_th, name_en, geom from osm_features where kind = 'reservoir'"
  "water-bodies|water_bodies|10|select osm_id, kind, subkind, name_th, name_en, geom from osm_features where kind = 'water'"
  "roads|roads|8|select osm_id, kind, subkind, name_th, name_en, geom from osm_features where kind in ('road_major','road_minor')"
  "coastline|coastline|0|select osm_id, geom from osm_features where kind = 'coastline'"
)

for row in "${LAYERS[@]}"; do
  IFS='|' read -r id sl minz sql <<<"$row"
  echo "== $id"
  # One GeoJSON feature per line; psql accepts the postgres:// URI directly.
  psql "$DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c \
    "select json_build_object('type','Feature','properties', to_jsonb(t) - 'geom', 'geometry', st_asgeojson(t.geom)::json) from ($sql) t" \
    > "$TMP/$id.geojsonl"
  tippecanoe -q -f -o "$OUT/$id.pmtiles" -l "$sl" -Z "$minz" -z 14 \
    --drop-densest-as-needed --extend-zooms-if-still-dropping \
    "$TMP/$id.geojsonl"
done
ls -lh "$OUT"
