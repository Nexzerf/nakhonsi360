Real response from Air4Thai (Pollution Control Department), fetched on a GitHub runner at
2026-10-03T18:38:59.138Z from `https://air4thai.pcd.go.th/services/getNewAQI_JSON.php`
(173 stations, 116,757 bytes). Kept here unmodified: the three records within the
province extent search box (`near_stations.json`), copied from the job log.

The server's certificate (CN air4thai.net, SAN includes air4thai.pcd.go.th, issued by
Let's Encrypt YR1) is sent with the wrong intermediate, so a plain Node request fails.
lib/net/aia.ts completes the chain through the certificate's AIA links
(YR1 → Root YR → ISRG Root X1, a trusted root) and verifies normally.

`AQILast.date` + `time` are Thai local time. `-1` means "not measured".
`color_id` is PCD's own AQI level (1–5; 0 = no data).
