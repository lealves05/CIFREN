export const DOC_KIND = {
  nfe: 'NF-e (nota fiscal)',
  nfce: 'NFC-e (cupom)',
  boleto: 'Boleto',
  pix: 'Pix',
  comprovante: 'Comprovante',
  imagem: 'Foto',
  pdf: 'PDF',
  outro: 'Outro',
};
export const DOC_STATUS = {
  recebido: { label: 'Recebido', tone: 'neutral' },
  processado: { label: 'Lido', tone: 'brand' },
  aguardando_ia: { label: 'Aguardando leitura', tone: 'warn' },
  vinculado: { label: 'Lançado', tone: 'positive' },
  descartado: { label: 'Descartado', tone: 'neutral' },
};
export const SOURCE_LABEL = { xml: 'XML da nota', boleto: 'Linha digitável', pix: 'Pix copia-e-cola', nfce: 'QR da NFC-e', ia: 'Leitura por IA' };
export const docKindLabel = (k) => DOC_KIND[k] || k || 'Documento';
export const docStatus = (s) => DOC_STATUS[s] || { label: s || '—', tone: 'neutral' };
