// Leaderboard row with rank movement + expandable per-category breakdown (screens 9/10).
export function LeaderboardRow({ rank, name, avatar, points, movement = 0, isMe, breakdown, prize, expanded, onToggle, tiebreak }) {
  const move = movement > 0
    ? { glyph: '▲' + movement, color: 'var(--success)' }
    : movement < 0 ? { glyph: '▼' + Math.abs(movement), color: 'var(--danger)' }
    : { glyph: '—', color: 'var(--text-3)' };
  return (
    <div style={{ background: isMe ? 'var(--accent-dim)' : 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '0 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: 24, font: 'var(--text-num)', fontVariantNumeric: 'tabular-nums', color: rank <= 3 ? 'var(--text)' : 'var(--text-2)' }}>{rank}</span>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 11px var(--font-display)', color: isMe ? 'var(--accent)' : 'var(--text-2)' }}>{avatar}</span>
        <span style={{ flex: 1, font: 'var(--text-body-strong)', color: 'var(--text)' }}>{name}{isMe && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · you</span>}</span>
        {prize && <span style={{ font: 'var(--text-num-sm)', color: 'var(--prize)' }}>{prize}</span>}
        <span style={{ font: 'var(--text-num-sm)', color: move.color, width: 34, textAlign: 'right' }}>{move.glyph}</span>
        <span style={{ font: 'var(--text-num)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)', width: 44, textAlign: 'right' }}>{points}</span>
      </button>
      {expanded && breakdown && (
        <div style={{ padding: '4px 16px 14px 64px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {Object.entries(breakdown).map(([k, v]) => (
            <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ font: '600 9px var(--font-display)', letterSpacing: '.1em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{k}</span>
              <span style={{ font: 'var(--text-num-sm)', color: 'var(--text-2)' }}>{v}</span>
            </span>
          ))}
          {tiebreak && <span style={{ font: 'var(--text-small)', color: 'var(--text-3)', alignSelf: 'flex-end' }}>tied — {tiebreak}</span>}
        </div>
      )}
    </div>
  );
}