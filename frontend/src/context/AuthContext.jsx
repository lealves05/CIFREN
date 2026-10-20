import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, EVENTS } from '../lib/api';
import { readPref, writePref } from '../lib/storage';

const AuthCtx = createContext(null);

const companyKey = (orgId) => `cifren.empresa.${orgId}`;

/**
 * Estado da sessão vindo de GET /api/auth/me.
 * status: 'loading' | 'guest' | 'ready' | 'blocked'
 */
export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState('loading');
  const [companyId, setCompanyIdState] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setMe(data);
      setStatus(data?.access?.blocked ? 'blocked' : 'ready');
      return data;
    } catch (err) {
      if (err.status === 402) { setStatus('blocked'); return null; }
      if (err.status === 401) { setMe(null); setStatus('guest'); return null; }
      // falha de rede: mantém o que havia; se nada havia, trata como visitante
      setStatus((s) => (s === 'loading' ? 'guest' : s));
      throw err;
    }
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => { setMe(null); setStatus('guest'); };
    const onBlocked = () => setStatus('blocked');
    window.addEventListener(EVENTS.unauthorized, onUnauthorized);
    window.addEventListener(EVENTS.blocked, onBlocked);
    return () => {
      window.removeEventListener(EVENTS.unauthorized, onUnauthorized);
      window.removeEventListener(EVENTS.blocked, onBlocked);
    };
  }, []);

  // filtro de empresa lembrado por organização (só o id; nada sensível)
  const orgId = me?.org?.id;
  const companies = useMemo(() => me?.companies || [], [me]);
  useEffect(() => {
    if (!orgId) { setCompanyIdState(''); return; }
    const saved = readPref(companyKey(orgId)) || '';
    const valid = saved && companies.some((c) => c.id === saved);
    // usuário limitado a uma única empresa: fica fixo nela
    const forced = companies.length === 1 && Array.isArray(me?.company_scope) ? companies[0].id : '';
    setCompanyIdState(forced || (valid ? saved : ''));
  }, [orgId, companies, me?.company_scope]);

  const setCompanyId = useCallback((id) => {
    setCompanyIdState(id || '');
    if (orgId) writePref(companyKey(orgId), id || '');
  }, [orgId]);

  const permissions = useMemo(() => new Set(me?.permissions || []), [me]);
  /** true se tiver QUALQUER uma das permissões informadas. */
  const can = useCallback((...codes) => codes.some((c) => permissions.has(c)), [permissions]);
  const moduleOn = useCallback((key) => !me?.modules || me.modules[key] !== false, [me]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* sessão já pode ter expirado */ }
    setMe(null);
    setStatus('guest');
  }, []);

  const switchOrg = useCallback(async (id) => {
    await api.post('/auth/switch-org', { org_id: id });
    return refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    me, status, user: me?.user, org: me?.org, orgs: me?.orgs || [], role: me?.role, companies,
    access: me?.access || null, companyId, setCompanyId, can, moduleOn, refresh, logout, switchOrg,
  }), [me, status, companies, companyId, setCompanyId, can, moduleOn, refresh, logout, switchOrg]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
