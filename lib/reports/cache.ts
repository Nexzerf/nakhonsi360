/**
 * Public report reads are the same for everyone, so a crowd can share them:
 * the CDN keeps each answer a few seconds and the server shares one query per
 * key for a few seconds. Right after someone changes a report, their browser
 * adds ?fresh=… (see lib/reports/client.ts), which skips both, so they see
 * their own change at once.
 */
export const REPORT_READ_TTL_MS = 3_000;
export const REPORT_READ_CACHE = 'public, max-age=0, s-maxage=5, stale-while-revalidate=10';
