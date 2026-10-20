import { api } from './api';

/** Carrega listas de apoio (categorias, centros de custo, contas). Falhas viram lista vazia. */
export async function loadRefs(which = ['categories', 'costCenters', 'accounts']) {
  const map = { categories: '/categories', costCenters: '/cost-centers', accounts: '/accounts' };
  const out = {};
  await Promise.all(which.map(async (k) => {
    try { out[k] = (await api.get(map[k]))?.items || []; } catch { out[k] = []; }
  }));
  return out;
}
