-- Seed data: the market_types catalog and rule_sets v1.
--
-- Idempotent — every insert is an upsert on a natural key, so `supabase db reset` and a
-- production re-seed behave identically.
--
-- Fixture markets model the old app's composite entry form: the user fills in one card
-- per fixture, but the pieces they may hedge independently (goal difference, total goals,
-- both-teams-to-score) are separate markets so settlement and analytics can address them.
-- A null value on a hedge market means "derive it from my scoreline", which is exactly
-- the `pred_goal_diff ?? (ph - pa)` semantics in ../wc26-predictor/lib/scoring.ts.

insert into public.market_types (code, scope, answer_schema, settler, display, active)
values
  (
    'correct_score', 'fixture',
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('home', 'away'),
      'properties', jsonb_build_object(
        'home', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 99),
        'away', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 99))),
    'settle_correct_score',
    jsonb_build_object('label', 'Scoreline', 'order', 1, 'widget', 'score_stepper'),
    true
  ),
  (
    'goal_diff', 'fixture',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'value', jsonb_build_object('type', array['integer', 'null']))),
    'settle_goal_diff',
    jsonb_build_object('label', 'Goal difference', 'order', 2, 'widget', 'stepper', 'hedgeable', true),
    true
  ),
  (
    'total_goals', 'fixture',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'value', jsonb_build_object('type', array['integer', 'null'], 'minimum', 0))),
    'settle_total_goals',
    jsonb_build_object('label', 'Total goals', 'order', 3, 'widget', 'stepper', 'hedgeable', true),
    true
  ),
  (
    'btts', 'fixture',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'value', jsonb_build_object('type', array['boolean', 'null']))),
    'settle_btts',
    jsonb_build_object('label', 'Both teams to score', 'order', 4, 'widget', 'toggle', 'hedgeable', true),
    true
  ),
  (
    'first_scoring_team', 'fixture',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'team_id', jsonb_build_object('type', array['string', 'null'], 'format', 'uuid'),
        'none', jsonb_build_object('type', 'boolean'))),
    'settle_first_scoring_team',
    jsonb_build_object('label', 'First goal', 'order', 5, 'widget', 'team_choice'),
    true
  ),
  (
    'first_goalscorer', 'fixture',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'player_id', jsonb_build_object('type', array['string', 'null'], 'format', 'uuid'),
        'none', jsonb_build_object('type', 'boolean'))),
    'settle_first_goalscorer',
    jsonb_build_object('label', 'First scorer', 'order', 6, 'widget', 'squad_search'),
    true
  ),
  -- Addendum §C: the season-long game. A separate lowest-wins competition — never merged
  -- into weekly or overall points (invariant 8).
  (
    'season_table', 'season',
    jsonb_build_object('type', 'team_ranking', 'team_count', 20),
    'settle_season_table',
    jsonb_build_object('label', 'Season table', 'order', 1, 'widget', 'table_reorder',
                       'competition', 'table_race', 'lowest_wins', true),
    true
  ),
  (
    'season_golden_boot', 'season',
    jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('player_id'),
      'properties', jsonb_build_object(
        'player_id', jsonb_build_object('type', 'string', 'format', 'uuid'))),
    'settle_golden_boot',
    jsonb_build_object('label', 'Golden Boot', 'order', 2, 'widget', 'squad_search'),
    true
  )
on conflict (code) do update
  set scope = excluded.scope,
      answer_schema = excluded.answer_schema,
      settler = excluded.settler,
      display = excluded.display,
      active = excluded.active;

-- ---------------------------------------------------------------------------
-- Rule set v1 — the ported WC engine, unchanged (addendum §A, "Scoring v1").
--
-- Weights are the old app's DEFAULT_WEIGHTS from ../wc26-predictor/lib/scoring.ts, not
-- its POINTS constants. The two differ in exactly one place: `team_goals` scores 1 point
-- in POINTS but carries weight 0 in DEFAULT_WEIGHTS ("off by default; leagues opt in via
-- admin weight editor"). Matching DEFAULT_WEIGHTS is what makes this a faithful port and
-- is what makes it a *seven*-category engine, as the addendum calls it — team_goals is a
-- settled eighth category held at zero so a league can switch it on later without any
-- re-settlement, which is the whole point of the two-phase model.
--
-- The tiebreak chain is copied verbatim from compareLeaderboard() in
-- ../wc26-predictor/lib/leaderboard.ts. Accuracy decides everything first; the number of
-- predictions submitted is the very last decider, so entering more fixtures only helps
-- once every accuracy category is level.
-- ---------------------------------------------------------------------------
insert into public.rule_sets (id, name, description)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'MatchDay Classic',
  'The seven-category engine carried over from the World Cup 2026 app.'
)
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into public.rule_set_versions (rule_set_id, version, engine_version, definition, notes)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  1,
  '1.0.0',
  jsonb_build_object(
    'categories', jsonb_build_object(
      'outcome',      jsonb_build_object('enabled', true, 'weight', 3, 'label', 'Correct outcome'),
      'exact',        jsonb_build_object('enabled', true, 'weight', 3, 'label', 'Exact scoreline'),
      'goal_diff',    jsonb_build_object('enabled', true, 'weight', 2, 'label', 'Goal difference'),
      'total_goals',  jsonb_build_object('enabled', true, 'weight', 1, 'label', 'Total goals'),
      'team_goals',   jsonb_build_object('enabled', true, 'weight', 0, 'label', 'A team''s exact goals'),
      'btts',         jsonb_build_object('enabled', true, 'weight', 1, 'label', 'Both teams scored'),
      'first_team',   jsonb_build_object('enabled', true, 'weight', 2, 'label', 'First-goal team'),
      'first_scorer', jsonb_build_object('enabled', true, 'weight', 4, 'label', 'First scorer')),
    'params', jsonb_build_object(
      -- Consolation only when the exact scoreline was missed (old-app parity).
      'team_goals_only_when_exact_missed', true,
      -- Own goals are excluded from "first scorer" (05-domain-model.md §5.2).
      'first_scorer_excludes_own_goals', true),
    'tiebreaks', jsonb_build_array(
      'points', 'outcome', 'exact', 'goal_diff', 'total_goals',
      'btts', 'first_team', 'first_scorer', 'submissions')),
  'Seeded v1. Immutable: mid-season changes create a new version bound with effective_from_round.'
)
on conflict (rule_set_id, version) do nothing;
