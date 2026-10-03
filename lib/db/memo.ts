import 'server-only';

/**
 * Short in-process cache for results that are the same for every visitor
 * (latest imports, connected sources, the public report list, …). Callers
 * asking at the same moment share one query, so a crowd arriving together
 * costs the database one query per key per `ttlMs`, not one per visitor.
 * Failed lookups are not kept. Keyed per client so tests with their own
 * database never see each other's results.
 */
const MAX_KEYS = 1000;
const stores = new WeakMap<object, Map<string, { at: number; p: Promise<unknown> }>>();

export function memo<T>(client: object, key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  let store = stores.get(client);
  if (!store) stores.set(client, (store = new Map()));
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  store.delete(key);
  store.set(key, { at: now, p });
  if (store.size > MAX_KEYS) store.delete(store.keys().next().value!);
  p.catch(() => {
    if (store.get(key)?.p === p) store.delete(key);
  });
  return p;
}
