import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

// Stale-while-revalidate cache shared across pages: revisiting a page renders the last data instantly
// (no skeleton → content swap during the page transition) and refreshes it in the background.
const cache = new Map<string, unknown>();

/** Clears cached data, e.g. on logout or when switching users. */
export function clearAsyncCache(): void {
  cache.clear();
}

// Page enter animation length (see lib/motion.ts). A first-visit result that arrives sooner is held until
// the animation has finished, so the heavy render does not land in the middle of it.
const SETTLE_MS = 360;

/**
 * Runs `fn` on mount and whenever `deps` change. Keeps previous data while reloading.
 * With a `cacheKey`, the last result is shown immediately on the next mount and then refreshed.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): AsyncState<T> {
  const cached = cacheKey !== undefined ? (cache.get(cacheKey) as T | undefined) : undefined;
  const [data, setDataState] = useState<T | undefined>(cached);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(cached === undefined);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mountedAt = useRef(performance.now());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hit = cacheKey !== undefined && cache.has(cacheKey);
    if (hit) setDataState(cache.get(cacheKey!) as T);
    setLoading(!hit);
    setError(undefined);
    const settle = (apply: () => void) => {
      const wait = hit ? 0 : SETTLE_MS - (performance.now() - mountedAt.current);
      if (wait > 0) timer = setTimeout(() => alive && apply(), wait);
      else apply();
    };
    fnRef
      .current()
      .then((d) => {
        if (cacheKey !== undefined) cache.set(cacheKey, d);
        settle(() => {
          setDataState(d);
          setLoading(false);
        });
      })
      .catch((e: Error) =>
        settle(() => {
          setError(e);
          setLoading(false);
        }),
      );
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, cacheKey]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback(
    (u: T | ((prev: T | undefined) => T)) => {
      setDataState((prev) => {
        const next = typeof u === 'function' ? (u as (p: T | undefined) => T)(prev) : u;
        if (cacheKey !== undefined) cache.set(cacheKey, next);
        return next;
      });
    },
    [cacheKey],
  );
  return { data, error, loading, reload, setData };
}

/** Fetches data into the cache ahead of time (e.g. right after login) so the first visit renders instantly. */
export function primeAsyncCache(key: string, fn: () => Promise<unknown>): void {
  if (cache.has(key)) return;
  fn()
    .then((d) => {
      if (!cache.has(key)) cache.set(key, d);
    })
    .catch(() => {
      /* the page fetches again on its own */
    });
}
