import { api, errorMessage } from '../../lib/api';
import { useUI } from '../../context/UIContext';

/** Arquivar (DELETE) com confirmação. Arquivar não apaga: só tira das listas. */
export function useArchive() {
  const { confirm, toast } = useUI();
  return async (path, name, what, after) => {
    const ok = await confirm({
      title: `Arquivar ${what}?`, confirmText: 'Arquivar', danger: true,
      message: `“${name}” deixa de aparecer nas listas e não poderá ser usado em novos lançamentos. O histórico continua guardado.`,
    });
    if (!ok) return false;
    try { await api.del(path); toast(`${what[0].toUpperCase()}${what.slice(1)} arquivado.`); after?.(); return true; } catch (e) { toast(errorMessage(e), 'error'); return false; }
  };
}
