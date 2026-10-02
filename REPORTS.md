# Citizen reports (รายงานเหตุจากประชาชน)

Anyone can report a hazard at a point on the map, and **anyone can help**. There is no sign-in: neighbours, volunteers, rescue foundations and officials all use the same screens. Reports and updates are labelled as coming from the public and are never mixed with agency data.

## Reporting

Hazard type (flood, flash flood, landslide, storm, fire, storm surge/erosion, drought, earthquake, smoke, cut road, other), urgency as the reporter judges it (life at risk / need help / situation update), location (GPS with its accuracy, or a tap on the map; only inside Nakhon Si Thammarat + 5 km), water depth by body height for water hazards, what is needed, people affected, details, and optionally a name and phone.

The name and phone are **shown publicly while the report is open** so that whoever comes to help can call. The form says so next to the field. They are hidden when the report is closed and deleted 30 days later.

## Showing it is real

A report, and every update, can carry:

- **When it was seen** (now / 30 min / 1 h / 3 h ago / a set time within 72 h), kept apart from when it was sent.
- **Photos** (up to 4 each). The browser shrinks them to ≤ 1600 px JPEG and re-encodes them, which removes all file metadata (camera, exact location) before upload. Before that it reads the file's capture time and GPS position; only the capture time and the **distance from the pin** are stored, never the coordinates.
- **Water level** by body height (ankle … over head) or in cm, with rising / steady / falling.

The report page shows the facts side by side, without turning them into a score:

| Fact | Shown as |
|---|---|
| Seen at / sent at | both times |
| People in the area who tapped "ยืนยัน ฉันอยู่ที่นี่ เห็นจริง" | count (once per connection, never the reporter) |
| Photo capture time vs the reported time | ✓ within 60 min, ⚠ otherwise, per photo and in total |
| Photo location vs the pin | ✓ within 500 m, ⚠ otherwise |
| Photos without time/location in the file | stated (normal for photos sent through chat apps) |
| Water level over time | every reading with its time and who sent it |

The page says plainly that file time and location are read on the sender's device and can be edited, so they support a judgement but do not certify anything.

Photos are stored in Postgres (`citizen_report_photos`, ≤ 2.5 MB each, served from `/api/reports/photos/<id>` as inert images) and deleted after 90 days. Moving them to Supabase Storage would need `SUPABASE_SERVICE_ROLE_KEY`.

## Helping

Each report has buttons for "ยืนยัน ฉันอยู่ที่นี่ เห็นจริง" (confirm, does not change the status), "รายงานระดับน้ำล่าสุด" (a newer water level, for water hazards), and:

| Button | Status after |
|---|---|
| ฉันกำลังไปช่วย (on my way) | มีคนกำลังไปช่วย |
| ช่วยเหลือแล้ว (helped) | ช่วยเหลือแล้ว / คลี่คลาย (closed) |
| ยังต้องการความช่วยเหลือ (still needs help) | ยังไม่มีคนรับเรื่อง (reopened) |
| ไปแล้วไม่พบเหตุ (nothing found) | closed |

Helpers can add a note ("2 boats, there in 20 minutes") and a name or group. Every update goes on the report's public timeline, so a wrong "helped" is visible and anyone, including the reporter, can reopen it. The reporter's browser keeps a private token from when the report was sent; their updates are labelled **ผู้แจ้ง (reporter)**.

The map and the list refresh every 15 seconds.

## Abuse controls (no accounts)

- 5 reports, 20 updates and 30 photos per hour per connection (hashed IP; the raw IP is never stored).
- Anyone can flag a report as false or abusive; flags from 3 different connections hide it.
- A honeypot field drops simple bots; text length limits; Thai phone format check; nothing is rendered as HTML.
- The form puts 1669 / 191 / 199 / 1784 first and says plainly that it is not an emergency line.
- Retention (`purge_expired()`): contact details and connection hashes are dropped 30 days after a report is closed or 90 days after it was made; reports are kept one year.

## Not done yet

- Notifications (LINE / push) to people who said they are on the way
- Offline queue for sending when the connection returns
