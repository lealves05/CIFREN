export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');

/** 12345678000190 → 12.345.678/0001-90 (aplica enquanto digita). */
export function maskCnpj(v) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** CPF ou CNPJ, conforme a quantidade de dígitos. */
export function maskDocument(v) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return maskCnpj(d);
}

export function isValidCnpj(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidCpf(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Mensagem de aviso para CNPJ digitado (vazio = ok). */
export function cnpjHint(v) {
  const d = onlyDigits(v);
  if (!d) return '';
  if (d.length < 14) return 'O CNPJ tem 14 números.';
  return isValidCnpj(d) ? '' : 'Este CNPJ parece estar errado. Confira os números.';
}

export function documentHint(v) {
  const d = onlyDigits(v);
  if (!d) return '';
  if (d.length === 11) return isValidCpf(d) ? '' : 'Este CPF parece estar errado.';
  if (d.length === 14) return isValidCnpj(d) ? '' : 'Este CNPJ parece estar errado.';
  return 'Digite um CPF (11 números) ou CNPJ (14 números).';
}

/** Regras de senha exibidas ao vivo. */
export function passwordChecks(p) {
  const s = String(p || '');
  return [
    { ok: s.length >= 10, label: 'Pelo menos 10 caracteres' },
    { ok: /[A-Za-zÀ-ÿ]/.test(s), label: 'Tem letras' },
    { ok: /\d/.test(s), label: 'Tem números' },
  ];
}
export const passwordOk = (p) => passwordChecks(p).every((c) => c.ok);

/** (19) 91234-5678 */
export function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
