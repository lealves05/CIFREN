/** Envio de arquivos: tudo vira base64 no navegador (FileReader) antes de ir para a API. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // documentos (notas, comprovantes, fotos)
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024; // extratos OFX/CSV

export const DOC_ACCEPT = '.pdf,.xml,.jpg,.jpeg,.png,application/pdf,text/xml,application/xml,image/jpeg,image/png';
export const STATEMENT_ACCEPT = '.ofx,.csv,.txt,application/x-ofx,text/csv,text/plain';

export function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Retorna texto do problema ou '' se o arquivo pode seguir. */
export function checkFile(file, { max = MAX_DOC_BYTES, kinds } = {}) {
  if (!file) return 'Escolha um arquivo.';
  if (file.size > max) return `“${file.name}” tem ${fileSize(file.size)}. O limite é ${fileSize(max)}. Diminua a foto ou envie um PDF menor.`;
  if (kinds) {
    const name = file.name.toLowerCase();
    if (!kinds.some((k) => name.endsWith(k))) return `Formato não aceito: ${file.name}. Use ${kinds.join(', ')}.`;
  }
  return '';
}

/** Lê o arquivo e devolve só o conteúdo em base64 (sem o prefixo data:). */
export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo no seu aparelho.'));
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

/** Tipo MIME com reserva pela extensão (alguns celulares mandam vazio). */
export function mimeOf(file) {
  if (file?.type) return file.type;
  const n = String(file?.name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.xml')) return 'application/xml';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export const DOC_KINDS = ['.pdf', '.xml', '.jpg', '.jpeg', '.png'];
export const STATEMENT_KINDS = ['.ofx', '.csv', '.txt'];
