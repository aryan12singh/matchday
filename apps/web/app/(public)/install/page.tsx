import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Install' };

/**
 * Manual install instructions.
 *
 * iOS fires no beforeinstallprompt, so Safari users cannot be offered a button — they
 * need to be told where the menu item is. Android is covered by the prompt but the steps
 * are here too, for anyone who dismissed it.
 */
export default function InstallPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="label">Install</p>
        <h1 className="font-display text-[28px] font-extrabold leading-tight">
          Put MatchDay on your home screen
        </h1>
        <p className="text-text-2">
          It opens full screen, loads faster, and can send deadline reminders.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="label">iPhone or iPad — Safari</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] text-text-2">
          <li>Tap the Share button in the toolbar.</li>
          <li>Scroll down and choose <span className="text-text">Add to Home Screen</span>.</li>
          <li>Tap Add.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Android — Chrome</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] text-text-2">
          <li>Tap the three-dot menu.</li>
          <li>Choose <span className="text-text">Install app</span> or Add to Home screen.</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Desktop — Chrome or Edge</h2>
        <p className="text-[14px] text-text-2">
          Click the install icon at the right of the address bar.
        </p>
      </section>
    </main>
  );
}
