import { useState } from 'react';
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
import { TimeWarpControl } from './ui/TimeWarpControl';
import { DevResetButton } from './ui/DevResetButton';
import { useGameStore } from './state/persistStore';
import { formatCost } from './core/format';
import { isUnlockConditionMet, unlockContextFromState } from './core/unlockConditions';
import { BUILDINGS } from './data/buildings';
import type { ComplexId } from './core/types';

const RUSH_ORDER_COST_FUNDING = 150; // ECONOMY §2

interface ComplexPanelProps {
  onSelectComplex: (id: ComplexId) => void;
}

function CampusPanel({ onSelectComplex }: ComplexPanelProps) {
  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <div className="campus-grid">
        <BuildingTile buildingId="offices">
          <PitchButton />
        </BuildingTile>
        <BuildingTile buildingId="finance" />
        <BuildingTile buildingId="rndLab" />
        <BuildingTile buildingId="crewQuarters" />
        <BuildingTile buildingId="trainingCenter" />
        <StaffHiring />
        <PromotionPanel />
      </div>
      <ResearchPanel />
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
            <ManualActionButton
              label={`Rush Order (${formatCost({ funding: RUSH_ORDER_COST_FUNDING })})`}
              cooldownMs={5 * 60_000}
              disabled={funding < RUSH_ORDER_COST_FUNDING}
              feedbackText="+100"
              onAction={rushOrder}
            />
          )}
        </BuildingTile>
        <BuildingTile buildingId="refinery" />
        <BuildingTile buildingId="warehouse" />
        <BuildingTile buildingId="propellantDepot" />
      </div>
    </>
  );
}

// UI_SPEC §2b: Payload Processing stays completely hidden until Aurora I success (its
// appearance IS the post-climax beat) — everything else in Complex C is reachable as
// soon as the tab itself is (ComplexTabs' testStand tech gate).
function TestingPanel({ onSelectComplex }: ComplexPanelProps) {
  const payloadProcessingUnlocked = useGameStore((s) =>
    isUnlockConditionMet(BUILDINGS.payloadProcessing.unlockCondition, unlockContextFromState(s)),
  );

  return (
    <>
      <StaffAvailabilityChip onTap={() => onSelectComplex('campus')} />
      <div className="campus-grid">
        <BuildingTile buildingId="testStand" />
        <BuildingTile buildingId="launchRail" />
        {payloadProcessingUnlocked && <BuildingTile buildingId="payloadProcessing" />}
      </div>
    </>
  );
}

export function App() {
  const [activeComplex, setActiveComplex] = useState<ComplexId>('campus');

  return (
    <div className="app">
      <AwayModal />
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
        {activeComplex === 'testing' && <TestingPanel onSelectComplex={setActiveComplex} />}
      </main>
    </div>
  );
}
