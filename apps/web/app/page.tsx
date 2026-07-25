import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Scaffold' };

/**
 * Task 1 placeholder. Its only job is to prove the design system is wired: the token
 * colours, the three font families, tabular numerals, the label treatment and the 44px
 * tap-target floor all resolve from design tokens with no hardcoded values.
 *
 * Replaced by the real Home screen (design/screens/Home v2.dc.html) in a later task.
 */
export default function ScaffoldPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <p className="label">Scaffold · Task 1</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">MatchDay</h1>
        <p className="text-text-2">
          Workspace, CI and design system are installed. Screens land in later tasks.
        </p>
      </header>

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <p className="label">Design tokens</p>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'accent · you', className: 'bg-accent text-on-accent' },
            { name: 'live · the game', className: 'bg-live text-on-live' },
            { name: 'surface', className: 'bg-surface text-text shadow-el-1' },
            { name: 'locked', className: 'bg-locked-dim text-locked' },
          ].map((swatch) => (
            <span
              key={swatch.name}
              className={`inline-flex min-h-tap items-center rounded-md px-4 font-display text-[11px] font-bold uppercase tracking-label ${swatch.className}`}
            >
              {swatch.name}
            </span>
          ))}
        </div>
        <p className="font-num text-[24px] font-bold tabular-nums">2:1 · 12 pts · 00:45:07</p>
      </section>
    </main>
  );
}
