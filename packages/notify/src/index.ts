/**
 * @matchday/notify — notification service + templates (push, email, ICS).
 *
 * Delivery (push) and copy (templates) are separated so the wording can be tested without
 * a push service, and so a second channel can reuse it unchanged.
 */

import { DOMAIN_PACKAGE } from '@matchday/domain';

export const NOTIFY_DEPENDS_ON = DOMAIN_PACKAGE;

export * from './push';
export * from './templates';

export const NOTIFY_PACKAGE = '@matchday/notify' as const;
