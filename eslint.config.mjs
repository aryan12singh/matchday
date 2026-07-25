import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

/**
 * Import boundaries are enforced twice on purpose: here for editor feedback, and in
 * scripts/repo-check.ts as the hard gate (repo-check uses allowlists, so it also
 * catches imports nobody has thought to deny yet). See 11-repo-strategy.md §11.3 and
 * CLAUDE.md invariants 1 and 6.
 */

/** Modules that mean IO. `packages/scoring` must contain none of them. */
const IO_MODULES = [
  'node:fs',
  'node:fs/promises',
  'node:net',
  'node:http',
  'node:https',
  'node:dns',
  'node:child_process',
  'node:worker_threads',
  'fs',
  'net',
  'http',
  'https',
  'child_process',
];

const restricted = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/web/public/**',
      // Design-owned: the bundle is reference material and a verbatim copy of its
      // theme. repo-check guards that the copies stay in sync; lint does not own them.
      'design/**',
      'apps/web/tailwind.theme.js',
      'apps/web/app/styles/tokens/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---------------------------------------------------------------------------
  // Boundary: packages/scoring imports only @matchday/domain, and performs zero IO.
  // ---------------------------------------------------------------------------
  {
    files: ['packages/scoring/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // `paths` matches exact specifiers — `patterns` uses gitignore-style globs,
          // which do not reliably match the `node:` prefix.
          paths: IO_MODULES.map((name) => ({
            name,
            message: 'packages/scoring is zero-IO — settlers must stay pure and re-runnable.',
          })),
          patterns: [
            {
              group: ['@matchday/provider', '@matchday/jobs', '@matchday/notify', '@matchday/web'],
              message:
                'packages/scoring may import only @matchday/domain (11-repo-strategy.md §11.3).',
            },
            {
              group: ['next', 'next/*', 'react', 'react-dom', '@supabase/*'],
              message: 'packages/scoring is framework- and database-free.',
            },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Boundary: packages/domain is a leaf — it imports no workspace package.
  // ---------------------------------------------------------------------------
  {
    files: ['packages/domain/**/*.ts'],
    rules: restricted([
      {
        group: ['@matchday/*'],
        message: 'packages/domain is the leaf package — it depends on nothing in the workspace.',
      },
    ]),
  },

  // ---------------------------------------------------------------------------
  // Boundary: the football provider is reachable only from jobs and job/ops routes.
  // Browsers and app code never call the provider (CLAUDE.md invariant 1).
  // ---------------------------------------------------------------------------
  // NOTE: flat config is last-match-wins per rule, so this block must not cover
  // packages/domain or packages/scoring — it would replace their stricter rules above.
  // Both already deny @matchday/provider in their own blocks.
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/notify/**/*.ts'],
    rules: restricted([
      {
        group: ['@matchday/provider', '@matchday/provider/*'],
        message:
          'Provider access is allowed only from packages/jobs and apps/web/app/api/{jobs,ops}. Read internal tables instead.',
      },
    ]),
  },
  {
    files: ['apps/web/app/api/jobs/**/*.ts', 'apps/web/app/api/ops/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // ---------------------------------------------------------------------------
  // Boundary: UI never imports the service-role Supabase client or the jobs package.
  // ---------------------------------------------------------------------------
  {
    files: ['apps/web/components/**/*.{ts,tsx}', 'apps/web/app/**/*.tsx'],
    rules: restricted([
      {
        group: [
          '**/lib/supabase/service',
          '**/lib/supabase/service*',
          '@matchday/jobs',
          '@matchday/provider',
        ],
        message:
          'Components and pages use the anon/SSR Supabase client only. Service-role access stays in route handlers and jobs.',
      },
    ]),
  },

  // ---------------------------------------------------------------------------
  // Next.js app rules.
  // ---------------------------------------------------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router only — there is no pages/ directory to cross-check against.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // Config and script files run in Node and may use CommonJS / console.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', 'scripts/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
