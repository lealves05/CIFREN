// Vídeo-aulas narradas do CIFREN — gerado por tools/videos/gen-training.mjs (não edite à mão; ajuste lessons.mjs).
// Arquivos em /public/treinamento/<file>.mp4 (narração + legenda na imagem), -capa.jpg, .jpg e .vtt (transcrição).
// `routes`: telas em que a aula é sugerida como ajuda; `text`: falas (busca e transcrição) 
export const MODULES = [
  {
    "key": "inicio",
    "label": "Primeiros passos"
  },
  {
    "key": "financeiro",
    "label": "Contas a pagar e a receber"
  },
  {
    "key": "banco",
    "label": "Bancos e conciliação"
  },
  {
    "key": "associados",
    "label": "Associados e mensalidades"
  },
  {
    "key": "compras",
    "label": "Compras e despesas"
  },
  {
    "key": "relatorios",
    "label": "Relatórios"
  },
  {
    "key": "config",
    "label": "Configurações e suporte"
  }
];

export const LESSONS = [];

export const TOTAL_SECONDS = 0;

export const videoUrl = (l) => `/treinamento/${l.file}.mp4`;
export const posterUrl = (l) => `/treinamento/${l.file}-capa.jpg`;
export const thumbUrl = (l) => `/treinamento/${l.file}.jpg`;
export const captionsUrl = (l) => `/treinamento/${l.file}.vtt`;
export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
