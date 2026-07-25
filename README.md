# MatchDay

Season-long football prediction platform for private leagues. First competition:
Premier League 2026/27.

## Getting started

Requires Node 22+ and pnpm 10.

```bash
pnpm install
cp .env.example .env.local   # fill in as tasks need them
pnpm dev                     # http://localhost:3000
```

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Next.js dev server (`apps/web`) |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint across the workspace, including the import-boundary rules |
| `pnpm typecheck` | `tsc --noEmit` in every package, in parallel |
| `pnpm test` | Vitest |
| `pnpm repo:check` | Structural invariants — migrations, secrets, boundaries, design tokens |
| `pnpm check` | All of the above, in order. Must be green before any commit. |
| `pnpm db:start` / `db:reset` | Local Supabase stack; reset applies migrations + seed |
| `pnpm db:test` | pgTAP: locks, immutability, RLS, leagues, selection, predictions |
| `pnpm db:types` | Regenerate `packages/domain/src/database.types.ts` after a migration |
| `pnpm db:seed:dev` | Fake 20-team, 3-matchweek season so the app is usable without the provider |
| `pnpm drill` | Full matchday drill: predict → lock → settle → leaderboard → correction |

## Layout

```
apps/web/          Next.js 15 App Router app — the only deployable
packages/domain    Entity types + zod schemas. Leaf package.
packages/scoring   Pure settlers, aggregation, tiebreaks. Imports only domain. Zero IO.
packages/provider  ProviderAdapter + ApiFootballAdapter + normalizers. Jobs and job routes only.
packages/jobs      Job implementations, tick controller, locks, sync runs, quota ledger
packages/notify    Notifications + templates
supabase/          Migrations (additive, forward-only) and seed data
design/            Design system bundle — ground truth for all UI
docs/discovery/    Architecture source of truth
docs/plan/         Live launch calendar
tests/             Integration tests
scripts/           repo-check and ops tooling
```

## Running it locally

```bash
supabase start
pnpm db:reset            # migrations + market types + rule set v1
pnpm db:seed:dev         # a fake season to predict against
pnpm dev
```

Then sign up, create a league, and predict. `pnpm drill` exercises the whole spine
end to end against the same database and exits non-zero on the first failure, so it
can gate a deploy.

## Rules worth knowing before you edit anything

- `docs/discovery/` is the source of truth for architecture. Read `00-START-HERE.md`, then
  `15-owner-decisions-addendum.md` — it supersedes files 03–14 where they conflict.
- Work happens on branches only; `main` is merged by the repo owner.
- Import boundaries are enforced twice: ESLint for editor feedback, `scripts/repo-check.ts`
  as the hard gate. Provider access never reaches the browser.
- No hardcoded hex in UI — design tokens only. `repo-check` fails the build on it.
- `apps/web/app/styles/tokens/` and `apps/web/tailwind.theme.js` are verbatim copies of
  `design/`. Re-copy when the bundle updates; never hand-edit.
- Migrations are additive and forward-only. Never edit an applied migration.
