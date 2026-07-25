Money display — gold, matter-of-fact, and hideable. When the league is points-only pass hidden (renders null).
```jsx
<PrizeTag amount="£120" /> <PrizeTag label="MW PRIZE" amount="+£15" />
<PrizeTag amount="£120" hidden={league.prizeSchemeId == null} />
```