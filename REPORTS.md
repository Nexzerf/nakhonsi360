# Citizen reports (รายงานเหตุจากประชาชน)

Anyone can report a hazard at a point on the map, and **anyone can help**. There is no sign-in: neighbours, volunteers, rescue foundations and officials all use the same screens. Reports and updates are labelled as coming from the public and are never mixed with agency data.

## Reporting

Hazard type (flood, flash flood, landslide, storm, fire, storm surge/erosion, drought, earthquake, smoke, cut road, other), urgency as the reporter judges it (life at risk / need help / situation update), location (GPS with its accuracy, or a tap on the map; only inside Nakhon Si Thammarat + 5 km), water depth by body height for water hazards, what is needed, people affected, details, and optionally a name and phone.

The name and phone are **shown publicly while the report is open** so that whoever comes to help can call. The form says so next to the field. They are hidden when the report is closed and deleted 30 days later.

## Helping

Each report has four buttons, plus "add information":

| Button | Status after |
|---|---|
| ฉันกำลังไปช่วย (on my way) | มีคนกำลังไปช่วย |
| ช่วยเหลือแล้ว (helped) | ช่วยเหลือแล้ว / คลี่คลาย (closed) |
| ยังต้องการความช่วยเหลือ (still needs help) | ยังไม่มีคนรับเรื่อง (reopened) |
| ไปแล้วไม่พบเหตุ (nothing found) | closed |

Helpers can add a note ("2 boats, there in 20 minutes") and a name or group. Every update goes on the report's public timeline, so a wrong "helped" is visible and anyone, including the reporter, can reopen it. The reporter's browser keeps a private token from when the report was sent; their updates are labelled **ผู้แจ้ง (reporter)**.

The map and the list refresh every 15 seconds.

## Abuse controls (no accounts)

- 5 reports and 20 updates per hour per connection (hashed IP; the raw IP is never stored).
- Anyone can flag a report as false or abusive; flags from 3 different connections hide it.
- A honeypot field drops simple bots; text length limits; Thai phone format check; nothing is rendered as HTML.
- The form puts 1669 / 191 / 199 / 1784 first and says plainly that it is not an emergency line.
- Retention (`purge_expired()`): contact details and connection hashes are dropped 30 days after a report is closed or 90 days after it was made; reports are kept one year.

## Not done yet

- Photos (needs object storage, e.g. a Supabase Storage bucket)
- Notifications (LINE / push) to people who said they are on the way
- Offline queue for sending when the connection returns
