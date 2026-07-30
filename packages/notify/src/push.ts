import webpush, { type PushSubscription, WebPushError } from 'web-push';

/**
 * Web push delivery.
 *
 * The service worker, the subscription table and the preferences screen have all existed
 * since the PWA work; nothing ever sent anything. This is the missing half.
 *
 * Delivery is best-effort by nature — a push endpoint can be gone, expired or simply
 * refuse — so every send reports its outcome rather than throwing. A reminder that fails
 * for one person must not stop the other nine going out, which is the whole reason the
 * caller gets a per-subscription result instead of a promise that rejects.
 */

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** mailto: address the push service can complain to. Required by the VAPID spec. */
  subject: string;
}

export interface PushTarget {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where clicking the notification should land. */
  url?: string;
  /** Collapses earlier notifications with the same tag, rather than stacking them. */
  tag?: string;
}

export type PushOutcome =
  | { status: 'sent'; targetId: string }
  | { status: 'expired'; targetId: string; statusCode: number }
  | { status: 'failed'; targetId: string; error: string };

export function configurePush(config: PushConfig): void {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

export function isPushConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/**
 * Sends one message to one subscription.
 *
 * 404 and 410 mean the subscription is dead — the browser was uninstalled, the user
 * revoked permission, the endpoint rotated. Those are reported as `expired` rather than
 * `failed` because the correct response is to delete the row, not to retry it forever.
 * Everything else is a transient failure worth leaving alone.
 */
export async function sendPush(
  target: PushTarget,
  message: PushMessage,
): Promise<PushOutcome> {
  const subscription: PushSubscription = {
    endpoint: target.endpoint,
    keys: target.keys,
  };

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: message.title,
        body: message.body,
        url: message.url ?? '/home',
        tag: message.tag,
      }),
      // A deadline reminder is worthless once the deadline has passed, so it is not worth
      // holding for a device that is offline for hours.
      { TTL: 60 * 30, urgency: 'high' },
    );
    return { status: 'sent', targetId: target.id };
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      return { status: 'expired', targetId: target.id, statusCode: error.statusCode };
    }
    return {
      status: 'failed',
      targetId: target.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Sends the same message to several subscriptions, one per device. */
export async function sendPushToAll(
  targets: readonly PushTarget[],
  message: PushMessage,
): Promise<PushOutcome[]> {
  return Promise.all(targets.map((target) => sendPush(target, message)));
}
