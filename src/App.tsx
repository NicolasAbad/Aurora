import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Ticker } from './ui/Ticker';
import { CurrentDirective } from './ui/CurrentDirective';
import { ComplexTabs } from './ui/ComplexTabs';
import { BuildingTile } from './ui/BuildingTile';
import { PitchButton } from './ui/PitchButton';
import { ManualActionButton } from './ui/ManualActionButton';
import { StaffHiring } from './ui/StaffHiring';
import { PromotionPanel } from './ui/PromotionPanel';
import { ResearchPanel } from './ui/ResearchPanel';
import { FlightXpPanel } from './ui/FlightXpPanel';
import { PayrollBanner } from './ui/PayrollBanner';
import { AwayModal } from './ui/AwayModal';
import { SaveWarningBanner } from './ui/SaveWarningBanner';
import { MilestoneScreen } from './ui/MilestoneScreen';
import { ActiveProcessStrip } from './ui/ActiveProcessStrip';
import { StaffAvailabilityChip } from './ui/StaffAvailabilityChip';
import { CertificationPanel } from './ui/CertificationPanel';
import { SoundingMissionPanel } from './ui/SoundingMissionPanel';
import { ContractsPanel } from './ui/ContractsPanel';
import { ConstellationView } from './ui/ConstellationView';
import { LaunchSequencePanel } from './ui/LaunchSequencePanel';
import { MissionLog } from './ui/MissionLog';
import { TimeWarpControl } from './ui/TimeWarpControl';
import { DevResetButton } from './ui/DevResetButton';
import { SettingsScreen } from './ui/SettingsScreen';
import { useGameStore } from './state/persistStore';
import { useSettings } from './state/settings';
import { formatCost } from './core/format';
import { isUnlockConditionMet, unlockContextFromState } from './core/unlockConditions';
import { nextFtueTooltip } from './core/ftue';
import { RECORD_DEFS } from './core/records';
import { narrativeText } from './data/narrative';
import { BUILDINGS } from './data/buildings';
import { EVENT_DEFS_BY_ID } from './data/events';
import type { ComplexId, RecordId } from './core/types';

const RUSH_ORDER_COST_FUNDING = 150; // ECONOMY §2
const CAMPUS_FINANCE_REVEAL_FUNDING = 150; // UI_SPEC §2d step 2

interface ComplexPanelProps {
  onSelectComplex: (id: ComplexId) => void;
}

/** UI_SPEC §2d: "the sequence below IS the FTUE for the opening minutes; each reveal is
 * a direct consequence of the player's last action." Steps 2-3 (Finance at 150 lifetime
 * Funding; Staff panel at Finance built) are naturally monotonic — lifetime Funding and
 * building levels never decrease in this game — so they're read live. Step 4 (Crew
 * Quarters + R&D Lab + Training Center, at the staff pool's first 2/2 — Sprint 9.5 moved
 * Training Center here from "visible at game start") is NOT monotonic once staff
 * dismissal (§4b) exists, so it's backed by the persisted `staffCapReachedOnce` latch,
 * OR'd with "already built" so a save from before this field existed never regresses. */
function CampusPanel({ onSelectComplex }: ComplexPanelProps) {
  const lifetimeFunding = useGameStore((s) => s.resources.funding.lifetimeEarned);
  const financeLevel = useGameStore((s) => s.buildings.finance.level);
  const crewQuartersLevel = useGameStore((s) => s.buildings.crewQuarters.level);
  const rndLabLevel = useGameStore((s) => s.buildings.rndLab.level);
  const staffCapReachedOnce = useGameStore((s) => s.staffCapReachedOnce);

  const financeRevealed = lifetimeFunding >= CAMPUS_FINANCE_REVEAL_FUNDING;
  const staffPanelRevealed = financeLevel >= 1;
  const quartersAndLabRevealed = staffCapReachedOnce || crewQuartersLevel >= 1 || rndLabLevel >= 1;

  return (
    <>
      {staffPanelRevealed && <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />}
      <div className="campus-grid">
        <BuildingTile buildingId="offices">
          <PitchButton />
        </BuildingTile>
        {financeRevealed && <BuildingTile buildingId="finance" />}
        {quartersAndLabRevealed && <BuildingTile buildingId="rndLab" />}
        {quartersAndLabRevealed && <BuildingTile buildingId="crewQuarters" />}
        {quartersAndLabRevealed && <BuildingTile buildingId="trainingCenter" />}
        {staffPanelRevealed && <StaffHiring />}
        {staffPanelRevealed && <PromotionPanel />}
      </div>
    </>
  );
}

// UI_SPEC §2e (Sprint 9.5, NEW): same staged-reveal bug class as Campus before Sprint
// 7.5, now closed for Production too — the complex tab unlocking must not dump all 5
// buildings at once. Step 2 (Fabrication + Warehouse) is naturally monotonic on Supply
// Depot's own level; step 3 (Refinery + Propellant Depot) on the "Sounding rockets" tech.
function ProductionPanel({ onSelectComplex }: ComplexPanelProps) {
  const supplyDepotLevel = useGameStore((s) => s.buildings.supplyDepot.level);
  const fabricationLevel = useGameStore((s) => s.buildings.fabrication.level);
  const funding = useGameStore((s) => s.resources.funding.amount);
  const soundingRocketsResearched = useGameStore((s) => s.research.completed.includes('soundingRockets'));
  const gatherMaterials = useGameStore((s) => s.gatherMaterials);
  const rushOrder = useGameStore((s) => s.rushOrder);

  const fabAndWarehouseRevealed = supplyDepotLevel >= 1;
  const refineryAndPropDepotRevealed = soundingRocketsResearched;

  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <div className="campus-grid">
        <BuildingTile buildingId="supplyDepot">
          {supplyDepotLevel >= 1 && (
            <ManualActionButton
              label="Gather materials"
              cooldownMs={1000}
              feedbackText="+5"
              onAction={gatherMaterials}
            />
          )}
        </BuildingTile>
        {fabAndWarehouseRevealed && (
          <BuildingTile buildingId="fabrication">
            {fabricationLevel >= 1 && (
              <>
                {/* UI_SPEC §4 / NARRATIVE §10: "nothing purchasable without effect text" —
                    Rush Order's own description, previously missing entirely. */}
                <div className="building-tile__description">{narrativeText('rushOrder')}</div>
                <ManualActionButton
                  label={`Rush Order (${formatCost({ funding: RUSH_ORDER_COST_FUNDING })})`}
                  cooldownMs={5 * 60_000}
                  disabled={funding < RUSH_ORDER_COST_FUNDING}
                  feedbackText="+100"
                  onAction={rushOrder}
                />
              </>
            )}
          </BuildingTile>
        )}
        {fabAndWarehouseRevealed && <BuildingTile buildingId="warehouse" />}
        {refineryAndPropDepotRevealed && <BuildingTile buildingId="refinery" />}
        {refineryAndPropDepotRevealed && <BuildingTile buildingId="propellantDepot" />}
      </div>
    </>
  );
}

// UI_SPEC §2g (Sprint 9.5): Research's own top-level tab — ComplexTabs already gates
// entry on R&D Lab being built, so this panel has nothing further to gate itself.
function ResearchTabPanel({ onSelectComplex }: ComplexPanelProps) {
  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <ResearchPanel />
    </>
  );
}

// ECONOMY §9 (Sprint 10): same top-level-tab treatment as Research — ComplexTabs already
// gates entry on any Flight XP having been earned.
function FlightXpTabPanel({ onSelectComplex }: ComplexPanelProps) {
  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <FlightXpPanel />
    </>
  );
}

/** UI_SPEC §3.4/NARRATIVE §9: a one-time tooltip banner on first entry into a complex,
 * dismissible, session-scoped (state lives in App(), not GameState — the doc doesn't
 * specify cross-session persistence for these, unlike the staged-reveal steps above,
 * so this stays a minimal, easily-revisited implementation rather than a schema guess). */
function FirstEntryTip({ id, dismissed, onDismiss }: { id: string; dismissed: boolean; onDismiss: () => void }) {
  if (dismissed) return null;
  return (
    <div className="first-entry-tip">
      <span>{narrativeText(id)}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

// UI_SPEC §2b: Payload Processing stays completely hidden until Aurora I success (its
// appearance IS the post-climax beat) — everything else in Complex C is reachable as
// soon as the tab itself is (ComplexTabs' testStand tech gate).
function TestingPanel({
  onSelectComplex,
  tipDismissed,
  onDismissTip,
}: ComplexPanelProps & { tipDismissed: boolean; onDismissTip: () => void }) {
  const payloadProcessingUnlocked = useGameStore((s) =>
    isUnlockConditionMet(BUILDINGS.payloadProcessing.unlockCondition, unlockContextFromState(s)),
  );
  const testStandLevel = useGameStore((s) => s.buildings.testStand.level);
  const launchRailLevel = useGameStore((s) => s.buildings.launchRail.level);

  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <FirstEntryTip id="T-16" dismissed={tipDismissed} onDismiss={onDismissTip} />
      <div className="campus-grid">
        <BuildingTile buildingId="testStand" />
        <BuildingTile buildingId="launchRail" />
        {payloadProcessingUnlocked && <BuildingTile buildingId="payloadProcessing" />}
      </div>
      {testStandLevel >= 1 && <CertificationPanel />}
      {testStandLevel >= 1 && launchRailLevel >= 1 && <SoundingMissionPanel />}
      {launchRailLevel >= 1 && <ContractsPanel />}
    </>
  );
}

// GDD §7 / UI_SPEC §3.4: v1 only ever has padA (Pad B is Sprint 9, gated on Aurora I
// success + Reputation >= 40) — the Launch Sequence panel is still parameterized by
// PadId (core/auroraMission.ts iterates every pad that exists), just rendered once here.
function LaunchPanel({
  onSelectComplex,
  tipDismissed,
  onDismissTip,
  checklistTipDismissed,
  onDismissChecklistTip,
  onOpenConstellation,
}: ComplexPanelProps & {
  tipDismissed: boolean;
  onDismissTip: () => void;
  checklistTipDismissed: boolean;
  onDismissChecklistTip: () => void;
  onOpenConstellation: () => void;
}) {
  const vabLevel = useGameStore((s) => s.buildings.vab.level);
  // UI_SPEC §2b default: hidden until its own unlockCondition is met (not the teaser
  // pattern — that's Training Center only) — same treatment TestingPanel already gives
  // Payload Processing, since Launch Pad B's gate (Aurora I success + Rep >= 40) is well
  // past the Launch tab's own tech gate that reveals its siblings.
  const launchPadBUnlocked = useGameStore((s) =>
    isUnlockConditionMet(BUILDINGS.launchPadB.unlockCondition, unlockContextFromState(s)),
  );
  // Sprint 9: Launch Pad B's own Launch Sequence panel exists once mission.pads.padB has
  // been initialized (state/persistStore.ts's buyBuilding action does this the instant
  // the building reaches level 1) — reading the pad's presence, not the building's own
  // level, keeps this in lockstep with the one place that actually creates the pad slot.
  const padBExists = useGameStore((s) => s.mission.pads.padB !== undefined);
  const trackingStationLevel = useGameStore((s) => s.buildings.trackingStation.level);

  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <FirstEntryTip id="T-17" dismissed={tipDismissed} onDismiss={onDismissTip} />
      <div className="campus-grid">
        <BuildingTile buildingId="vab" />
        <BuildingTile buildingId="launchPad" />
        <BuildingTile buildingId="launchControl" />
        {/* UI_SPEC §2b (Sprint 9.5 disclosure audit): VAB/Pad/Control are needed to START
            an integration; Tracking Station is only needed to COMPLETE the checklist (and
            for the orbital-mission XP multiplier) — not the "everything at once" problem
            Campus/Production had, but the same staged-reveal spirit applies: it appears
            once the VAB is built, the natural next-step moment. */}
        {vabLevel >= 1 && (
          <BuildingTile buildingId="trackingStation">
            {/* UI_SPEC §2i (Sprint 10.5): Constellation View's own access point — only
                once the building itself is actually built (every pad-based launch
                requires 'trackingActive' checked, so no satellite dot can exist before
                this tile is built anyway). */}
            {trackingStationLevel >= 1 && (
              <button type="button" className="upgrade-button" onClick={onOpenConstellation}>
                View Constellation
              </button>
            )}
          </BuildingTile>
        )}
        {launchPadBUnlocked && <BuildingTile buildingId="launchPadB" />}
      </div>
      {/* T-06 (NARRATIVE §2): "Launch checklist" is a screen-mount moment, not a
          game-state predicate — same FirstEntryTip treatment as T-16/T-17, tied to the
          checklist panel's own reveal condition (core/ftue.ts's header note). */}
      {vabLevel >= 1 && (
        <FirstEntryTip id="T-06" dismissed={checklistTipDismissed} onDismiss={onDismissChecklistTip} />
      )}
      {vabLevel >= 1 && <LaunchSequencePanel padId="padA" />}
      {padBExists && <LaunchSequencePanel padId="padB" />}
    </>
  );
}

/** SPRINTS.md Sprint 8, task 1: contextual one-time tooltips (NARRATIVE §2, T-01..T-05/
 * T-07..T-09 — T-06 is LaunchPanel's own FirstEntryTip, see core/ftue.ts's header note).
 * Global slot (not tied to any one complex) since several of these moments — "Start,"
 * "afford your first hire," "a timer is running" — aren't specific to whichever tab
 * happens to be open. At most one shows at a time (core/ftue.ts's nextFtueTooltip picks
 * the highest-priority unseen-and-true one); dismissing it naturally reveals the next. */
function GlobalFtueTooltip({
  dismissed,
  onDismiss,
}: {
  dismissed: ReadonlySet<string>;
  onDismiss: (id: string) => void;
}) {
  const nextId = useGameStore((s) => nextFtueTooltip(s, dismissed));
  if (!nextId) return null;
  return <FirstEntryTip id={nextId} dismissed={false} onDismiss={() => onDismiss(nextId)} />;
}

/** UI_SPEC §4 (v3.5): "the instant a new Hardware tier is researched... a one-time toast
 * fires (NARRATIVE T-14) — not a Mission Log entry." `research.completed` only ever
 * grows, so the toast fires on the render right after a titanium->true transition,
 * never again — the baseline is captured at MOUNT (a returning player who already has
 * Titanium must not see this replay on every load). */
function TierChangeToast() {
  const hasTitanium = useGameStore((s) => s.research.completed.includes('titanium'));
  const seenRef = useRef(hasTitanium);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasTitanium && !seenRef.current) {
      seenRef.current = true;
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
  }, [hasTitanium]);

  if (!visible) return null;
  return (
    <div className="tier-toast" role="status" aria-live="polite">
      {narrativeText('T-14')}
    </div>
  );
}

/**
 * UI_SPEC §4: "Milestones: small non-blocking call-out card (title + one Mission Log
 * line), auto-dismisses." Read as Program Records (GDD §8 literally calls them
 * "Micro-milestones," displayed on the Records board) — the strongest textual match
 * for "milestone" anywhere in the docs; flagged here rather than silently assumed, in
 * case the intended reading was complex-unlock events instead (SPRINTS.md groups this
 * task with "locked complexes," which is the other plausible reading). Title = the
 * record's name (core/records.ts's RECORD_DEFS); the "one Mission Log line" is the
 * most recently added narrative.seen entry — records and their co-occurring Mission Log
 * beat almost always land in the same tick (e.g. firstOrbit + N-11), though the pairing
 * isn't a declared relationship anywhere in the code, so this degrades gracefully to
 * title-only when nothing new landed in narrative.seen the same render.
 */
function MilestoneCallout() {
  const records = useGameStore(useShallow((s) => s.records));
  const seen = useGameStore(useShallow((s) => s.narrative.seen));
  const prevRecordsRef = useRef(records);
  const prevSeenRef = useRef(seen);
  const [callout, setCallout] = useState<{ title: string; line: string | null } | null>(null);

  useEffect(() => {
    const newRecordIds = records.filter((id) => !prevRecordsRef.current.includes(id));
    const newSeenIds = seen.filter((id) => !prevSeenRef.current.includes(id));
    prevRecordsRef.current = records;
    prevSeenRef.current = seen;

    if (newRecordIds.length === 0) return;
    const recordId = newRecordIds[newRecordIds.length - 1] as RecordId;
    const line = newSeenIds.length > 0 ? narrativeText(newSeenIds[newSeenIds.length - 1]) : null;
    setCallout({ title: RECORD_DEFS[recordId].name, line });
    const t = setTimeout(() => setCallout(null), 5000);
    return () => clearTimeout(t);
  }, [records, seen]);

  if (!callout) return null;
  return (
    <div className="milestone-callout" role="status" aria-live="polite">
      <div className="milestone-callout__title">{callout.title}</div>
      {callout.line && <div className="milestone-callout__line">{callout.line}</div>}
    </div>
  );
}

/**
 * NARRATIVE §3 (Sprint 9): random events. "Wait as a pending card (never block play)" —
 * a non-modal card (no backdrop, doesn't intercept clicks elsewhere), always exactly the
 * two options the doc specifies. Copy resolved from data/events.ts's EventDef via
 * narrativeText (rule 9 — the doc's own E-01/E-01a/E-01b ids), never inlined here.
 */
function EventCard() {
  const pending = useGameStore((s) => s.events?.pending ?? null);
  const resolveEvent = useGameStore((s) => s.resolveEvent);

  if (!pending) return null;
  const def = EVENT_DEFS_BY_ID.get(pending.id);
  if (!def) return null;

  return (
    <div className="event-card">
      <div className="event-card__text">{narrativeText(def.narrativeId)}</div>
      <div className="event-card__options">
        <button type="button" className="upgrade-button" onClick={() => resolveEvent('A')}>
          {narrativeText(def.optionA.narrativeId)}
        </button>
        <button type="button" className="upgrade-button" onClick={() => resolveEvent('B')}>
          {narrativeText(def.optionB.narrativeId)}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [activeComplex, setActiveComplex] = useState<ComplexId>('campus');
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const dismissTip = (id: string) => setDismissedTips((prev) => new Set(prev).add(id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [constellationOpen, setConstellationOpen] = useState(false);

  // UI_SPEC §7: "reduced-motion setting disables rolling numbers and pulses." Applied
  // as a root-level data attribute so index.css can override every animation in one
  // place (tier-toast/milestone-callout fade, manual-action recharge/shake, pitch
  // feedback float, research-node pulse) rather than threading a prop through each.
  const reducedMotion = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  return (
    <div className="app">
      <AwayModal />
      <MilestoneScreen />
      <TierChangeToast />
      <MilestoneCallout />
      <EventCard />
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {constellationOpen && <ConstellationView onClose={() => setConstellationOpen(false)} />}
      {__DEV_TOOLS__ && (
        <div className="dev-tools-row">
          <TimeWarpControl />
          <DevResetButton />
        </div>
      )}
      <Ticker onOpenSettings={() => setSettingsOpen(true)} onOpenConstellation={() => setConstellationOpen(true)} />
      <SaveWarningBanner />
      <CurrentDirective />
      <ActiveProcessStrip onSelectComplex={setActiveComplex} />
      <PayrollBanner />
      <GlobalFtueTooltip dismissed={dismissedTips} onDismiss={dismissTip} />
      <ComplexTabs active={activeComplex} onSelect={setActiveComplex} />
      <main className="complex-panel">
        {activeComplex === 'campus' && <CampusPanel onSelectComplex={setActiveComplex} />}
        {activeComplex === 'production' && <ProductionPanel onSelectComplex={setActiveComplex} />}
        {activeComplex === 'research' && <ResearchTabPanel onSelectComplex={setActiveComplex} />}
        {activeComplex === 'flightXp' && <FlightXpTabPanel onSelectComplex={setActiveComplex} />}
        {activeComplex === 'testing' && (
          <TestingPanel
            onSelectComplex={setActiveComplex}
            tipDismissed={dismissedTips.has('T-16')}
            onDismissTip={() => dismissTip('T-16')}
          />
        )}
        {activeComplex === 'launch' && (
          <LaunchPanel
            onSelectComplex={setActiveComplex}
            tipDismissed={dismissedTips.has('T-17')}
            onDismissTip={() => dismissTip('T-17')}
            checklistTipDismissed={dismissedTips.has('T-06')}
            onDismissChecklistTip={() => dismissTip('T-06')}
            onOpenConstellation={() => setConstellationOpen(true)}
          />
        )}
      </main>
      <MissionLog />
    </div>
  );
}
