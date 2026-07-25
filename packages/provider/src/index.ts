/**
 * @matchday/provider — ProviderAdapter interface, ApiFootballAdapter, normalizers.
 *
 * Built in Task 7 against the cassettes captured in Task 6.
 *
 * Boundary (lint- and repo-check-enforced): importable ONLY from @matchday/jobs
 * and apps/web/app/api/{jobs,ops}. Browsers and app code never reach the provider —
 * all access flows adapter -> raw_payloads archive -> normalizers -> internal tables,
 * and app code addresses entities by internal UUID via provider_entity_map.
 */

import { DOMAIN_PACKAGE } from '@matchday/domain';

export const PROVIDER_DEPENDS_ON = DOMAIN_PACKAGE;

export const PROVIDER_PACKAGE = '@matchday/provider' as const;
