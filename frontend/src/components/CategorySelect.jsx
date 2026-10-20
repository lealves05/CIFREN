import { Select } from './ui';

/** Ordena categorias como árvore: pai seguido dos filhos. */
export function categoryTree(list, type) {
  const items = (list || []).filter((c) => c.active !== false && (!type || c.type === type));
  const byParent = new Map();
  items.forEach((c) => {
    const k = c.parent_id || 'root';
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  });
  byParent.forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  const ids = new Set(items.map((c) => c.id));
  const roots = items.filter((c) => !c.parent_id || !ids.has(c.parent_id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return roots.map((r) => ({ ...r, children: byParent.get(r.id) || [] }));
}

/** Seleção de categoria filtrada por tipo (despesa ou receita), com subcategorias recuadas. */
export default function CategorySelect({ categories, type, value, onChange, label = 'Categoria', ...p }) {
  const tree = categoryTree(categories, type);
  return (
    <Select label={label} value={value || ''} onChange={(e) => onChange(e.target.value || null)} {...p}>
      <option value="">Sem categoria</option>
      {tree.map((root) => (root.children.length ? (
        <optgroup key={root.id} label={root.name}>
          <option value={root.id}>{root.name} (geral)</option>
          {root.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ) : <option key={root.id} value={root.id}>{root.name}</option>))}
    </Select>
  );
}
