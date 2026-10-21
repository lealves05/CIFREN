import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, ListPlus, Link2, Trash2, FileText, ExternalLink, Plus, Copy as CopyIcon, FileCode2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, errorMessage, isDuplicate, notifyCountsChanged } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useApiError } from '../lib/useApiError';
import { loadRefs } from '../lib/refData';
import { P } from '../lib/permissions';
import { money, date, dateTime, round2, today, pct } from '../lib/format';
import { maskDocument } from '../lib/masks';
import { fileSize } from '../lib/files';
import { docKindLabel, docStatus, SOURCE_LABEL } from '../lib/documents';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import CategorySelect from '../components/CategorySelect';
import CounterpartyPicker from '../components/CounterpartyPicker';
import TitlePicker from '../components/TitlePicker';
import { PageHeader, Loading, ErrorState, Badge, Select, InlineError, SubmitButton, Spinner, Input, cx } from '../components/ui';
import { DRow, Notice, Panel, Segmented } from '../components/kit';

const showDoc = (v) => (!v ? null : String(v).includes('*') ? v : maskDocument(v));

function CreateTitlesModal({ doc, open, onClose, onDone }) {
  const { toast } = useUI();
  const x = doc?.extracted || {};
  const [f, setF] = useState(null);
  const [refs, setRefs] = useState({ categories: [], costCenters: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError('');
    loadRefs(['categories', 'costCenters']).then(setRefs);
    const dues = (x.due_dates || []).length ? x.due_dates.map((d) => ({ due_date: d.due_date, amount: d.amount, number: d.number }))
      : [{ due_date: x.due_dates?.[0]?.due_date || today(), amount: x.total ?? null }];
    setF({ kind: 'pagar', counterparty: null, category_id: null, cost_center_id: null, dues });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const total = round2(f.dues.reduce((a, d) => a + (Number(d.amount) || 0), 0));
  const mismatch = x.total != null && Math.abs(total - Number(x.total)) > 0.009;
  const setDue = (i, k, v) => setF((s) => ({ ...s, dues: s.dues.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));
  const submit = async () => {
    if (f.dues.some((d) => !d.due_date || !(d.amount > 0))) { setError('Cada parcela precisa de vencimento e valor.'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post(`/documents/${doc.id}/create-titles`, {
        kind: f.kind, counterparty_id: f.counterparty?.id || undefined, category_id: f.category_id || undefined, cost_center_id: f.cost_center_id || undefined,
        due_dates: f.dues.map((d) => ({ due_date: d.due_date, amount: round2(d.amount) })),
      });
      const n = res?.ids?.length || f.dues.length;
      const ap = res?.approval_status === 'pendente' ? ' Passou da alçada: aguardando aprovação antes de pagar.' : '';
      toast(`${n > 1 ? `${n} contas lançadas a partir do documento.` : 'Conta lançada a partir do documento.'}${ap}`);
      notifyCountsChanged(); onDone(); onClose();
    } catch (e) {
      setError(isDuplicate(e) ? `${errorMessage(e)} Se for mesmo outra cobrança, lance a conta à mão em Contas a pagar.` : errorMessage(e));
    } finally { setSaving(false); }
  };
  const party = f.kind === 'receber' ? 'cliente' : 'fornecedor';
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="lg" title="Lançar contas do documento"
      subtitle={`Uma conta por duplicata${x.supplier_name ? ` · ${x.supplier_name}` : ''}${x.number ? ` · nº ${x.number}` : ''}`}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Lançar {f.dues.length > 1 ? `${f.dues.length} contas` : 'conta'}</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Segmented label="Tipo" value={f.kind} onChange={(v) => setF({ ...f, kind: v, category_id: null })} options={[{ value: 'pagar', label: 'Conta a pagar' }, { value: 'receber', label: 'Conta a receber' }]} />
        <div>
          <CounterpartyPicker kind={party} value={f.counterparty} onChange={(v) => setF({ ...f, counterparty: v })} label={party === 'cliente' ? 'Cliente' : 'Fornecedor'} />
          {x.supplier_name && !f.counterparty && <p className="mt-1 text-xs text-ink-faint">Na nota: <strong>{x.supplier_name}</strong>{x.supplier_document && ` (${showDoc(x.supplier_document)})`}. Busque pelo nome ou cadastre na hora.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CategorySelect categories={refs.categories} type={f.kind === 'receber' ? 'receita' : 'despesa'} value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} />
          <Select label="Centro de custo" value={f.cost_center_id || ''} onChange={(e) => setF({ ...f, cost_center_id: e.target.value || null })}>
            <option value="">Nenhum</option>{refs.costCenters.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <fieldset className="rounded-app-sm border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">Parcelas (duplicatas)</legend>
          <ul className="space-y-2">
            {f.dues.map((d, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                <Input label={`Vencimento ${d.number ? `(dup. ${d.number})` : i + 1}`} type="date" value={d.due_date} onChange={(e) => setDue(i, 'due_date', e.target.value)} />
                <MoneyInput label="Valor" value={d.amount} onChange={(v) => setDue(i, 'amount', v)} />
                <button type="button" className="btn-ghost btn-icon text-danger" aria-label={`Tirar parcela ${i + 1}`} disabled={f.dues.length === 1}
                  onClick={() => setF((s) => ({ ...s, dues: s.dues.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setF((s) => ({ ...s, dues: [...s.dues, { due_date: today(30), amount: null }] }))}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Parcela</button>
            <span className={cx('text-sm', mismatch && 'font-semibold text-warn')}>Soma {money(total)}{x.total != null && ` · nota ${money(x.total)}`}</span>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

function Preview({ doc }) {
  const src = `/api/documents/${doc.id}/file`;
  const mime = doc.mime || '';
  if (doc.has_file === false || (!doc.filename && !doc.size)) {
    return <div className="grid min-h-[200px] place-items-center p-6 text-center text-sm text-ink-faint"><div><FileCode2 className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />Lido a partir de código (sem arquivo).</div></div>;
  }
  if (mime.startsWith('image/')) return <img src={src} alt={`Imagem do documento ${doc.filename}`} className="mx-auto max-h-[75vh] w-auto rounded-app-sm object-contain" />;
  if (mime === 'application/pdf') {
    return (
      <div>
        <iframe src={src} title={`Arquivo ${doc.filename}`} className="hidden h-[70vh] w-full rounded-app-sm border border-line bg-white md:block" />
        <a href={src} target="_blank" rel="noopener" className="btn-outline mt-2 md:hidden"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir PDF</a>
      </div>
    );
  }
  return (
    <div className="grid min-h-[200px] place-items-center p-6 text-center text-sm text-ink-soft">
      <div><FileText className="mx-auto mb-2 h-8 w-8 text-accent" aria-hidden="true" />{doc.filename}<span className="block text-xs text-ink-faint">{fileSize(doc.size)}</span>
        <a href={src} download className="btn-outline btn-sm mt-3">Baixar arquivo</a></div>
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const onError = useApiError();
  const { data: doc, error, loading, reload } = useAsync(() => api.get(`/documents/${id}`), [id]);
  const [busy, setBusy] = useState('');
  const [create, setCreate] = useState(false);
  const [link, setLink] = useState(false);

  const extract = async () => {
    setBusy('ai');
    try { await api.post(`/documents/${id}/extract`); toast('Leitura com IA concluída. Confira os campos.'); reload(); } catch (e) { onError(e); } finally { setBusy(''); }
  };
  const discard = async () => {
    if (!(await confirm({ title: 'Descartar documento?', message: 'Ele sai das pendências. As contas já lançadas não mudam.', confirmText: 'Descartar', danger: true }))) return;
    setBusy('discard');
    try { await api.post(`/documents/${id}/discard`); toast('Documento descartado.'); notifyCountsChanged(); reload(); } catch (e) { onError(e); } finally { setBusy(''); }
  };
  const doLink = async (t) => {
    setLink(false); setBusy('link');
    try { await api.post(`/documents/${id}/link`, { entity: 'title', id: t.id }); toast(`Ligado à conta “${t.description}”.`); reload(); } catch (e) { onError(e); } finally { setBusy(''); }
  };

  if (loading && !doc) return <Loading />;
  if (error && !doc) return <ErrorState error={error} onRetry={reload} className="card" />;
  const x = doc.extracted || {};
  const st = docStatus(doc.status);
  const canCreate = can(P.titlesCreate) && !['descartado'].includes(doc.status);
  const canAi = can(P.docsUpload, P.docsManage) && doc.status !== 'descartado';
  const titleLinks = (doc.links || []).filter((l) => l.entity === 'title');

  return (
    <div>
      <Link to="/documentos" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Documentos</Link>
      <PageHeader title={x.supplier_name || doc.filename || docKindLabel(doc.kind)} icon={FileText}
        subtitle={`${docKindLabel(doc.kind)}${x.number ? ` nº ${x.number}` : ''} · enviado ${dateTime(doc.created_at)}${doc.uploaded_by?.name ? ` por ${doc.uploaded_by.name}` : ''}`}
        actions={(
          <>
            {canAi && <button type="button" className="btn-outline" onClick={extract} disabled={!!busy}>{busy === 'ai' ? <Spinner /> : <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />} Extrair com IA</button>}
            {can(P.docsManage, P.titlesEdit) && doc.status !== 'descartado' && <button type="button" className="btn-outline" onClick={() => setLink(true)} disabled={!!busy}><Link2 className="h-4 w-4" aria-hidden="true" /> Ligar a uma conta</button>}
            {canCreate && <button type="button" className="btn-cta" onClick={() => setCreate(true)} disabled={!!busy}><ListPlus className="h-4 w-4" aria-hidden="true" /> Lançar contas</button>}
          </>
        )} />

      <div className="mb-4 space-y-2">
        {doc.duplicate_of && (
          <Notice tone="danger" title="Este documento parece duplicado"
            action={<Link to={`/documentos/${doc.duplicate_of}`} className="btn-outline btn-sm">Ver o documento original</Link>}>
            Um arquivo igual (ou a mesma nota) já foi enviado antes. Confira para não pagar duas vezes.
          </Notice>
        )}
        {doc.status === 'aguardando_ia' && <Notice tone="warn">Este arquivo é foto ou PDF e espera a leitura por IA. Use “Extrair com IA” ou preencha os dados ao lançar.</Notice>}
        {doc.status === 'recebido' && !x.total && <Notice>A IA está desligada, então os dados não foram lidos automaticamente. Você pode lançar as contas informando os valores.</Notice>}
        {(doc.warnings || []).map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="Arquivo" bodyClass="p-3">
          <Preview doc={doc} />
        </Panel>
        <div className="space-y-4">
          <Panel title="Dados lidos" actions={<Badge tone={st.tone}>{st.label}</Badge>}>
            <dl className="divide-y divide-line">
              <DRow label="Emitente / beneficiário">{x.supplier_name || '—'}</DRow>
              <DRow label="CNPJ/CPF">{showDoc(x.supplier_document) || '—'}</DRow>
              <DRow label="Número">{x.number || '—'}</DRow>
              <DRow label="Emissão">{x.issue_date ? date(x.issue_date) : '—'}</DRow>
              <DRow label="Valor total">{x.total != null ? money(x.total) : '—'}</DRow>
              {x.access_key && <DRow label="Chave de acesso"><span className="break-all font-mono text-xs">{x.access_key}</span></DRow>}
              {x.barcode && <DRow label="Linha digitável"><span className="break-all font-mono text-xs">{x.barcode}</span></DRow>}
              {x.bank && <DRow label="Banco">{x.bank}</DRow>}
              {x.pix_key && <DRow label="Chave Pix"><span className="break-all">{x.pix_key}</span></DRow>}
              <DRow label="Lido por">{SOURCE_LABEL[x.source] || x.source || '—'}{x.confidence != null && x.source === 'ia' && <span className="text-ink-faint"> · confiança {pct(x.confidence * 100, 0)}</span>}</DRow>
            </dl>
          </Panel>
          {(x.due_dates || []).length > 0 && (
            <Panel title="Duplicatas / vencimentos">
              <ul className="divide-y divide-line">
                {x.due_dates.map((d, i) => (
                  <li key={i} className="flex justify-between gap-2 py-2 text-sm"><span>{d.number ? `${d.number} · ` : ''}{date(d.due_date)}</span><span className="font-medium tabular-nums">{money(d.amount)}</span></li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Contas ligadas">
            {!titleLinks.length ? <p className="text-sm text-ink-faint">Nenhuma conta lançada a partir deste documento ainda.</p> : (
              <ul className="space-y-1 text-sm">{titleLinks.map((l) => <li key={l.id}><Link to="/pagar" className="text-positive hover:underline">Conta {l.description || l.id.slice(0, 8)}</Link></li>)}</ul>
            )}
          </Panel>
          {can(P.docsManage) && doc.status !== 'descartado' && (
            <div className="flex justify-end"><button type="button" className="btn-ghost text-danger" onClick={discard} disabled={!!busy}><Trash2 className="h-4 w-4" aria-hidden="true" /> Descartar documento</button></div>
          )}
          {doc.sha256 && <p className="flex items-center gap-1 break-all text-[11px] text-ink-faint"><CopyIcon className="h-3 w-3 shrink-0" aria-hidden="true" />Impressão digital do arquivo (SHA-256): {doc.sha256}</p>}
        </div>
      </div>
      <CreateTitlesModal doc={doc} open={create} onClose={() => setCreate(false)} onDone={reload} />
      <TitlePicker open={link} onClose={() => setLink(false)} onPick={doLink} kind="pagar" status="todos" title="Ligar a qual conta?" hint="Use para comprovantes de pagamento." />
    </div>
  );
}
