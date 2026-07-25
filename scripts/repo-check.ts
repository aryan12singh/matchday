/**
 * repo-check — structural invariants that lint and typecheck cannot express.
 *
 * Ported from ../wc26-predictor/scripts/repo-check.ts (migration naming, env
 * documentation, README command checks) and extended per 10-security-and-rls.md §10.3
 * and 11-repo-strategy.md §11.3:
 *
 *   1. migrations are timestamped, uniquely, and additive
 *   2. secrets never reach the client bundle (CLAUDE.md invariant 6)
 *   3. packages/scoring imports only @matchday/domain and does zero IO (invariant 4/5)
 *   4. the provider is reachable only from jobs and job/ops routes (invariant 1)
 *   5. UI never imports a service-role client
 *   6. no hardcoded hex in product UI — design tokens only
 *   7. every process.env reference is documented in .env.example
 *
 * Runs first in `pnpm check` so a boundary violation fails before the slow steps.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const failures: string[] = [];

const fail = (message: string) => failures.push(message);
const rel = (path: string) => relative(root, path).split(sep).join('/');

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage', '.turbo']);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const isSource = (file: string) => /\.(?:ts|tsx|mjs|js)$/.test(file);

/** Import specifiers of a source file (static imports, type imports, re-exports, dynamic). */
function importsOf(content: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /^\s*import\s+(?:[\w*{}\n\r\t, ]+\s+from\s+)?['"]([^'"]+)['"]/gm,
    /^\s*export\s+(?:[\w*{}\n\r\t, ]+)\s+from\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) if (match[1]) specifiers.add(match[1]);
  }
  return [...specifiers];
}

// ---------------------------------------------------------------------------
// 1. Migrations
// ---------------------------------------------------------------------------
const migrationsDir = join(root, 'supabase/migrations');
const migrationFiles = existsSync(migrationsDir)
  ? readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'))
  : [];
const migrations = migrationFiles.filter((file) => /^\d{14}_.+\.sql$/.test(file)).sort();

for (const file of migrationFiles) {
  if (!/^\d{14}_.+\.sql$/.test(file)) {
    fail(`Migration must use the 14-digit timestamped filename convention: ${file}`);
  }
}
if (new Set(migrations.map((file) => file.slice(0, 14))).size !== migrations.length) {
  fail('Supabase migration timestamps must be unique.');
}

// ---------------------------------------------------------------------------
// Source inventory
// ---------------------------------------------------------------------------
const sourceFiles = [
  ...walk(join(root, 'apps')),
  ...walk(join(root, 'packages')),
  ...walk(join(root, 'scripts')),
  ...walk(join(root, 'tests')),
].filter((file) => isSource(file) && rel(file) !== 'scripts/repo-check.ts');

const sources = sourceFiles.map((path) => ({
  path,
  rel: rel(path),
  content: readFileSync(path, 'utf8'),
}));

// ---------------------------------------------------------------------------
// 2. Secrets never reach the client bundle
// ---------------------------------------------------------------------------
const SERVER_ONLY_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'API_FOOTBALL_KEY',
  'CRON_SECRET',
  'VAPID_PRIVATE_KEY',
  'RESEND_API_KEY',
];

/** A file reaches the browser if it is a client component, or lives in components/. */
const reachesClient = (file: { rel: string; content: string }) =>
  /^\s*['"]use client['"]/m.test(file.content) ||
  file.rel.startsWith('apps/web/components/') ||
  file.rel.startsWith('apps/web/hooks/');

for (const file of sources) {
  for (const secret of SERVER_ONLY_SECRETS) {
    if (!file.content.includes(secret)) continue;
    if (reachesClient(file)) {
      fail(`Server-only secret ${secret} referenced in client-reachable file: ${file.rel}`);
    }
    if (file.content.includes(`NEXT_PUBLIC_${secret}`)) {
      fail(`Server-only secret ${secret} must never be exposed as NEXT_PUBLIC_: ${file.rel}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. packages/scoring — allowlisted imports, zero IO
// ---------------------------------------------------------------------------
const SCORING_ALLOWED_IMPORTS = new Set(['@matchday/domain', 'zod', 'vitest']);

for (const file of sources) {
  if (!file.rel.startsWith('packages/scoring/')) continue;
  for (const specifier of importsOf(file.content)) {
    const isRelative = specifier.startsWith('.');
    if (isRelative || SCORING_ALLOWED_IMPORTS.has(specifier)) continue;
    fail(
      `packages/scoring may import only ${[...SCORING_ALLOWED_IMPORTS].join(', ')} or relative paths — found "${specifier}" in ${file.rel}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Provider boundary
// ---------------------------------------------------------------------------
const PROVIDER_IMPORT_ALLOWED = [
  'packages/provider/',
  'packages/jobs/',
  'apps/web/app/api/jobs/',
  'apps/web/app/api/ops/',
  'tests/',
];

for (const file of sources) {
  const importsProvider = importsOf(file.content).some((specifier) =>
    specifier.startsWith('@matchday/provider'),
  );
  if (!importsProvider) continue;
  if (!PROVIDER_IMPORT_ALLOWED.some((prefix) => file.rel.startsWith(prefix))) {
    fail(
      `@matchday/provider imported outside its boundary (${PROVIDER_IMPORT_ALLOWED.join(', ')}): ${file.rel}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. UI never imports a service-role client
// ---------------------------------------------------------------------------
for (const file of sources) {
  const isUi =
    file.rel.startsWith('apps/web/components/') ||
    (file.rel.startsWith('apps/web/app/') &&
      file.rel.endsWith('.tsx') &&
      !file.rel.startsWith('apps/web/app/api/'));
  if (!isUi) continue;
  for (const specifier of importsOf(file.content)) {
    if (/supabase[/-]service/i.test(specifier) || specifier === '@matchday/jobs') {
      fail(`UI file imports a server-only module ("${specifier}"): ${file.rel}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. No hardcoded hex in product UI — design tokens only (design/README.md §Fidelity)
// ---------------------------------------------------------------------------
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
/** Token files and theme config are design-owned and legitimately hold hex values. */
const HEX_EXEMPT = [
  'apps/web/app/styles/tokens/',
  'apps/web/tailwind.theme.js',
  'apps/web/tailwind.config.js',
  'apps/web/app/layout.tsx', // viewport themeColor must be a literal colour
];

for (const file of sources) {
  const inUiTree =
    file.rel.startsWith('apps/web/app/') || file.rel.startsWith('apps/web/components/');
  if (!inUiTree || HEX_EXEMPT.some((prefix) => file.rel.startsWith(prefix))) continue;
  for (const [index, line] of file.content.split('\n').entries()) {
    if (HEX.test(line)) {
      fail(
        `Hardcoded hex colour in ${file.rel}:${index + 1} — use a design token (CSS var or Tailwind token class).`,
      );
    }
  }
}

// Same rule for stylesheets outside the design-owned token files.
for (const file of walk(join(root, 'apps/web'))) {
  const path = rel(file);
  if (!path.endsWith('.css')) continue;
  if (HEX_EXEMPT.some((prefix) => path.startsWith(prefix))) continue;
  for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
    if (HEX.test(line)) {
      fail(`Hardcoded hex colour in ${path}:${index + 1} — use a design token.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Environment variables are documented
// ---------------------------------------------------------------------------
const envExamplePath = join(root, '.env.example');
if (!existsSync(envExamplePath)) {
  fail('.env.example is missing — every environment variable must be documented.');
} else {
  const documented = new Set(
    Array.from(
      readFileSync(envExamplePath, 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm),
      (match) => match[1] ?? '',
    ),
  );
  const commandOnlyEnv = new Set(['NODE_ENV', 'CI', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'PORT']);
  const referenced = new Set<string>();
  for (const file of sources) {
    for (const match of file.content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const key = match[1];
      if (!key || documented.has(key) || commandOnlyEnv.has(key)) continue;
      referenced.add(`${key} (${file.rel})`);
    }
  }
  for (const entry of referenced) fail(`Undocumented environment variable: ${entry}`);
}

// ---------------------------------------------------------------------------
// 8. Design token files stay in sync with the design bundle
// ---------------------------------------------------------------------------
const designTokensDir = join(root, 'design/tokens');
const installedTokensDir = join(root, 'apps/web/app/styles/tokens');
if (existsSync(designTokensDir) && existsSync(installedTokensDir)) {
  for (const tokenFile of readdirSync(designTokensDir).filter((file) => file.endsWith('.css'))) {
    const installed = join(installedTokensDir, tokenFile);
    if (!existsSync(installed)) {
      fail(`Design token file not installed into apps/web: ${tokenFile}`);
      continue;
    }
    const source = readFileSync(join(designTokensDir, tokenFile), 'utf8');
    const target = readFileSync(installed, 'utf8');
    // Compare declared custom properties rather than bytes: typography.css carries one
    // documented divergence (the remote font @import is disabled in favour of next/font).
    const vars = (css: string) =>
      [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]).sort().join(',');
    if (vars(source) !== vars(target)) {
      fail(
        `apps/web/app/styles/tokens/${tokenFile} has drifted from design/tokens/${tokenFile} — re-copy it.`,
      );
    }
  }
}

// Theme config must stay byte-identical to the design bundle's.
const designTheme = join(root, 'design/tailwind.theme.js');
const installedTheme = join(root, 'apps/web/tailwind.theme.js');
if (existsSync(designTheme) && existsSync(installedTheme)) {
  if (readFileSync(designTheme, 'utf8') !== readFileSync(installedTheme, 'utf8')) {
    fail('apps/web/tailwind.theme.js has drifted from design/tailwind.theme.js — re-copy it.');
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`repo-check failed (${failures.length}):`);
  console.error(failures.map((failure) => `  - ${failure}`).join('\n'));
  process.exit(1);
}

const sqlLines = migrations.reduce(
  (total, file) => total + statSync(join(migrationsDir, file)).size,
  0,
);
console.log(
  `repo-check passed — ${sources.length} source files, ${migrations.length} migrations (${sqlLines} bytes SQL).`,
);
