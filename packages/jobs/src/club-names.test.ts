import { describe, expect, it } from 'vitest';

import { type ClubCandidate, canonicalClubName, matchClub } from './club-names';

/**
 * Tested against the names both sources actually publish, not invented ones.
 *
 * The FPL list is what the 2026/27 bootstrap wrote into `teams`; the API-Football list is
 * from the committed 2024/25 cassette. A wrong match here writes a real result against
 * another club's fixture, so the ambiguous cases matter more than the easy ones.
 */

// Exactly what `select name from teams` returns after the 2026/27 bootstrap.
const OURS: ClubCandidate[] = [
  'Arsenal',
  'Aston Villa',
  'Bournemouth',
  'Brentford',
  'Brighton',
  'Chelsea',
  'Coventry City',
  'Crystal Palace',
  'Everton',
  'Fulham',
  'Hull City',
  'Ipswich Town',
  'Leeds',
  'Liverpool',
  'Man City',
  'Man Utd',
  'Newcastle',
  "Nott'm Forest",
  'Spurs',
  'Sunderland',
].map((name, i) => ({ id: String(i + 1), name }));

const find = (name: string) => matchClub(name, OURS);

describe('canonicalClubName', () => {
  it('converges the two spellings of the same club', () => {
    expect(canonicalClubName('Man Utd')).toBe(canonicalClubName('Manchester United'));
    expect(canonicalClubName('Man City')).toBe(canonicalClubName('Manchester City'));
    expect(canonicalClubName("Nott'm Forest")).toBe(canonicalClubName('Nottingham Forest'));
    expect(canonicalClubName('Spurs')).toBe(canonicalClubName('Tottenham'));
  });

  it('does not converge two different clubs', () => {
    // The whole reason suffixes are never stripped.
    expect(canonicalClubName('Man Utd')).not.toBe(canonicalClubName('Man City'));
    expect(canonicalClubName('Manchester United')).not.toBe(canonicalClubName('Manchester City'));
  });

  it('ignores punctuation, case and diacritics', () => {
    expect(canonicalClubName('BRIGHTON')).toBe(canonicalClubName('brighton'));
    expect(canonicalClubName("Nott'm Forest")).toBe(canonicalClubName('Nottm Forest'));
  });
});

describe('matchClub', () => {
  it('resolves every API-Football name for a club we hold', () => {
    const cases: [string, string][] = [
      ['Manchester United', 'Man Utd'],
      ['Manchester City', 'Man City'],
      ['Nottingham Forest', "Nott'm Forest"],
      ['Tottenham', 'Spurs'],
      ['Ipswich', 'Ipswich Town'],
      ['Newcastle', 'Newcastle'],
      ['Brighton', 'Brighton'],
      ['Crystal Palace', 'Crystal Palace'],
      ['Aston Villa', 'Aston Villa'],
      ['Liverpool', 'Liverpool'],
      ['Coventry', 'Coventry City'],
      ['Hull', 'Hull City'],
    ];

    for (const [incoming, expected] of cases) {
      const match = find(incoming);
      expect(match, `no match for "${incoming}"`).not.toBeNull();
      expect(match!.name, `"${incoming}" matched the wrong club`).toBe(expected);
    }
  });

  it('refuses an ambiguous name rather than guessing', () => {
    // "Manchester" alone fits both Manchester clubs. Picking one would write a real
    // result against the wrong fixture, which is strictly worse than reporting nothing.
    expect(find('Manchester')).toBeNull();
  });

  it('returns null for a club not in the competition', () => {
    expect(find('Real Madrid')).toBeNull();
    expect(find('Leicester')).toBeNull();
  });

  it('is not fooled by a shared first word', () => {
    // Both are real Premier League clubs in other seasons.
    const match = find('Sheffield United');
    // Neither Sheffield club is in this list, so no confident match should be returned.
    expect(match).toBeNull();
  });

  it('never maps two different incoming names to the same club', () => {
    const seen = new Map<string, string>();
    for (const incoming of ['Manchester United', 'Manchester City', 'Tottenham', 'Newcastle']) {
      const match = find(incoming)!;
      expect(match).not.toBeNull();
      expect(seen.has(match.id), `${incoming} collided with ${seen.get(match.id)}`).toBe(false);
      seen.set(match.id, incoming);
    }
  });

  it('handles empty and junk input', () => {
    expect(find('')).toBeNull();
    expect(find('   ')).toBeNull();
    expect(find('!!!')).toBeNull();
  });
});
