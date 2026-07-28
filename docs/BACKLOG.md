# BACKLOG.md — Aurora Program — v2+ ideas (documented, NOT for v1)
*Ideas parked by explicit decision. Nothing here enters code until v1 ships and playtest data informs prioritization. Adding to this file is always allowed; promoting an item to the GDD requires updating the GDD first.*

## Committed for v2 (owner decision, 2026-07)
- **Rocket configuration (KSP-lite):** choose engine + tank + payload instead of fixed recipes. Multiplies balance surface; natural fit when the crewed era needs vehicle variety. Interacts with Confidence formula — design that interaction before building.
- **Dynamic weather with forecast:** weather window shows a mini-forecast ("optimal in 2h, acceptable in 20 min") with a Confidence trade-off for launching in acceptable-but-not-optimal conditions. Builds on the existing Weather Station upgrade.
- **Achievements (platform + in-game):** on top of the Program Records system — Records are the in-fiction layer, achievements the meta layer.
- **Detailed historical statistics:** per-launch archive (payload, confidence, outcome, date), program graphs over time. Pairs beautifully with the Mission Log.
- **Additional launch pads (3rd+):** the program keeps growing — each new pad raises parallel mission capacity. (The 2nd pad is already in v1; the schema is per-pad, so a 3rd pad is a data addition, not a migration.)

## Shipped: Sprint 8 economy unlock (was "Parked for the Sprint 8 economy unlock")
**Campus & Production internal upgrades — priced and implemented (ECONOMY_MODEL v3.6, PROGRESS.md).** Grants desk (Finance, 350 F, +1 Technician slot), Technical archive (R&D Lab, 500 F, +1 Scientist slot), Second research track (R&D Lab, 1,000 F, two research nodes run in parallel — the depth item of this set), Bulk contracts (Supply Depot, 350 F, +1 Technician slot), Recovery loop (Refinery, 550 F, −10% Materials per Propellant), QA station (Fabrication, 600 F+100 M, −15% Materials per Hardware), Inventory system (Warehouse, 700 F+150 M, +25% to each future level's cap bonus). Full sim sweep re-run post-implementation: salary band, Flight Data share, and pacing floor/ceiling all still hold (PROGRESS.md has the numbers). Verified live via Playwright, zero console errors.

**Slots-per-level (considered, REJECTED):** growing slots automatically with building level was rejected — it converts every level-up into mandatory extra headcount, and salaries already sit at the top of the band (53–55%). Bought slot upgrades give the same relief with full balance control. Also rejected: blocking hires at the slot ceiling (kills agency, breaks hiring ahead of construction, and idle staff are legitimate promotion feedstock) and giving idle staff a passive bonus (would make the assignment decision meaningless).

## Other parked ideas
- **"Launch early" as a real skippable checklist action:** GDD §7b's "0 if launched early" wording was clarified (v2.10) as describing the live Confidence preview only — in v1, weather and controllers are mandatory checklist items like the other 6, no skip exists. A genuine skip action (proceed without the optimal weather window, or with controllers short-staffed) is a real strategic tradeoff worth building, but only once Sprint 9's contract deadlines create actual time pressure to make it meaningful. Needs its own design pass (when is skipping tempting vs. reckless?) and an explicit economy unlock — not a byproduct of a checklist clarification.
- ~~**Give "Aluminum alloys" a real effect.**~~ **SHIPPED (Sprint 8, ECONOMY §5 v3.6):** −10% Materials consumed per Hardware at Fabrication, stacking multiplicatively with the new QA station upgrade above.
- **Contingent FTUE fix — manual Research verb ("Field observations"):** a small manual action granting trickle Research before the R&D Lab is staffable, to soften the day-1 bootstrap gap the simulator flagged (Research sits at 0 for most of day 1 while the promotion chain runs; ~12h stall on `basicEngineering`, all seeds). Activate ONLY if Sprint 8 testers report day 1 feeling dead — the stall is currently accepted as intended Kittens-style pacing, and day 1 is otherwise full (building, pitching, hiring). If activated, it follows the evolving-verb pattern of pitch/gather.
- **Rival space agency:** a competitor racing your milestones (space-race fantasy). Full parallel-simulation system — major expansion material. The Mission Log can *hint* at rivals with text long before simulating one.
- **Program Policies** ⟨KSP Administration⟩: active policy slots trading income types.
- **Booster recovery:** extension of the Partial Reusability XP node into a per-launch mechanic.
- **Staff names/portraits for role pools:** flavor only; deliberately reserved so individual identity stays special for astronauts (era 2).
- **Offline cap beyond 16 h:** further Remote Ops tiers (24 h+) as late-game research/Funding sinks — v1 stops at 16 h (Remote Ops node, now in ECONOMY §5).
- **Visual themes / light mode, cloud save, i18n beyond English.**
