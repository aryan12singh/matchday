// Live match card — minute, score, my provisional points pulse (screens 3/6).
export function LiveMatchCard({ home, away, homeScore, awayScore, minute, myPick, provisionalPts, onTrack, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--live)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="md-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live)' }} />
        <span style={{ font: 'var(--text-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--live)' }}>LIVE</span>
        <span style={{ font: 'var(--text-num-sm)', color: 'var(--text-2)' }}>{minute}′</span>
        {provisionalPts != null && <span style={{ marginLeft: 'auto', font: 'var(--text-num-sm)', color: provisionalPts >= 0 ? 'var(--success)' : 'var(--danger)' }}>{provisionalPts >= 0 ? '+' : ''}{provisionalPts} pts provisional</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, textAlign: 'right', font: '700 14px var(--font-display)', color: 'var(--text)' }}>{home}</span>
        <span style={{ font: 'var(--text-num-lg)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)', background: 'var(--bg)', padding: '4px 12px', borderRadius: 'var(--r-sm)' }}>{homeScore}:{awayScore}</span>
        <span style={{ flex: 1, font: '700 14px var(--font-display)', color: 'var(--text)' }}>{away}</span>
      </div>
      {myPick && <div style={{ font: 'var(--text-small)', color: 'var(--text-2)' }}>Your pick {myPick}{onTrack ? ' · exact score on track' : ''}</div>}
    </button>
  );
}