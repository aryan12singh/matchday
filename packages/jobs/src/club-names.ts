/**
 * Matching one provider's club names to another's.
 *
 * The schedule comes from the Premier League's own JSON and live results come from
 * API-Football, and the two do not agree on what any club is called:
 *
 *   Man Utd       ↔ Manchester United
 *   Man City      ↔ Manchester City
 *   Nott'm Forest ↔ Nottingham Forest
 *   Spurs         ↔ Tottenham
 *   Ipswich Town  ↔ Ipswich
 *
 * The obvious approach — strip generic suffixes like "City" and "United" — is actively
 * dangerous here: it collapses Manchester United and Manchester City to the same string,
 * and a mismatched club means a fixture resolved to the wrong match and results written
 * against the wrong predictions. So suffixes are never stripped. Instead, abbreviations
 * are expanded to a canonical form, and a match is only accepted when it is *unique*
 * among the candidates — an input that fits two clubs equally is rejected rather than
 * guessed.
 *
 * Pure, so it can be tested against the real names both sources actually publish.
 */

/**
 * Token-level expansions. These are one-directional into the long form, so both sides of
 * a comparison converge on the same canonical string.
 *
 * Kept deliberately small: every entry is a claim about the world that can go stale when
 * a club is promoted, and a wrong entry silently mismatches. Anything not listed falls
 * through to the subset rule below, which handles the common "Ipswich" vs "Ipswich Town"
 * shape without needing an entry per club.
 */
const TOKEN_ALIASES: Record<string, string> = {
  man: 'manchester',
  utd: 'united',
  nottm: 'nottingham',
  notts: 'nottingham',
  spurs: 'tottenham',
  wolves: 'wolverhampton',
  brighton: 'brighton',
  hove: '',
  albion: '',
  // Noise words that appear on one side only.
  fc: '',
  afc: '',
  cf: '',
};

/** Whole-name aliases, for cases where no token rule can bridge the gap. */
const NAME_ALIASES: Record<string, string> = {
  spurs: 'tottenham hotspur',
  tottenham: 'tottenham hotspur',
  'tottenham hotspur': 'tottenham hotspur',
  wolves: 'wolverhampton wanderers',
  'wolverhampton wanderers': 'wolverhampton wanderers',
};

export function canonicalClubName(input: string): string {
  const stripped = input
    .normalize('NFD')
    // Diacritics: "Atlético" and "Atletico" are the same club.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apostrophes and punctuation vary ("Nott'm" vs "Nottm"), so remove rather than map.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const whole = NAME_ALIASES[stripped];
  const base = whole ?? stripped;

  return base
    .split(' ')
    .map((token) => TOKEN_ALIASES[token] ?? token)
    .filter((token) => token.length > 0)
    .join(' ');
}

export interface ClubCandidate {
  id: string;
  name: string;
}

export interface ClubMatch {
  id: string;
  name: string;
  score: number;
  reason: 'exact' | 'subset' | 'overlap';
}

/**
 * Scores one name against a set of candidates and returns the winner, or null.
 *
 * Null is returned both when nothing is close enough AND when two candidates tie — an
 * ambiguous match is worse than no match, because no match is visible in the unmatched
 * count while a wrong one silently writes results against another club's fixture.
 */
export function matchClub(
  name: string,
  candidates: readonly ClubCandidate[],
  options: { threshold?: number } = {},
): ClubMatch | null {
  const threshold = options.threshold ?? 0.6;
  const target = canonicalClubName(name);
  if (!target) return null;

  const targetTokens = new Set(target.split(' '));
  const scored: ClubMatch[] = [];

  for (const candidate of candidates) {
    const canonical = canonicalClubName(candidate.name);
    if (!canonical) continue;

    if (canonical === target) {
      scored.push({ id: candidate.id, name: candidate.name, score: 1, reason: 'exact' });
      continue;
    }

    const tokens = new Set(canonical.split(' '));
    const shared = [...tokens].filter((t) => targetTokens.has(t)).length;
    if (shared === 0) continue;

    // "Ipswich" ⊂ "Ipswich Town". Strong, but below exact so a true exact match always
    // wins — which is what stops "Manchester" from beating "Manchester City".
    const subset = shared === tokens.size || shared === targetTokens.size;
    const union = new Set([...tokens, ...targetTokens]).size;

    scored.push({
      id: candidate.id,
      name: candidate.name,
      score: subset ? 0.9 : shared / union,
      reason: subset ? 'subset' : 'overlap',
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < threshold) return null;

  // A tie means the name genuinely fits two clubs — "Manchester" against a league
  // containing both Manchester clubs. Refuse rather than pick one.
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score === best.score) return null;

  return best;
}
