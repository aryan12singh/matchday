Leaderboard row (screens 9/10). Rank · avatar · name · [prize] · movement ▲▼ · points.
- My row gets an accent-dim wash. Top-3 ranks full text color.
- Tap expands per-category breakdown (outcome/exact/GD/TG/BTTS/1st team/1st scorer/accuracy).
- Prize column renders ONLY when the league has a prize scheme.
- Tied points: show deciding tiebreak in the expansion.
```jsx
<LeaderboardRow rank={1} name="Dan" avatar="DK" points={341} movement={0} prize="+£40" />
<LeaderboardRow rank={3} name="Aryan" avatar="AR" points={329} movement={2} isMe expanded breakdown={{outcome:180,exact:84,gd:24,'1st scorer':41}} />
```