Fixture prediction card (screen 4). Anatomy top→bottom:
1. Header row: kickoff time (font-num) left; StateBadge + CountsBadge right.
2. Team rows: TeamChip + name left, ScoreStepper right (editable) or picked score (locked+) — real score column appears live/settled with points chip.
3. Footer: advanced-market summary chips ("GD +1 · BTTS yes · Saka 1st") + "More markets" expander.
States: editable (volt left edge if unpredicted, saved-tick after autosave), locked (padlock, picks visible), live (coral edge + provisional +n pts), settled (final pts chip green/red), void (dashed, 60% opacity, "POSTPONED").
Failure: lock-boundary save conflict → toast "Locked at kickoff — not saved."
See Predict.dc.html for the full-fidelity rendering.