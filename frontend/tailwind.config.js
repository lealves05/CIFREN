/** @type {import('tailwindcss').Config} */
const withVar = (v) => `rgb(var(${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: withVar('--primary'), fg: withVar('--primary-fg') },
        brand: { DEFAULT: withVar('--brand'), fg: withVar('--brand-fg'), soft: withVar('--brand-soft') },
        accent: { DEFAULT: withVar('--accent'), fg: withVar('--accent-fg') },
        cta: { DEFAULT: withVar('--cta'), fg: withVar('--cta-fg') },
        positive: withVar('--positive'),
        danger: { DEFAULT: withVar('--danger'), soft: withVar('--danger-soft') },
        warn: { DEFAULT: withVar('--warn'), soft: withVar('--warn-soft') },
        bg: withVar('--bg'),
        surface: withVar('--surface'),
        muted: withVar('--muted'),
        line: withVar('--line'),
        ink: { DEFAULT: withVar('--ink'), soft: withVar('--ink-soft'), faint: withVar('--ink-faint') },
      },
      borderRadius: { app: 'var(--radius)', 'app-sm': 'calc(var(--radius) * 0.6)' },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.05)' },
    },
  },
  plugins: [],
};
