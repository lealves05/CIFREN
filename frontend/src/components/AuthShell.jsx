import { Logo } from './Brand';

/** Moldura das telas de entrada e cadastro. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <div className="hidden flex-1 flex-col justify-between bg-brand p-10 text-brand-fg md:flex">
        <Logo light />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Suas contas em dia, sem complicação.</h2>
          <p className="mt-3 text-brand-fg/75">Veja o que tem para pagar e receber, quanto tem em caixa e como fica o mês — tudo num lugar só.</p>
          <div className="mt-8 flex gap-2" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-accent" /><span className="h-1.5 w-6 rounded-full bg-cta" /><span className="h-1.5 w-3 rounded-full bg-brand-fg/30" />
          </div>
        </div>
        <p className="text-xs text-brand-fg/60">CIFREN · Gestão Financeira · um sistema LORLER</p>
      </div>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-faint">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
