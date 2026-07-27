# BACKLOG.md — Aurora Program — v2+ ideas (documented, NOT for v1)
*Ideas parked by explicit decision. Nothing here enters code until v1 ships and playtest data informs prioritization. Adding to this file is always allowed; promoting an item to the GDD requires updating the GDD first.*

## Committed for v2 (owner decision, 2026-07)
- **Rocket configuration (KSP-lite):** choose engine + tank + payload instead of fixed recipes. Multiplies balance surface; natural fit when the crewed era needs vehicle variety. Interacts with Confidence formula — design that interaction before building.
- **Dynamic weather with forecast:** weather window shows a mini-forecast ("optimal in 2h, acceptable in 20 min") with a Confidence trade-off for launching in acceptable-but-not-optimal conditions. Builds on the existing Weather Station upgrade.
- **Achievements (platform + in-game):** on top of the Program Records system — Records are the in-fiction layer, achievements the meta layer.
- **Detailed historical statistics:** per-launch archive (payload, confidence, outcome, date), program graphs over time. Pairs beautifully with the Mission Log.
- **Additional launch pads (3rd+):** the program keeps growing — each new pad raises parallel mission capacity. (The 2nd pad is already in v1; the schema is per-pad, so a 3rd pad is a data addition, not a migration.)

## Parked for the Sprint 8 economy unlock (specified, NOT implemented before then)
**Campus & Production internal upgrades.** Rationale: Testing and Launch have 9 internal upgrades between them; Campus has 2 and Production has 0 — the complexes the player lives in for the first hours are the emptiest. Slot-adding upgrades additionally solve the idle-staff problem (see below) by making headcount growth a bought, priced decision instead of an automatic one. Every item must pass the depth rule: it should change a decision, not just a number. **Values below are provisional — Sprint 8 must price them and re-run the sim sweep (salary band 30–55%, Flight Data 20–35%, pacing floor day 5 / ceiling day 12).**

| Building | Upgrade | Effect |
|---|---|---|
| Finance | Grants desk | +1 Technician slot |
| R&D Lab | Technical archive | +1 Scientist slot |
| R&D Lab | Second research track | **Two research nodes run in parallel** (mechanic change — the depth item of this set) |
| Supply Depot | Bulk contracts | +1 Technician slot |
| Refinery | Recovery loop | −10% Materials consumed per Propellant |
| Fabrication | QA station | −15% Materials consumed per Hardware |
| Warehouse | Inventory system | +25% to the cap bonus each Warehouse level grants |

**Slots-per-level (considered, REJECTED):** growing slots automatically with building level was rejected — it converts every level-up into mandatory extra headcount, and salaries already sit at the top of the band (53–55%). Bought slot upgrades give the same relief with full balance control. Also rejected: blocking hires at the slot ceiling (kills agency, breaks hiring ahead of construction, and idle staff are legitimate promotion feedstock) and giving idle staff a passive bonus (would make the assignment decision meaningless).

## Other parked ideas
- **"Launch early" as a real skippable checklist action:** GDD §7b's "0 if launched early" wording was clarified (v2.10) as describing the live Confidence preview only — in v1, weather and controllers are mandatory checklist items like the other 6, no skip exists. A genuine skip action (proceed without the optimal weather window, or with controllers short-staffed) is a real strategic tradeoff worth building, but only once Sprint 9's contract deadlines create actual time pressure to make it meaningful. Needs its own design pass (when is skipping tempting vs. reckless?) and an explicit economy unlock — not a byproduct of a checklist clarification.
- **Give "Aluminum alloys" a real effect (contingent):** in v1 it is a pure gate/teaching node with no production effect. If Sprint 8's balance pass unlocks the economy and the early Materials branch feels hollow, the natural fix is a small Fabrication bonus (e.g. −10% Materials per Hardware). Requires an explicit economy unlock + a sim re-run; do NOT add it while the economy is locked.
- **Contingent FTUE fix — manual Research verb ("Field observations"):** a small manual action granting trickle Research before the R&D Lab is staffable, to soften the day-1 bootstrap gap the simulator flagged (Research sits at 0 for most of day 1 while the promotion chain runs; ~12h stall on `basicEngineering`, all seeds). Activate ONLY if Sprint 8 testers report day 1 feeling dead — the stall is currently accepted as intended Kittens-style pacing, and day 1 is otherwise full (building, pitching, hiring). If activated, it follows the evolving-verb pattern of pitch/gather.
- **Rival space agency:** a competitor racing your milestones (space-race fantasy). Full parallel-simulation system — major expansion material. The Mission Log can *hint* at rivals with text long before simulating one.
- **Program Policies** ⟨KSP Administration⟩: active policy slots trading income types.
- **Booster recovery:** extension of the Partial Reusability XP node into a per-launch mechanic.
- **Staff names/portraits for role pools:** flavor only; deliberately reserved so individual identity stays special for astronauts (era 2).
- **Offline cap beyond 16 h:** further Remote Ops tiers (24 h+) as late-game research/Funding sinks — v1 stops at 16 h (Remote Ops node, now in ECONOMY §5).
- **Visual themes / light mode, cloud save, i18n beyond English.**
