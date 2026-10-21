import { useState } from 'react';
import TitleForm from './TitleForm';
import SettleModal from './SettleModal';
import TitleDetails from './TitleDetails';
import GroupForm from './GroupForm';
import { api, errorMessage } from '../../lib/api';
import { money } from '../../lib/format';
import { useUI } from '../../context/UIContext';

/** Concentra as janelas de uma conta (lançar, editar, dar baixa, detalhes, cancelar). */
export function useTitleActions({ kind, onChanged }) {
  const { askReason, toast } = useUI();
  const [form, setForm] = useState(null); // { id?, kind }
  const [settle, setSettle] = useState(null); // título
  const [details, setDetails] = useState(null); // { id, kind }
  const [group, setGroup] = useState(null); // { id, kind } — lançamento original (todas as parcelas)
  const [version, setVersion] = useState(0);

  const changed = () => { setVersion((v) => v + 1); onChanged?.(); };

  const cancel = async (t) => {
    const reason = await askReason({
      title: 'Cancelar esta conta?', label: 'Motivo do cancelamento', confirmText: 'Cancelar conta', danger: true,
      message: `“${t.description}” (${money(t.amount)}) deixa de contar nos totais. Isso fica registrado na auditoria.`,
    });
    if (!reason) return;
    try {
      await api.post(`/titles/${t.id}/cancel`, { reason });
      toast('Conta cancelada.');
      changed();
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const elements = (
    <>
      <TitleForm open={!!form} onClose={() => setForm(null)} kind={form?.kind || kind} titleId={form?.id} onSaved={changed} />
      <SettleModal open={!!settle} onClose={() => setSettle(null)} title={settle} onDone={changed} />
      <TitleDetails open={!!details} onClose={() => setDetails(null)} titleId={details?.id} kind={details?.kind || kind} version={version}
        onChanged={onChanged} onSettle={(t) => setSettle(t)} onEdit={(t) => setForm({ id: t.id, kind: t.kind })} onCancel={cancel}
        onEditGroup={(t) => setGroup({ id: t.group_id, kind: t.kind })} />
      <GroupForm open={!!group} onClose={() => setGroup(null)} groupId={group?.id} kind={group?.kind || kind} onSaved={changed} />
    </>
  );

  return {
    openNew: (k = kind) => setForm({ kind: k }),
    openEdit: (t) => setForm({ id: t.id, kind: t.kind || kind }),
    openSettle: (t) => setSettle(t),
    openGroup: (t) => setGroup({ id: t.group_id, kind: t.kind || kind }),
    openDetails: (t) => setDetails({ id: t.id, kind: t.kind || kind }),
    cancel,
    elements,
  };
}
