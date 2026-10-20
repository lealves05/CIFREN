/** localStorage só para preferências não sensíveis (ex.: empresa escolhida no filtro). */
export function readPref(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function writePref(key, value) {
  try {
    if (value == null || value === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* navegador sem armazenamento: segue sem lembrar */ }
}
