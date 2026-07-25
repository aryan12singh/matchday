# scripts

Root-level tooling. Typechecked by `/tsconfig.json`, which exists specifically so these
files are covered — without it `scripts/` sits outside every project and a bad import
resolves to `undefined` at runtime instead of failing the build. That is how the matchday
drill originally shipped importing `DEFAULT_WEIGHTS` from the wrong package.

That tsconfig includes the `DOM` lib because `page.evaluate()` bodies in `ui-smoke.ts` are
compiled here but execute in the browser.

| Script | What |
|---|---|
| `repo-check.ts` | Structural invariants. First step of `pnpm check`. |
| `seed-dev-season.ts` | Fake 20-team, 3-matchweek season. Localhost only. |
| `matchday-drill.ts` | Predict → lock → settle → leaderboard → correction, end to end. |
| `ui-smoke.ts` | Drives a real browser through every page; writes `.screenshots/`. |
