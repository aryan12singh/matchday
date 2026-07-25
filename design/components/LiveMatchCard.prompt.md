Live match card. Coral left edge + pulsing dot (dot pulses, never the card). Provisional points tick in success/danger. Requires the .md-pulse keyframe:
```css
@keyframes mdpulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.md-pulse { animation: mdpulse 1.6s infinite }
```
```jsx
<LiveMatchCard home="Arsenal" away="Spurs" homeScore={2} awayScore={1} minute="64" myPick="2:1" provisionalPts={6} onTrack />
```