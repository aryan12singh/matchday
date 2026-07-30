'use client';

import { useEffect, useState } from 'react';

import { removePushSubscription, savePushSubscription } from '../../app/(app)/settings/notifications/push-actions';

/**
 * Turning push on for this device.
 *
 * Subscription has to happen in the browser — only it holds the keys the push service
 * issues — so this is the one part of notifications that cannot live on the server.
 *
 * Three states worth distinguishing, because "it doesn't work" is useless feedback:
 * the browser cannot do push at all, the user has blocked it (which the page cannot undo
 * and must explain), or it simply is not on yet.
 */

type State = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on' | 'working';

export function EnablePush({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setState('unsupported');
      return;
    }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setState(existing ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [publicKey]);

  const enable = async () => {
    setError(null);
    setState('working');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that cannot be shown is not allowed.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const result = await savePushSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      });

      if (result.status === 'error') {
        // Roll the browser subscription back, or the device would be registered with the
        // push service while we have no record of it — a notification nobody can send.
        await subscription.unsubscribe().catch(() => undefined);
        setError(result.message);
        setState('off');
        return;
      }

      setState('on');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable notifications.');
      setState('off');
    }
  };

  const disable = async () => {
    setState('working');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      setState('on');
    }
  };

  if (state === 'checking') return null;

  if (state === 'unsupported') {
    return (
      <p className="text-[13px] text-text-3">
        This browser cannot show push notifications. Email reminders still work.
      </p>
    );
  }

  if (state === 'blocked') {
    return (
      <p className="text-[13px] text-text-3">
        Notifications are blocked for this site. Allow them in your browser settings, then
        reload this page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={state === 'on' ? disable : enable}
        disabled={state === 'working'}
        className={`min-h-tap self-start rounded-md px-4 font-display text-[11px] font-bold uppercase tracking-label transition-colors disabled:opacity-60 ${
          state === 'on'
            ? 'border border-line text-text-2 hover:border-line-2 hover:text-text'
            : 'bg-accent text-on-accent'
        }`}
      >
        {state === 'working'
          ? 'Working…'
          : state === 'on'
            ? 'Turn off on this device'
            : 'Enable on this device'}
      </button>

      {state === 'on' ? (
        <p className="text-[13px] text-text-3">
          This device will get reminders. Each device is registered separately.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * VAPID keys are distributed base64url; `applicationServerKey` wants raw bytes.
 *
 * Browsers accept a Uint8Array here and reject the string, silently in some and with an
 * unhelpful InvalidCharacterError in others.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  // Allocated through ArrayBuffer so the result is a plain BufferSource. A
  // Uint8Array<ArrayBufferLike> does not satisfy applicationServerKey's type under
  // TypeScript 5.9's stricter typed-array generics.
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return buffer;
}
