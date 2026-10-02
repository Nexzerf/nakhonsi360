# Supplied copies of official files

Some official file hosts can't be reached from every network. The main one is `opendata_tst.dopa.go.th`: it blocks many non-Thai IPs, including GitHub's runners, and its host name contains an underscore. When a download fails, `npm run fetch:sources` falls back to a copy in this folder. It uses the copy only if the copy is **byte-identical** to the official file that was already verified, meaning its SHA-256 equals `_sample.fullFileSha256` in `data/samples/<source>/excerpt.json`. Any other file is refused, so nothing edited or made up can get in.

## DOPA villages (`dopa/`)

1. On a connection in Thailand, open the official URL in `data/samples/dopa.villages/excerpt.json` (`_sample.url`):
   `https://opendata_tst.dopa.go.th/downloads/15/จังหวัดนครศรีธรรมราช.json`
   Save the file without opening or editing it.
2. On GitHub, open this folder (`data/vendor/dopa/`), choose **Add file → Upload files**, upload the saved `.json`, and commit.
3. Run the **Import static data** workflow again.

Source: Department of Provincial Administration (DOPA), published on GD Catalog (`gdpublish-gis-01`), Open Data Common licence.
