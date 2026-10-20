import { useCallback, useEffect, useState } from 'react';
import { Undo2, CheckCircle2, Pencil, Ban } from 'lucide-react';
import Drawer from '../Drawer';
import { Badge, ErrorState, Loading, Spinner } from '../ui';
import { api, errorMessage } from '../../lib/api';
import { KIND, statusInfo, canSettle, canCancel } from '../../lib/titles';
import { money, date, dateTime, methodLabel } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { P } from '../../lib/permissions';

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right font-medium">{children || '—'}</dd>
    </div>
  );
}

/** Gaveta com os detalhes da conta, baixas feitas e estorno. */
export default function TitleDetails({ open, onClose, titleId, kind, onSettle, onEdit, onCancel, onChanged, version }) {
  const { can } = useAuth();
  const { askReason, toast } = useUI();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!titleId) return;
    setError(null);
    try { setT(await api.get(`/titles/${titleId}`)); } catch (e) { setError(e); }
  }, [titleId]);

  useEffect(() => { if (open) { setT(null); load(); } }, [open, load]);
  useEffect(() => { if (open && version) load(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const reverse = async (s) => {
    const reason = await askReason({
      title: 'Estornar esta baixa?', label: 'Motivo do estorno', confirmText: 'Estornar', danger: true,
      message: `A baixa de ${money(s.amount)} em ${date(s.paid_at)} será desfeita e o valor volta a ficar em aberto.`,
    });
    if (!reason) return;
    setBusy(s.id);
    try {
      await api.post(`/settlements/${s.id}/reverse`, { reason });
      toast('Baixa estornada.');
      await load();
      onChanged?.();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };

  const k = KIND[t?.kind || kind];
  const st = statusInfo(t, t?.kind || kind);
  const settlements = t?.settlements || [];
  const footer = t && (
    <>
      {can(P.titlesCancel) && canCancel(t) && <button type="button" className="btn-ghost text-danger" onClick={() => onCancel(t)}><Ban className="h-4 w-4" aria-hidden="true" /> Cancelar conta</button>}
      {can(P.titlesEdit) && t.status !== 'cancelado' && <button type="button" className="btn-outline" onClick={() => onEdit(t)}><Pencil className="h-4 w-4" aria-hidden="true" /> Editar</button>}
      {can(P.titlesSettle) && canSettle(t) && <button type="button" className="btn-primary" onClick={() => onSettle(t)}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Dar baixa</button>}
    </>
  );

  return (
    <Drawer open={open} onClose={onClose} title={t?.description || 'Detalhes'} subtitle={k?.title} footer={footer}>
      {error ? <ErrorState error={error} onRetry={load} /> : !t ? <Loading /> : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={st.tone}>{st.label}</Badge>
            {t.installments > 1 && <span className="text-xs text-ink-faint">Parcela {t.installment} de {t.installments}</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-app-sm bg-muted p-3"><div className="text-xs text-ink-faint">Valor</div><div className="font-semibold tabular-nums">{money(t.amount)}</div></div>
            <div className="rounded-app-sm bg-muted p-3"><div className="text-xs text-ink-faint">{t.kind === 'receber' ? 'Recebido' : 'Pago'}</div><div className="font-semibold tabular-nums text-positive">{money(t.paid_amount)}</div></div>
            <div className="rounded-app-sm bg-muted p-3"><div className="text-xs text-ink-faint">Em aberto</div><div className={`font-semibold tabular-nums ${t.overdue ? 'text-danger' : ''}`}>{money(t.open_amount)}</div></div>
          </div>
          <dl className="divide-y divide-line">
            <Row label="Vencimento"><span className={t.overdue ? 'text-danger' : ''}>{date(t.due_date)}</span></Row>
            <Row label={k.partyLabel}>{t.counterparty?.name}</Row>
            <Row label="Categoria">{t.category?.name}</Row>
            <Row label="Centro de custo">{t.cost_center?.name}</Row>
            <Row label="Empresa">{t.company?.name}</Row>
            <Row label="Nº do documento">{t.document_number}</Row>
            <Row label="Emissão">{t.issue_date && date(t.issue_date)}</Row>
            <Row label="Competência">{t.competence_date && date(t.competence_date).slice(3)}</Row>
            {t.notes && <Row label="Observações"><span className="whitespace-pre-line font-normal">{t.notes}</span></Row>}
          </dl>

          <section aria-labelledby="baixas-t">
            <h3 id="baixas-t" className="mb-2 text-sm font-semibold">Baixas ({t.kind === 'receber' ? 'recebimentos' : 'pagamentos'})</h3>
            {!settlements.length ? <p className="rounded-app-sm bg-muted px-3 py-4 text-center text-sm text-ink-faint">Nenhuma baixa registrada ainda.</p> : (
              <ul className="space-y-2">
                {settlements.map((s) => {
                  const total = (Number(s.amount) || 0) + (Number(s.interest) || 0) + (Number(s.fine) || 0) - (Number(s.discount) || 0);
                  return (
                    <li key={s.id} className={`rounded-app-sm border border-line p-3 text-sm ${s.reversed_at ? 'opacity-70' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className={`font-semibold tabular-nums ${s.reversed_at ? 'line-through' : ''}`}>{money(total)}</div>
                          <div className="text-xs text-ink-faint">{date(s.paid_at)} · {s.account?.name || 'Conta'} · {methodLabel(s.method)}</div>
                          {(s.interest > 0 || s.fine > 0 || s.discount > 0) && (
                            <div className="text-xs text-ink-faint">Principal {money(s.amount)}{s.interest > 0 && ` + juros ${money(s.interest)}`}{s.fine > 0 && ` + multa ${money(s.fine)}`}{s.discount > 0 && ` − desconto ${money(s.discount)}`}</div>
                          )}
                          {s.notes && <div className="mt-1 text-xs text-ink-soft">{s.notes}</div>}
                        </div>
                        {s.reversed_at ? <Badge>Estornada em {dateTime(s.reversed_at)}</Badge> : can(P.titlesSettle) && (
                          <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => reverse(s)} disabled={busy === s.id}>
                            {busy === s.id ? <Spinner /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />} Estornar
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
