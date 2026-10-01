-- HDX COD-AB (2026-01-26 release) publishes two Nakhon Si Thammarat subdistrict
-- names cut to 48 bytes in every format: TH801210 and TH801214 are both
-- 'ปากพนังฝั่งตะวัน' (DOPA and TMD: ปากพนังฝั่งตะวันตก / ปากพนังฝั่งตะวันออก;
-- HDX English: Pak Phanang Fang Tawan Tok / Ok). The HDX names are kept as
-- published. When the source's own code matches, a source name that the HDX
-- name is a prefix of is accepted as the same subdistrict.
create or replace function resolve_source_subdistrict(p_tcode text, p_tname text, p_aname text)
returns text
language sql stable
as $$
  with norm as (
    select replace(coalesce(p_tname, ''), ' ', '') as t, replace(coalesce(p_aname, ''), ' ', '') as a
  ),
  by_code as (
    select s.pcode from admin_areas s, norm
     where p_tcode ~ '^[0-9]{6}' and s.level = 3 and s.pcode = 'TH' || left(p_tcode, 6)
       and norm.t <> ''
       and (replace(s.name_th, ' ', '') = norm.t or starts_with(norm.t, replace(s.name_th, ' ', '')))
  ),
  by_name as (
    select s.pcode from admin_areas s
      join admin_areas d on d.pcode = s.parent_pcode, norm
     where s.level = 3 and replace(s.name_th, ' ', '') = norm.t
       and replace(d.name_th, ' ', '') = norm.a
  )
  select coalesce(
    (select pcode from by_code),
    (select min(pcode) from by_name having count(*) = 1)
  )
$$;
