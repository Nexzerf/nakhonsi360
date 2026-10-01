# Citizen reports (รายงานเหตุจากประชาชน)

Anyone can report a hazard at a point on the map: flood, flash flood, landslide, storm, fire, storm surge/erosion, drought, earthquake, smoke, a cut road, or anything else. Reports appear on the map and in the live list straight away, labelled **ยังไม่ยืนยัน (unverified)**. They are never mixed with agency data.

## What a report holds

| Field | Notes |
|---|---|
| Hazard type, urgency | Urgency is the reporter's own judgement (life at risk / need help / situation update), not an official severity |
| Location | GPS (with its accuracy) or a tap on the map. Only points inside Nakhon Si Thammarat + 5 km are accepted. Subdistrict and district come from the COD-AB boundaries |
| Water depth and trend | Only for flood, flash flood and storm surge. Body-height shortcuts (ankle ~10 cm … over head ~200 cm) or an exact number |
| Needs | Evacuation/boat, medicine, drinking water, food, shelter, clothes, baby supplies, power, sandbags, pump, animals, clean-up |
| People, vulnerable people | Optional |
| Details, landmark | Free text, shown publicly |
| Name, phone | Optional and **private**: never returned by any public API. Seen only by signed-in responders |

## Live view

The map layer and the list poll every 15 seconds. The reporter's browser remembers the reports it sent ("ของฉัน") so they can follow the status without an account.

## Responders

`/admin/reports` (sign in with `REPORTS_ADMIN_TOKEN`) lists open reports first (life-at-risk at the top) with the reporter's phone (tap to call) and a map link. A responder can:

- set the status: รับเรื่องแล้ว → กำลังช่วยเหลือ → ช่วยเหลือแล้ว, or ซ้ำ / ตรวจสอบไม่พบเหตุ
- post a public reply ("ส่งเรือออกไปแล้ว ถึงภายใน 20 นาที")
- hide spam or abusive reports

Every status change and reply is added to the report's public timeline.

## Safeguards

- The form puts 1669 / 191 / 199 / 1784 first and says plainly that it is not an emergency line.
- At most 5 reports per hour per connection (hashed IP, never stored raw); a honeypot field drops bots.
- Text length limits, Thai phone number check, control characters removed. Nothing is rendered as HTML.
- Contact details and the IP hash are deleted 30 days after a report is closed, or 90 days after it was made; reports are kept one year (`purge_expired()`, run by the ingest job).

## Not done yet

- Photos (needs object storage, e.g. a Supabase Storage bucket)
- Push or LINE notifications to responders
- "I see this too" confirmations from other people
- Offline queue for sending when the connection returns
