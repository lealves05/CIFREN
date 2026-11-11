// Gera frontend/src/lib/training.js (lista completa, com o texto das falas para a busca) e training-help.js (só as rotas, para o link "Aula" do topo)
// a partir do roteiro (lessons.mjs) e das durações finais dos vídeos; só entram as aulas cujo vídeo já está em frontend/public/treinamento.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { LESSONS, MODULES } from './lessons.mjs';
const PUB = fileURLToPath(new URL('../../frontend/public/treinamento', import.meta.url));
const LIB = fileURLToPath(new URL('../../frontend/src/lib', import.meta.url));
const dur = (f) => {
  try { return Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${PUB}/${f}.mp4`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch { return 60; }
};
const chunks = (say) => (Array.isArray(say) ? say : say ? [say] : []);
const fresh = LESSONS.filter((l) => fs.existsSync(`${PUB}/${l.file}.mp4`)).map((l) => ({ n: l.n, file: l.file, mod: l.mod, s: dur(l.file), title: l.title, routes: l.routes, desc: l.desc, learn: l.learn,
  text: l.steps.flatMap((s) => chunks(s.say)).join(' ') }));
const nums = fresh.map((l) => l.n);
if (new Set(nums).size !== nums.length) throw new Error('número de aula repetido');
const lessons = [...fresh].sort((a, b) => a.n - b.n);
const total = lessons.reduce((a, l) => a + l.s, 0);
const src = `// Vídeo-aulas narradas do CIFREN — gerado por tools/videos/gen-training.mjs (não edite à mão; ajuste lessons.mjs).
// Arquivos em /public/treinamento/<file>.mp4 (narração + legenda na imagem), -capa.jpg, .jpg e .vtt (transcrição).
// \`routes\`: telas em que a aula é sugerida como ajuda; \`text\`: falas (busca e transcrição) 
export const MODULES = ${JSON.stringify(MODULES, null, 2)};

export const LESSONS = ${JSON.stringify(lessons, null, 2)};

export const TOTAL_SECONDS = ${total};

export const videoUrl = (l) => \`/treinamento/\${l.file}.mp4\`;
export const posterUrl = (l) => \`/treinamento/\${l.file}-capa.jpg\`;
export const thumbUrl = (l) => \`/treinamento/\${l.file}.jpg\`;
export const captionsUrl = (l) => \`/treinamento/\${l.file}.vtt\`;
export const fmtDur = (s) => \`\${Math.floor(s / 60)}:\${String(Math.floor(s % 60)).padStart(2, '0')}\`;
`;
fs.writeFileSync(`${LIB}/training.js`, src);
// índice leve para o link "Aula" do topo (Layout), sem os textos das aulas, para não pesar o carregamento inicial
const idx = `// Gerado por tools/videos/gen-training.mjs (não edite à mão). Aula sugerida para a tela atual (link "Aula" do topo).
const HELP = ${JSON.stringify(lessons.map((l) => [l.n, l.title, l.routes]))};

/** Aula mais específica para a tela atual (maior prefixo de rota): { n, title } ou null. */
export function lessonFor(pathname) {
  let best = null; let len = -1;
  for (const [n, title, routes] of HELP) {
    for (const r of routes) {
      const hit = r === '/' ? pathname === '/' : pathname === r || pathname.startsWith(\`\${r}/\`);
      if (hit && r.length > len) { best = { n, title }; len = r.length; }
    }
  }
  return best;
}
`;
fs.writeFileSync(`${LIB}/training-help.js`, idx);
console.log(lessons.length, 'aulas,', Math.round(total / 60), 'min');
