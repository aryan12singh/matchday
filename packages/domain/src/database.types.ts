export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          details: Json | null
          id: string
          occurred_at: string
          target: Json | null
        }
        Insert: {
          action: string
          actor_user_id: string
          details?: Json | null
          id?: string
          occurred_at?: string
          target?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          details?: Json | null
          id?: string
          occurred_at?: string
          target?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          code: string
          created_at: string
          id: string
          kind: string
          logo_url: string | null
          name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          kind: string
          logo_url?: string | null
          name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          kind?: string
          logo_url?: string | null
          name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fixture_events: {
        Row: {
          added_min: number | null
          assist_player_id: string | null
          created_at: string
          detail: Json | null
          fixture_id: string
          id: string
          minute: number | null
          period: string | null
          player_id: string | null
          provider_event_key: string | null
          team_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          added_min?: number | null
          assist_player_id?: string | null
          created_at?: string
          detail?: Json | null
          fixture_id: string
          id?: string
          minute?: number | null
          period?: string | null
          player_id?: string | null
          provider_event_key?: string | null
          team_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          added_min?: number | null
          assist_player_id?: string | null
          created_at?: string
          detail?: Json | null
          fixture_id?: string
          id?: string
          minute?: number | null
          period?: string | null
          player_id?: string | null
          provider_event_key?: string | null
          team_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_events_assist_player_id_fkey"
            columns: ["assist_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_events_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_lineups: {
        Row: {
          coach: string | null
          created_at: string
          fixture_id: string
          formation: string | null
          id: string
          players: Json
          team_id: string
          updated_at: string
        }
        Insert: {
          coach?: string | null
          created_at?: string
          fixture_id: string
          formation?: string | null
          id?: string
          players: Json
          team_id: string
          updated_at?: string
        }
        Update: {
          coach?: string | null
          created_at?: string
          fixture_id?: string
          formation?: string | null
          id?: string
          players?: Json
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_lineups_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_stats: {
        Row: {
          created_at: string
          fixture_id: string
          stats: Json
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fixture_id: string
          stats: Json
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fixture_id?: string
          stats?: Json
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixture_stats_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixture_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          away_score: number | null
          away_team_id: string
          created_at: string
          et_away: number | null
          et_home: number | null
          home_score: number | null
          home_team_id: string
          ht_away: number | null
          ht_home: number | null
          id: string
          kickoff_at: string
          leg: number | null
          manual_override: boolean
          minute: number | null
          pen_away: number | null
          pen_home: number | null
          result_confirmed_at: string | null
          result_hash: string | null
          round_id: string
          status: string
          tie_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          created_at?: string
          et_away?: number | null
          et_home?: number | null
          home_score?: number | null
          home_team_id: string
          ht_away?: number | null
          ht_home?: number | null
          id?: string
          kickoff_at: string
          leg?: number | null
          manual_override?: boolean
          minute?: number | null
          pen_away?: number | null
          pen_home?: number | null
          result_confirmed_at?: string | null
          result_hash?: string | null
          round_id: string
          status?: string
          tie_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          created_at?: string
          et_away?: number | null
          et_home?: number | null
          home_score?: number | null
          home_team_id?: string
          ht_away?: number | null
          ht_home?: number | null
          id?: string
          kickoff_at?: string
          leg?: number | null
          manual_override?: boolean
          minute?: number | null
          pen_away?: number | null
          pen_home?: number | null
          result_confirmed_at?: string | null
          result_hash?: string | null
          round_id?: string
          status?: string
          tie_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixtures_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      job_state: {
        Row: {
          created_at: string
          job_key: string
          last_run_at: string | null
          last_success_at: string | null
          paused: boolean
          state: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          job_key: string
          last_run_at?: string | null
          last_success_at?: string | null
          paused?: boolean
          state?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          job_key?: string
          last_run_at?: string | null
          last_success_at?: string | null
          paused?: boolean
          state?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      league_events: {
        Row: {
          actor_user_id: string | null
          id: string
          league_id: string
          occurred_at: string
          payload: Json | null
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          id?: string
          league_id: string
          occurred_at?: string
          payload?: Json | null
          type: string
        }
        Update: {
          actor_user_id?: string | null
          id?: string
          league_id?: string
          occurred_at?: string
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_events_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_fixture_votes: {
        Row: {
          created_at: string
          fixture_id: string
          league_season_id: string
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fixture_id: string
          league_season_id: string
          round_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          fixture_id?: string
          league_season_id?: string
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_fixture_votes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_votes_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_votes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_round_selections: {
        Row: {
          created_at: string
          finalized_at: string | null
          fixture_id: string
          id: string
          league_season_id: string
          round_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          fixture_id: string
          id?: string
          league_season_id: string
          round_id: string
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          fixture_id?: string
          id?: string
          league_season_id?: string
          round_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_round_selections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_round_selections_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_round_selections_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rule_bindings: {
        Row: {
          bound_at: string
          bound_by: string | null
          effective_from_round: number
          league_season_id: string
          rule_set_version_id: string
        }
        Insert: {
          bound_at?: string
          bound_by?: string | null
          effective_from_round?: number
          league_season_id: string
          rule_set_version_id: string
        }
        Update: {
          bound_at?: string
          bound_by?: string | null
          effective_from_round?: number
          league_season_id?: string
          rule_set_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_rule_bindings_bound_by_fkey"
            columns: ["bound_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_rule_bindings_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_rule_bindings_rule_set_version_id_fkey"
            columns: ["rule_set_version_id"]
            isOneToOne: false
            referencedRelation: "rule_set_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      league_seasons: {
        Row: {
          created_at: string
          enabled_market_types: string[] | null
          fixtures_per_round: number | null
          id: string
          league_id: string
          prize_scheme_id: string | null
          reveal_policy: string
          season_id: string
          selection_mode: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled_market_types?: string[] | null
          fixtures_per_round?: number | null
          id?: string
          league_id: string
          prize_scheme_id?: string | null
          reveal_policy?: string
          season_id: string
          selection_mode?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled_market_types?: string[] | null
          fixtures_per_round?: number | null
          id?: string
          league_id?: string
          prize_scheme_id?: string | null
          reveal_policy?: string
          season_id?: string
          selection_mode?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_seasons_prize_scheme_fk"
            columns: ["prize_scheme_id"]
            isOneToOne: false
            referencedRelation: "prize_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          join_code: string
          name: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          join_code: string
          name: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string
          name?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_types: {
        Row: {
          active: boolean
          answer_schema: Json
          code: string
          created_at: string
          display: Json | null
          id: string
          scope: string
          settler: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          answer_schema: Json
          code: string
          created_at?: string
          display?: Json | null
          id?: string
          scope: string
          settler: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          answer_schema?: Json
          code?: string
          created_at?: string
          display?: Json | null
          id?: string
          scope?: string
          settler?: string
          updated_at?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          created_at: string
          fixture_id: string | null
          id: string
          locks_at: string
          market_type_id: string
          opens_at: string | null
          outcome: Json | null
          round_id: string | null
          season_id: string
          settled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fixture_id?: string | null
          id?: string
          locks_at: string
          market_type_id: string
          opens_at?: string | null
          outcome?: Json | null
          round_id?: string | null
          season_id: string
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fixture_id?: string | null
          id?: string
          locks_at?: string
          market_type_id?: string
          opens_at?: string | null
          outcome?: Json | null
          round_id?: string | null
          season_id?: string
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_market_type_id_fkey"
            columns: ["market_type_id"]
            isOneToOne: false
            referencedRelation: "market_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          dedupe_key: string
          id: string
          payload: Json | null
          sent_at: string
          type: string
          user_id: string
        }
        Insert: {
          channel: string
          dedupe_key: string
          id?: string
          payload?: Json | null
          sent_at?: string
          type: string
          user_id: string
        }
        Update: {
          channel?: string
          dedupe_key?: string
          id?: string
          payload?: Json | null
          sent_at?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          channel: string
          config: Json | null
          created_at: string
          enabled: boolean
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          config?: Json | null
          created_at?: string
          enabled?: boolean
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          config?: Json | null
          created_at?: string
          enabled?: boolean
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_equivalences: {
        Row: {
          canonical_player_id: string
          created_at: string
          duplicate_player_id: string
        }
        Insert: {
          canonical_player_id: string
          created_at?: string
          duplicate_player_id: string
        }
        Update: {
          canonical_player_id?: string
          created_at?: string
          duplicate_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_equivalences_canonical_player_id_fkey"
            columns: ["canonical_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_equivalences_duplicate_player_id_fkey"
            columns: ["duplicate_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          created_at: string
          full_name: string
          id: string
          known_as: string | null
          nationality: string | null
          photo_url: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          full_name: string
          id?: string
          known_as?: string | null
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          full_name?: string
          id?: string
          known_as?: string | null
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prediction_revisions: {
        Row: {
          id: string
          prediction_id: string
          recorded_at: string
          user_id: string
          value: Json
        }
        Insert: {
          id?: string
          prediction_id: string
          recorded_at?: string
          user_id: string
          value: Json
        }
        Update: {
          id?: string
          prediction_id?: string
          recorded_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prediction_revisions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          created_at: string
          id: string
          market_id: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "predictions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_schemes: {
        Row: {
          activated_at: string | null
          created_at: string
          currency_label: string
          definition: Json
          id: string
          kind: string
          league_season_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          currency_label?: string
          definition: Json
          id?: string
          kind: string
          league_season_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          currency_label?: string
          definition?: Json
          id?: string
          kind?: string
          league_season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_schemes_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_settlements: {
        Row: {
          amount: number
          id: string
          league_season_id: string
          period_round_id: string | null
          revised_from: string | null
          score_run_id: string | null
          settled_at: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          league_season_id: string
          period_round_id?: string | null
          revised_from?: string | null
          score_run_id?: string | null
          settled_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          league_season_id?: string
          period_round_id?: string | null
          revised_from?: string | null
          score_run_id?: string | null
          settled_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_settlements_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_settlements_period_round_id_fkey"
            columns: ["period_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_settlements_revised_from_fkey"
            columns: ["revised_from"]
            isOneToOne: false
            referencedRelation: "prize_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_settlements_score_run_id_fkey"
            columns: ["score_run_id"]
            isOneToOne: false
            referencedRelation: "score_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_settlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_league_id: string | null
          avatar_url: string | null
          calendar_token: string
          colorblind: boolean
          created_at: string
          id: string
          is_platform_admin: boolean
          theme: string | null
          timezone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          active_league_id?: string | null
          avatar_url?: string | null
          calendar_token?: string
          colorblind?: boolean
          created_at?: string
          id: string
          is_platform_admin?: boolean
          theme?: string | null
          timezone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          active_league_id?: string | null
          avatar_url?: string | null
          calendar_token?: string
          colorblind?: boolean
          created_at?: string
          id?: string
          is_platform_admin?: boolean
          theme?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_league_fk"
            columns: ["active_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_entity_map: {
        Row: {
          created_at: string
          entity_type: string
          internal_id: string
          provider: string
          provider_id: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          internal_id: string
          provider: string
          provider_id: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          internal_id?: string
          provider?: string
          provider_id?: string
        }
        Relationships: []
      }
      provider_quota_ledger: {
        Row: {
          calls: number
          created_at: string
          day: string
          plan_limit: number | null
          provider: string
          updated_at: string
        }
        Insert: {
          calls?: number
          created_at?: string
          day: string
          plan_limit?: number | null
          provider: string
          updated_at?: string
        }
        Update: {
          calls?: number
          created_at?: string
          day?: string
          plan_limit?: number | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_snapshots: {
        Row: {
          id: string
          league_season_id: string
          points: number
          rank: number
          round_id: string | null
          snapshot_at: string
          user_id: string
        }
        Insert: {
          id?: string
          league_season_id: string
          points: number
          rank: number
          round_id?: string | null
          snapshot_at?: string
          user_id: string
        }
        Update: {
          id?: string
          league_season_id?: string
          points?: number
          rank?: number
          round_id?: string | null
          snapshot_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rank_snapshots_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_snapshots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          subject: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          subject: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          subject?: string
          window_start?: string
        }
        Relationships: []
      }
      raw_payloads: {
        Row: {
          endpoint: string
          fetched_at: string
          http_status: number | null
          id: string
          params_hash: string
          payload: Json
          provider: string
        }
        Insert: {
          endpoint: string
          fetched_at?: string
          http_status?: number | null
          id?: string
          params_hash: string
          payload: Json
          provider: string
        }
        Update: {
          endpoint?: string
          fetched_at?: string
          http_status?: number | null
          id?: string
          params_hash?: string
          payload?: Json
          provider?: string
        }
        Relationships: []
      }
      rivals: {
        Row: {
          created_at: string
          league_id: string
          rival_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          league_id: string
          rival_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          league_id?: string
          rival_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rivals_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rivals_rival_user_id_fkey"
            columns: ["rival_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rivals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          name: string
          number: number
          stage_id: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          number: number
          stage_id: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          number?: number
          stage_id?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_set_versions: {
        Row: {
          created_at: string
          definition: Json
          engine_version: string
          id: string
          notes: string | null
          rule_set_id: string
          version: number
        }
        Insert: {
          created_at?: string
          definition: Json
          engine_version: string
          id?: string
          notes?: string | null
          rule_set_id: string
          version: number
        }
        Update: {
          created_at?: string
          definition?: Json
          engine_version?: string
          id?: string
          notes?: string | null
          rule_set_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rule_set_versions_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_sets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      score_components: {
        Row: {
          category: string
          created_at: string
          hit: boolean
          market_id: string
          raw: Json | null
          rule_set_version_id: string
          score_run_id: string
          superseded_by_run_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          hit: boolean
          market_id: string
          raw?: Json | null
          rule_set_version_id: string
          score_run_id: string
          superseded_by_run_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          hit?: boolean
          market_id?: string
          raw?: Json | null
          rule_set_version_id?: string
          score_run_id?: string
          superseded_by_run_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_components_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_components_rule_set_version_id_fkey"
            columns: ["rule_set_version_id"]
            isOneToOne: false
            referencedRelation: "rule_set_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_components_score_run_id_fkey"
            columns: ["score_run_id"]
            isOneToOne: false
            referencedRelation: "score_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_components_superseded_by_run_id_fkey"
            columns: ["superseded_by_run_id"]
            isOneToOne: false
            referencedRelation: "score_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_components_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      score_run_changes: {
        Row: {
          category: string
          created_at: string
          market_id: string
          new_hit: boolean | null
          new_raw: Json | null
          old_hit: boolean | null
          old_raw: Json | null
          score_run_id: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          market_id: string
          new_hit?: boolean | null
          new_raw?: Json | null
          old_hit?: boolean | null
          old_raw?: Json | null
          score_run_id: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          market_id?: string
          new_hit?: boolean | null
          new_raw?: Json | null
          old_hit?: boolean | null
          old_raw?: Json | null
          score_run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_run_changes_score_run_id_fkey"
            columns: ["score_run_id"]
            isOneToOne: false
            referencedRelation: "score_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      score_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          initiated_by: string | null
          scope: Json
          started_at: string
          stats: Json | null
          status: string
          trigger: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          scope: Json
          started_at?: string
          stats?: Json | null
          status?: string
          trigger: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          scope?: Json
          started_at?: string
          stats?: Json | null
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_runs_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_player_stats: {
        Row: {
          appearances: number
          assists: number
          created_at: string
          goals: number
          minutes: number
          penalties: number
          player_id: string
          season_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          appearances?: number
          assists?: number
          created_at?: string
          goals?: number
          minutes?: number
          penalties?: number
          player_id: string
          season_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          appearances?: number
          assists?: number
          created_at?: string
          goals?: number
          minutes?: number
          penalties?: number
          player_id?: string
          season_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_player_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_player_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          competition_id: string
          created_at: string
          end_date: string | null
          first_kickoff_at: string | null
          id: string
          is_current: boolean
          label: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          end_date?: string | null
          first_kickoff_at?: string | null
          id?: string
          is_current?: boolean
          label: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          end_date?: string | null
          first_kickoff_at?: string | null
          id?: string
          is_current?: boolean
          label?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_memberships: {
        Row: {
          active_from: string | null
          active_until: string | null
          created_at: string
          id: string
          player_id: string
          position: string | null
          season_id: string
          shirt_number: number | null
          team_id: string
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          id?: string
          player_id: string
          position?: string | null
          season_id: string
          shirt_number?: number | null
          team_id: string
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          id?: string
          player_id?: string
          position?: string | null
          season_id?: string
          shirt_number?: number | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          stage_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          stage_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_groups_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          season_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          season_id: string
          sequence: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          season_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      standings: {
        Row: {
          created_at: string
          drawn: number | null
          form: string | null
          goals_against: number | null
          goals_for: number | null
          id: string
          lost: number | null
          played: number | null
          points: number | null
          position: number
          season_id: string
          stage_group_id: string | null
          stage_id: string
          team_id: string
          updated_at: string
          won: number | null
        }
        Insert: {
          created_at?: string
          drawn?: number | null
          form?: string | null
          goals_against?: number | null
          goals_for?: number | null
          id?: string
          lost?: number | null
          played?: number | null
          points?: number | null
          position: number
          season_id: string
          stage_group_id?: string | null
          stage_id: string
          team_id: string
          updated_at?: string
          won?: number | null
        }
        Update: {
          created_at?: string
          drawn?: number | null
          form?: string | null
          goals_against?: number | null
          goals_for?: number | null
          id?: string
          lost?: number | null
          played?: number | null
          points?: number | null
          position?: number
          season_id?: string
          stage_group_id?: string | null
          stage_id?: string
          team_id?: string
          updated_at?: string
          won?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_stage_group_id_fkey"
            columns: ["stage_group_id"]
            isOneToOne: false
            referencedRelation: "stage_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          details: Json | null
          error_summary: string | null
          finished_at: string | null
          id: string
          kind: string
          provider: string | null
          records_read: number
          records_written: number
          scope: Json | null
          started_at: string
          status: string
          trigger_source: string
        }
        Insert: {
          details?: Json | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          provider?: string | null
          records_read?: number
          records_written?: number
          scope?: Json | null
          started_at?: string
          status?: string
          trigger_source: string
        }
        Update: {
          details?: Json | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          provider?: string | null
          records_read?: number
          records_written?: number
          scope?: Json | null
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Relationships: []
      }
      team_season_entries: {
        Row: {
          created_at: string
          season_id: string
          stage_group_id: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          season_id: string
          stage_group_id?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          season_id?: string
          stage_group_id?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_season_entries_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_season_entries_stage_group_id_fkey"
            columns: ["stage_group_id"]
            isOneToOne: false
            referencedRelation: "stage_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_season_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          code: string | null
          country: string | null
          created_at: string
          crest_url: string | null
          id: string
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          country?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          country?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      league_vote_tallies: {
        Row: {
          fixture_id: string | null
          league_season_id: string | null
          round_id: string | null
          votes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_fixture_votes_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_votes_league_season_id_fkey"
            columns: ["league_season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fixture_votes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_selection_fallbacks: { Args: never; Returns: number }
      can_view_prediction: {
        Args: { p_market_id: string; p_owner_id: string }
        Returns: boolean
      }
      create_league: {
        Args: { p_name: string }
        Returns: {
          join_code: string
          league_id: string
        }[]
      }
      enrol_league_season: {
        Args: {
          p_league_id: string
          p_reveal_policy?: string
          p_season_id: string
          p_selection_mode?: string
        }
        Returns: string
      }
      ensure_fixture_markets: {
        Args: { p_fixture_id: string }
        Returns: number
      }
      ensure_season_markets: { Args: { p_season_id: string }; Returns: number }
      finalize_round_selection: {
        Args: {
          p_fixture_ids: string[]
          p_league_season_id: string
          p_round_id: string
        }
        Returns: number
      }
      generate_join_code: { Args: { p_length?: number }; Returns: string }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      is_league_organizer: { Args: { p_league_id: string }; Returns: boolean }
      is_league_season_member: {
        Args: { p_league_season_id: string }
        Returns: boolean
      }
      is_league_season_organizer: {
        Args: { p_league_season_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      join_league: { Args: { p_code: string }; Returns: string }
      league_join_code: { Args: { p_league_id: string }; Returns: string }
      league_round_fixtures: {
        Args: { p_league_season_id: string; p_round_id: string }
        Returns: {
          fixture_id: string
        }[]
      }
      leave_league: { Args: { p_league_id: string }; Returns: undefined }
      lock_markets_sweep: { Args: never; Returns: number }
      preview_league: {
        Args: { p_code: string }
        Returns: {
          league_id: string
          member_count: number
          name: string
        }[]
      }
      regenerate_join_code: { Args: { p_league_id: string }; Returns: string }
      release_advisory_lock: { Args: { p_key: number }; Returns: boolean }
      round_selection_state: {
        Args: { p_league_season_id: string; p_round_id: string }
        Returns: {
          away_code: string
          away_name: string
          fixture_id: string
          home_code: string
          home_name: string
          kickoff_at: string
          selected: boolean
          voted_by_me: boolean
          votes: number
        }[]
      }
      save_fixture_prediction: {
        Args: {
          p_away: number
          p_btts?: boolean
          p_first_scorer_id?: string
          p_first_scorer_none?: boolean
          p_first_team_id?: string
          p_first_team_none?: boolean
          p_fixture_id: string
          p_goal_diff?: number
          p_home: number
          p_total_goals?: number
        }
        Returns: {
          market_code: string
          saved: boolean
        }[]
      }
      save_golden_boot_prediction: {
        Args: { p_player_id: string; p_season_id: string }
        Returns: string
      }
      save_season_table_prediction: {
        Args: { p_order: string[]; p_season_id: string }
        Returns: string
      }
      toggle_fixture_vote: {
        Args: {
          p_fixture_id: string
          p_league_season_id: string
          p_round_id: string
        }
        Returns: boolean
      }
      try_advisory_lock: { Args: { p_key: number }; Returns: boolean }
      update_league_season_settings: {
        Args: {
          p_fixtures_per_round?: number
          p_league_season_id: string
          p_reveal_policy?: string
          p_selection_mode?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

