-- Some DOPA village records share one identical coordinate with other villages
-- (e.g. several villages of one subdistrict at the same point). They are kept
-- as published, and the count is stored so the UI can say the location is shared.
alter table villages add column if not exists shared_location_count smallint not null default 1;

create or replace function refresh_village_shared_locations()
returns integer
language sql
as $$
  with c as (select geom, count(*)::smallint as n from villages group by geom),
  upd as (
    update villages v set shared_location_count = c.n from c where st_equals(v.geom, c.geom) returning 1
  )
  select count(*)::integer from upd
$$;

drop function if exists nearest_villages(double precision, double precision, integer);

create or replace function nearest_villages(p_lng double precision, p_lat double precision, p_limit integer default 3)
returns table (
  id text, name_th text, name_en text, moo smallint,
  subdistrict_pcode text, subdistrict_th text, district_th text,
  lng double precision, lat double precision, distance_m double precision, shared_location_count smallint)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  cand as (
    select v.* from villages v, p order by v.geom <-> p.g limit greatest(p_limit, 1) * 4
  )
  select c.id, c.name_th, c.name_en, c.moo, c.subdistrict_pcode, s.name_th, d.name_th,
         st_x(c.geom), st_y(c.geom),
         st_distance(c.geom::geography, p.g::geography),
         c.shared_location_count
    from cand c
   cross join p
    left join admin_areas s on s.pcode = c.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode
   order by 10
   limit p_limit
$$;
