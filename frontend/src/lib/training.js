// Vídeo-aulas narradas do CIFREN — gerado por tools/videos/gen-training.mjs (não edite à mão; ajuste tools/videos/lessons.mjs).
// Arquivos em /public/treinamento/<file>.mp4 (narração + legenda na imagem), .vtt (transcrição), -capa.jpg e .jpg (miniatura).
// `routes`: telas em que a aula é sugerida no botão "Aula"; `text`: falas (busca).
export const MODULES = [];

export const LESSONS = [];

export const TOTAL_SECONDS = 0;

export const videoUrl = (l) => `/treinamento/${l.file}.mp4`;
export const posterUrl = (l) => `/treinamento/${l.file}-capa.jpg`;
export const thumbUrl = (l) => `/treinamento/${l.file}.jpg`;
export const captionsUrl = (l) => `/treinamento/${l.file}.vtt`;
export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
