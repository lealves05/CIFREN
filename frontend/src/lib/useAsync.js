import { useCallback, useEffect, useRef, useState } from 'react';

/** Carrega dados com estados de carregando/erro e função para recarregar. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (my === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (my === seq.current) setState((s) => ({ data: s.data, error, loading: false }));
      return null;
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Lista paginada por cursor: { items, next_cursor }. */
export function usePaged(fetchPage, deps = []) {
  const [items, setItems] = useState([]);
  const [extra, setExtra] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setError(null);
    try {
      const res = await fetchPage(null);
      if (my !== seq.current) return;
      setItems(res?.items || []);
      setCursor(res?.next_cursor || null);
      setExtra(res);
    } catch (e) {
      if (my === seq.current) { setError(e); setItems([]); setCursor(null); }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const more = useCallback(async () => {
    if (!cursor) return;
    const my = seq.current;
    setLoadingMore(true);
    try {
      const res = await fetchPage(cursor);
      if (my !== seq.current) return;
      setItems((x) => [...x, ...(res?.items || [])]);
      setCursor(res?.next_cursor || null);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, fetchPage]);

  return { items, extra, hasMore: !!cursor, loading, loadingMore, error, reload: load, more };
}
