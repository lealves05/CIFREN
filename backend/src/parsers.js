// Leitores de documentos (texto não confiável: só extraem dados, nunca executam nada, nunca abrem links):
// extrato OFX e CSV, XML da NF-e, linha digitável de boleto, Pix copia-e-cola (BR Code) e QR da NFC-e.
import crypto from 'node:crypto';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------------- números e datas brasileiros ----------------
/** "1.234,56" | "1234.56" | "-1.234,56" | "(1.234,56)" | "1.234,56 D" → número */
export function parseMoney(v) {
  let s = String(v ?? '').trim();
  if (!s) return null;
  let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /\s?D$/i.test(s);
  s = s.replace(/[()\sR$]/g, '').replace(/[DC]$/i, '').replace(/^-/, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (/^-/.test(String(v).trim())) neg = true;
  return round2(neg ? -n : n);
}
/** "31/12/2026" | "2026-12-31" | "20261231" | "31-12-26" → "2026-12-31" */
export function parseDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return valid(`${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`); }
  return null;
}
function valid(d) { const t = Date.parse(`${d}T00:00:00Z`); return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d ? null : d; }

// ---------------- extratos ----------------
/** OFX (SGML ou XML): <STMTTRN> com DTPOSTED, TRNAMT, FITID, MEMO/NAME. */
export function parseOFX(text) {
  const t = String(text);
  if (!/<OFX>/i.test(t) || !/<STMTTRN>/i.test(t)) throw new Error('Arquivo OFX inválido ou sem lançamentos.');
  const blocks = t.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const field = (b, n) => { const m = b.match(new RegExp(`<${n}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : null; };
  const lines = [];
  for (const b of blocks) {
    const date = parseDate(field(b, 'DTPOSTED')); const amount = parseMoney(String(field(b, 'TRNAMT') || '').replace(',', '.'));
    if (!date || amount == null || amount === 0) continue;
    const desc = [field(b, 'NAME'), field(b, 'MEMO')].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 300) || null;
    const fitid = field(b, 'FITID');
    lines.push({ date, amount, description: desc, fitid, line_hash: sha(fitid ? `fitid:${fitid}` : `${date}|${amount}|${desc}`) });
  }
  if (!lines.length) throw new Error('O OFX não tem lançamentos válidos.');
  return lines;
}

function splitCsvLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map((x) => x.trim());
}
/** CSV de banco: detecta separador e colunas (data, descrição/histórico, valor ou crédito/débito). */
export function parseCSV(text) {
  const rows = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) throw new Error('CSV vazio.');
  const sep = (rows[0].match(/;/g) || []).length >= (rows[0].match(/,/g) || []).length ? ';' : ',';
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let hIdx = rows.findIndex((r) => /data/.test(norm(r)) && /(valor|credito|debito|montante)/.test(norm(r)));
  if (hIdx < 0) hIdx = 0;
  const head = splitCsvLine(rows[hIdx], sep).map(norm);
  const find = (re) => head.findIndex((h) => re.test(h));
  const iDate = find(/^data|dt\b|date/); const iDesc = find(/hist|descri|lancamento|memo|detalhe/);
  const iVal = find(/^valor|^montante|amount/); const iCred = find(/credito|entrada/); const iDeb = find(/debito|saida/);
  if (iDate < 0 || (iVal < 0 && iCred < 0 && iDeb < 0)) throw new Error('Não encontrei as colunas de data e valor no CSV (cabeçalho com "Data" e "Valor", ou "Crédito"/"Débito").');
  const lines = [];
  for (const r of rows.slice(hIdx + 1)) {
    const c = splitCsvLine(r, sep);
    const date = parseDate(c[iDate]); if (!date) continue;
    let amount = iVal >= 0 ? parseMoney(c[iVal]) : null;
    if (amount == null) { const cr = iCred >= 0 ? parseMoney(c[iCred]) : null; const db = iDeb >= 0 ? parseMoney(c[iDeb]) : null; amount = cr ? Math.abs(cr) : db ? -Math.abs(db) : null; }
    if (amount == null || amount === 0) continue;
    const description = iDesc >= 0 ? (c[iDesc] || '').slice(0, 300) : null;
    lines.push({ date, amount, description, fitid: null, line_hash: sha(`${date}|${amount}|${description}|${lines.filter((x) => x.date === date && x.amount === amount && x.description === description).length}`) });
  }
  if (!lines.length) throw new Error('O CSV não tem lançamentos válidos.');
  return lines;
}

// ---------------- NF-e (XML) ----------------
const xtag = (xml, name) => { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${name}>`)); return m ? m[1].trim() : null; };
const xblock = (xml, name) => { const m = String(xml).match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`)); return m ? m[1] : null; };
export function fmtDoc(d) {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  return d || null;
}
export function parseNFeXML(xml) {
  const t = String(xml);
  if (/<!DOCTYPE|<!ENTITY/i.test(t)) throw new Error('XML recusado (contém DOCTYPE/ENTITY).');
  const inf = xblock(t, 'infNFe');
  if (!inf) throw new Error('Este XML não é de uma NF-e (sem infNFe).');
  const keyAttr = t.match(/<(?:\w+:)?infNFe[^>]*\sId="NFe(\d{44})"/);
  const emit = xblock(inf, 'emit') || ''; const dest = xblock(inf, 'dest') || ''; const ide = xblock(inf, 'ide') || ''; const tot = xblock(inf, 'ICMSTot') || '';
  const cobr = xblock(inf, 'cobr') || '';
  const dups = [...cobr.matchAll(/<(?:\w+:)?dup>([\s\S]*?)<\/(?:\w+:)?dup>/g)].map((m) => ({
    number: xtag(m[1], 'nDup'), due_date: parseDate(xtag(m[1], 'dVenc')), amount: parseMoney(String(xtag(m[1], 'vDup') || '').replace(',', '.')),
  })).filter((d) => d.due_date && d.amount);
  const items = [...inf.matchAll(/<(?:\w+:)?det[\s>][\s\S]*?<\/(?:\w+:)?det>/g)].slice(0, 200).map((m) => {
    const prod = xblock(m[0], 'prod') || '';
    return { description: xtag(prod, 'xProd'), qty: Number(xtag(prod, 'qCom')) || null, unit: xtag(prod, 'uCom'), unit_price: Number(xtag(prod, 'vUnCom')) || null, total: Number(xtag(prod, 'vProd')) || null };
  });
  const total = Number(xtag(tot, 'vNF')) || null;
  const warnings = [];
  const sumDup = round2(dups.reduce((a, d) => a + d.amount, 0));
  if (dups.length && total && Math.abs(sumDup - total) > 0.05) warnings.push(`A soma das duplicatas (R$ ${sumDup.toFixed(2)}) é diferente do total da nota (R$ ${total.toFixed(2)}).`);
  const sumItems = round2(items.reduce((a, i) => a + (i.total || 0), 0));
  const vProd = Number(xtag(tot, 'vProd')) || null;
  if (items.length && vProd && Math.abs(sumItems - vProd) > 0.05) warnings.push('A soma dos itens não bate com o total dos produtos.');
  return {
    kind: 'nfe', source: 'xml', confidence: 1,
    access_key: keyAttr ? keyAttr[1] : (xtag(t, 'chNFe') || null),
    number: xtag(ide, 'nNF'), series: xtag(ide, 'serie'), issue_date: parseDate(xtag(ide, 'dhEmi') || xtag(ide, 'dEmi')),
    supplier_name: xtag(emit, 'xNome'), supplier_document: fmtDoc(xtag(emit, 'CNPJ') || xtag(emit, 'CPF')),
    customer_name: xtag(dest, 'xNome'), customer_document: fmtDoc(xtag(dest, 'CNPJ') || xtag(dest, 'CPF')),
    total, due_dates: dups, items, warnings,
  };
}

// ---------------- boleto (linha digitável) ----------------
function mod10(num) { let s = 0; let w = 2; for (let i = num.length - 1; i >= 0; i--) { let p = Number(num[i]) * w; if (p > 9) p = Math.floor(p / 10) + (p % 10); s += p; w = w === 2 ? 1 : 2; } const r = (10 - (s % 10)) % 10; return r; }
function mod11Banco(num) { let s = 0; let w = 2; for (let i = num.length - 1; i >= 0; i--) { s += Number(num[i]) * w; w = w === 9 ? 2 : w + 1; } const r = 11 - (s % 11); return r === 0 || r === 10 || r === 11 ? 1 : r; }
function mod11Conc(num) { let s = 0; let w = 2; for (let i = num.length - 1; i >= 0; i--) { s += Number(num[i]) * w; w = w === 9 ? 2 : w + 1; } const r = s % 11; return r === 0 || r === 1 ? 0 : 11 - r; }

/** Fator de vencimento: base 07/10/1997; a partir de 22/02/2025 o fator voltou a 1000 (nova base 29/05/2022 + 1000 dias). */
function dueFromFactor(f, today = new Date()) {
  if (!f) return null;
  const DAY = 86400000;
  const oldBase = Date.UTC(1997, 9, 7);
  const candidates = [oldBase + f * DAY, Date.UTC(2025, 1, 22) + (f - 1000) * DAY];
  const now = today.getTime();
  // escolhe a data mais próxima de hoje (o boleto vence perto de quando é lido)
  const best = candidates.filter((t) => f >= 1000).sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
  return best ? new Date(best).toISOString().slice(0, 10) : null;
}

export function parseBoleto(input, today = new Date()) {
  const d = String(input || '').replace(/\D/g, '');
  if (d.length === 47) { // bancário
    const f1 = d.slice(0, 9); const f2 = d.slice(10, 20); const f3 = d.slice(21, 31);
    if (mod10(f1) !== Number(d[9]) || mod10(f2) !== Number(d[20]) || mod10(f3) !== Number(d[31])) throw new Error('Linha digitável com dígito verificador errado. Confira os números.');
    const barcode = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    if (mod11Banco(barcode.slice(0, 4) + barcode.slice(5)) !== Number(barcode[4])) throw new Error('Linha digitável com dígito geral inválido.');
    const factor = Number(d.slice(33, 37)); const amount = Number(d.slice(37, 47)) / 100;
    return { kind: 'boleto', source: 'boleto', confidence: 1, type: 'bancario', bank: d.slice(0, 3), barcode, line: d, total: amount || null, due_date: dueFromFactor(factor, today), due_dates: [] };
  }
  if (d.length === 48 && d[0] === '8') { // concessionária / tributos
    const blocks = [0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 11));
    const dvs = [0, 1, 2, 3].map((i) => Number(d[i * 12 + 11]));
    const mod = ['6', '7'].includes(d[2]) ? mod10 : mod11Conc;
    if (blocks.some((b, i) => mod(b) !== dvs[i])) throw new Error('Linha digitável de concessionária com dígito verificador errado.');
    const barcode = blocks.join('');
    const amount = Number(barcode.slice(4, 15)) / 100;
    const seg = { 1: 'Prefeituras', 2: 'Saneamento', 3: 'Energia elétrica e gás', 4: 'Telecomunicações', 5: 'Órgãos governamentais', 6: 'Carnês e assemelhados', 7: 'Multas de trânsito', 9: 'Uso exclusivo do banco' }[barcode[1]] || null;
    return { kind: 'boleto', source: 'boleto', confidence: 1, type: 'concessionaria', segment: seg, barcode, line: d, total: amount || null, due_date: null, due_dates: [] };
  }
  throw new Error('Linha digitável deve ter 47 números (boleto bancário) ou 48 (concessionária).');
}

// ---------------- Pix copia-e-cola (BR Code / EMV) ----------------
function crc16(s) { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); }
function tlv(s) { const out = {}; let i = 0; while (i + 4 <= s.length) { const id = s.slice(i, i + 2); const len = Number(s.slice(i + 2, i + 4)); if (!Number.isInteger(len)) break; out[id] = s.slice(i + 4, i + 4 + len); i += 4 + len; } return out; }
export function parsePix(input) {
  const s = String(input || '').trim();
  if (!/^000201/.test(s) || s.length > 512) throw new Error('Não é um Pix copia-e-cola válido.');
  const crc = s.slice(-4); if (crc16(s.slice(0, -4)) !== crc.toUpperCase()) throw new Error('Pix copia-e-cola com código de verificação (CRC) inválido.');
  const t = tlv(s); const mai = tlv(t['26'] || ''); const add = tlv(t['62'] || '');
  return { kind: 'pix', source: 'pix', confidence: 1, pix_key: mai['01'] || null, pix_url: mai['25'] ? '(Pix dinâmico)' : null, supplier_name: t['59'] || null, city: t['60'] || null,
    total: t['54'] ? Number(t['54']) : null, txid: add['05'] || null, due_dates: [] };
}

// ---------------- NFC-e (QR) ----------------
export function parseNFCeQR(input) {
  const s = String(input || '').trim();
  const m = s.match(/[?&]p=(\d{44})/) || s.match(/\b(\d{44})\b/);
  if (!m || !/^https?:\/\/[\w.-]+\.(gov\.br|fazenda\.\w+\.gov\.br)\b/i.test(s) && !/^\d{44}/.test(s)) throw new Error('Não é o QR de uma NFC-e (link da SEFAZ com a chave de 44 números).');
  const key = m[1];
  return { kind: 'nfce', source: 'nfce', confidence: 0.8, access_key: key, supplier_document: fmtDoc(key.slice(6, 20)), number: String(Number(key.slice(25, 34))),
    issue_date: `20${key.slice(2, 4)}-${key.slice(4, 6)}-01`, total: null, due_dates: [], note: 'O QR traz a chave da nota; valor e itens aparecem na consulta da SEFAZ (o CIFREN não abre o link).' };
}

/** Identifica o que foi colado: boleto, Pix ou NFC-e. */
export function parseCode(text) {
  const s = String(text || '').trim();
  if (/^000201/.test(s)) return parsePix(s);
  if (/^https?:\/\//i.test(s) || /^\d{44}$/.test(s.replace(/\s/g, ''))) return parseNFCeQR(s.replace(/\s/g, ''));
  return parseBoleto(s);
}
export { crc16 };
