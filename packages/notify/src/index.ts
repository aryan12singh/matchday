/**
 * @matchday/notify — notification service + templates (push, email, ICS).
 *
 * Built in Task 20 (post-launch wave). Scaffolded now so the boundary rules and
 * workspace graph are complete from Task 1.
 */

import { DOMAIN_PACKAGE } from '@matchday/domain';

export const NOTIFY_DEPENDS_ON = DOMAIN_PACKAGE;

export const NOTIFY_PACKAGE = '@matchday/notify' as const;
