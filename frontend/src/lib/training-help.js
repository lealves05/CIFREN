// Gerado por tools/videos/gen-training.mjs (não edite à mão). Aula sugerida para a tela atual (botão "Aula" do topo).
const HELP = [];

/** Aula mais específica para a tela atual (maior prefixo de rota): { n, title } ou null. */
export function lessonFor(pathname) {
  let best = null; let len = -1;
  for (const [n, title, routes] of HELP) {
    for (const r of routes) {
      const hit = r === '/' ? pathname === '/' : pathname === r || pathname.startsWith(`${r}/`);
      if (hit && r.length > len) { best = { n, title }; len = r.length; }
    }
  }
  return best;
}
