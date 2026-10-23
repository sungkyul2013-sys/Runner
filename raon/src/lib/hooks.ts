import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

// 저장이 끝나면 invalidate() 로 화면의 모든 데이터를 새로 불러온다
const listeners = new Set<() => void>();
export function invalidate() {
  listeners.forEach((l) => l());
}

// 한 번 받은 데이터는 기억해 두었다가, 다시 그 화면에 오면 바로 보여 주고 뒤에서 새로 받는다.
// 덕분에 화면 전환이 '불러오는 중' 없이 이어진다.
const cache = new Map<string, unknown>();
export function prefetch(paths: string[]) {
  for (const p of paths) {
    if (cache.has(p)) continue;
    api
      .get(p)
      .then((d) => cache.set(p, d))
      .catch(() => {});
  }
}
/** 기억해 둔 데이터를 바로 꺼내 본다 (없으면 undefined) */
export function peek<T>(path: string): T | undefined {
  return cache.get(path) as T | undefined;
}
export function clearCache() {
  cache.clear();
}

export function useApi<T>(path: string | null) {
  const [data, setDataState] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const setData = useCallback(
    (d: T | undefined) => {
      setDataState(d);
      if (path && d !== undefined) cache.set(path, d);
    },
    [path],
  );
  const [version, setVersion] = useState(0);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setData(undefined);
      setLoading(false);
      return;
    }
    let alive = true;
    // 주소가 바뀌면 기억해 둔 데이터(없으면 빈 화면)로 바꾸고, 같은 주소를 다시 부를 때는 그대로 둔다
    if (lastPath.current !== path) setDataState(cache.get(path) as T | undefined);
    lastPath.current = path;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        cache.set(path, d);
        if (!alive) return;
        setDataState(d);
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload, setData };
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    on();
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
  }, [key, v]);
  return [v, setV] as const;
}
