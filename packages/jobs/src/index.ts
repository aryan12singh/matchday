/**
 * @matchday/jobs — job implementations, tick controller, advisory locks, sync runs,
 * quota ledger and circuit breaker.
 *
 * Built in Task 8; individual sync jobs land in Tasks 9 and 10.
 *
 * This is the only package permitted to import @matchday/provider.
 */

import { DOMAIN_PACKAGE } from '@matchday/domain';
import { PROVIDER_PACKAGE } from '@matchday/provider';

export const JOBS_DEPENDS_ON = [DOMAIN_PACKAGE, PROVIDER_PACKAGE] as const;

export const JOBS_PACKAGE = '@matchday/jobs' as const;
