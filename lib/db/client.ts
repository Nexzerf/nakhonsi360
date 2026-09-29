import 'server-only';
import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __n360Sql?: Sql };

/**
 * Shared Postgres client, or null when DATABASE_URL is not configured.
 * Callers must treat null as "data not available" and render the empty state.
 */
export function getDb(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.__n360Sql) {
    globalForDb.__n360Sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 5,
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalForDb.__n360Sql;
}

export class TimeoutError extends Error {
  constructor() {
    super('timeout');
  }
}

/** Reject after `ms` so one slow lookup cannot hold up the others. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
