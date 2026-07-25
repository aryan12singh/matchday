'use client';

import { useEffect, useState } from 'react';

import { Button } from '../ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'matchday-install-dismissed';

/**
 * Install prompt.
 *
 * Shown once, dismissible, and never again once dismissed. An install banner that
 * reappears every session is the single most annoying pattern on the mobile web, and this
 * is an app people open several times a matchday.
 *
 * iOS fires no beforeinstallprompt at all, so Safari users get the manual instructions on
 * /install instead — linked from settings rather than pushed at them.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Already installed: standalone display mode means there is nothing to offer.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!deferred) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Install MatchDay"
      className="fixed inset-x-4 bottom-24 z-40 flex flex-col gap-3 rounded-md bg-surface px-5 py-4 shadow-el-3 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80"
    >
      <p className="font-display text-[14px] font-bold">Add MatchDay to your home screen</p>
      <p className="text-[13px] text-text-2">
        Opens full screen, and deadline reminders can reach you.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            dismiss();
          }}
        >
          Install
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
