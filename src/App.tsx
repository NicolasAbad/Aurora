import { useEffect, useRef, useState } from 'react';
import { Ticker } from './ui/Ticker';
import { ComplexTabs } from './ui/ComplexTabs';
import { BuildingTile } from './ui/BuildingTile';
import { PitchButton } from './ui/PitchButton';
import { ManualActionButton } from './ui/ManualActionButton';
import { StaffHiring } from './ui/StaffHiring';
import { PromotionPanel } from './ui/PromotionPanel';
import { ResearchPanel } from './ui/ResearchPanel';
import { PayrollBanner } from './ui/PayrollBanner';
import { AwayModal } from './ui/AwayModal';
import { ActiveProcessStrip } from './ui/ActiveProcessStrip';
import { StaffAvailabilityChip } from './ui/StaffAvailabilityChip';
import { CertificationPanel } from './ui/CertificationPanel';
import { SoundingMissionPanel } from './ui/SoundingMissionPanel';
import { ContractsPanel } from './ui/ContractsPanel';
import { LaunchSequencePanel } from './ui/LaunchSequencePanel';
import { MissionLog } from './ui/MissionLog';
import { TimeWarpControl } from './ui/TimeWarpControl';
import { DevResetButton } from './ui/DevResetButton';
import { useGameStore } from './state/persistStore';
import { formatCost } from './core/format';
import { isUnlockConditionMet, unlockContextFromState } from './core/unlockConditions';
import { narrativeText } from './data/narrative';
import { BUILDINGS } from './data/buildings';
import type { ComplexId } from './core/types';

const RUSH_ORDER_COST_FUNDING = 150; // ECONOMY §2
const CAMPUS_FINANCE_REVEAL_FUNDING = 150; // UI_SPEC §2d step 2

interface ComplexPanelProps {
  onSelectComplex: (id: ComplexId) => void;
}

/** UI_SPEC §2d: "the sequence below IS the FTUE for the opening minutes; each reveal is
 * a direct consequence of the player's last action." Steps 2-3 (Finance at 150 lifetime
 * Funding; Staff panel at Finance built) are naturally monotonic — lifetime Funding and
 * building levels never decrease in this game — so they're read live. Step 4 (Crew
 * Quarters + R&D Lab at the staff pool's first 2/2) is NOT monotonic once staff
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
        <BuildingTile buildingId="trainingCenter" />
        {staffPanelRevealed && <StaffHiring />}
        {staffPanelRevealed && <PromotionPanel />}
      </div>
      {/* UI_SPEC §2d: "Research panel is hidden entirely until R&D Lab is built." */}
      {rndLabLevel >= 1 && <ResearchPanel />}
    </>
  );
}

function ProductionPanel({ onSelectComplex }: ComplexPanelProps) {
  const supplyDepotLevel = useGameStore((s) => s.buildings.supplyDepot.level);
  const fabricationLevel = useGameStore((s) => s.buildings.fabrication.level);
  const funding = useGameStore((s) => s.resources.funding.amount);
  const gatherMaterials = useGameStore((s) => s.gatherMaterials);
  const rushOrder = useGameStore((s) => s.rushOrder);

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
        <BuildingTile buildingId="refinery" />
        <BuildingTile buildingId="warehouse" />
        <BuildingTile buildingId="propellantDepot" />
      </div>
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
}: ComplexPanelProps & { tipDismissed: boolean; onDismissTip: () => void }) {
  const vabLevel = useGameStore((s) => s.buildings.vab.level);

  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <FirstEntryTip id="T-17" dismissed={tipDismissed} onDismiss={onDismissTip} />
      <div className="campus-grid">
        <BuildingTile buildingId="vab" />
        <BuildingTile buildingId="launchPad" />
        <BuildingTile buildingId="launchControl" />
        <BuildingTile buildingId="trackingStation" />
      </div>
      {vabLevel >= 1 && <LaunchSequencePanel padId="padA" />}
    </>
  );
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
  return <div className="tier-toast">{narrativeText('T-14')}</div>;
}

export function App() {
  const [activeComplex, setActiveComplex] = useState<ComplexId>('campus');
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const dismissTip = (id: string) => setDismissedTips((prev) => new Set(prev).add(id));

  return (
    <div className="app">
      <AwayModal />
      <TierChangeToast />
      {__DEV_TOOLS__ && (
        <div className="dev-tools-row">
          <TimeWarpControl />
          <DevResetButton />
        </div>
      )}
      <Ticker />
      <ActiveProcessStrip onSelectComplex={setActiveComplex} />
      <PayrollBanner />
      <ComplexTabs active={activeComplex} onSelect={setActiveComplex} />
      <main className="complex-panel">
        {activeComplex === 'campus' && <CampusPanel onSelectComplex={setActiveComplex} />}
        {activeComplex === 'production' && <ProductionPanel onSelectComplex={setActiveComplex} />}
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
          />
        )}
      </main>
      <MissionLog />
    </div>
  );
}
