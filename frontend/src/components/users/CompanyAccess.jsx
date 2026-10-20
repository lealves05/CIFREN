import { useAuth } from '../../context/AuthContext';

/** Acesso às empresas: null = todas; lista = só as marcadas. */
export default function CompanyAccess({ value, onChange, error }) {
  const { companies } = useAuth();
  if (companies.length <= 1) return null;
  const all = value == null;
  const set = new Set(value || []);
  const toggle = (id) => { const s = new Set(set); if (s.has(id)) s.delete(id); else s.add(id); onChange([...s]); };
  return (
    <fieldset>
      <legend className="label">Empresas que pode ver</legend>
      <div className="space-y-2 rounded-app-sm border border-line p-3">
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="emp-acc" checked={all} onChange={() => onChange(null)} className="h-4 w-4 accent-[rgb(var(--accent))]" /> Todas as empresas (inclusive as que forem criadas depois)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="emp-acc" checked={!all} onChange={() => onChange([])} className="h-4 w-4 accent-[rgb(var(--accent))]" /> Só algumas</label>
        {!all && (
          <div className="ml-6 space-y-1.5 border-l border-line pl-3">
            {companies.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={set.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[rgb(var(--accent))]" /> {c.name}
              </label>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </fieldset>
  );
}
