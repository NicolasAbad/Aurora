import { useState } from 'react';
import { Ticker } from './ui/Ticker';
import { ComplexTabs } from './ui/ComplexTabs';
import { BuildingTile } from './ui/BuildingTile';
import { PitchButton } from './ui/PitchButton';
import { ManualActionButton } from './ui/ManualActionButton';
import { StaffHiring } from './ui/StaffHiring';
import { PayrollBanner } from './ui/PayrollBanner';
import { AwayModal } from './ui/AwayModal';
import { TimeWarpControl } from './ui/TimeWarpControl';
import { useGameStore } from './state/persistStore';
import type { ComplexId } from './core/types';

function ProductionPanel() {
  const supplyDepotLevel = useGameStore((s) => s.buildings.supplyDepot.level);
  const fabricationLevel = useGameStore((s) => s.buildings.fabrication.level);
  const funding = useGameStore((s) => s.resources.funding.amount);
  const gatherMaterials = useGameStore((s) => s.gatherMaterials);
  const rushOrder = useGameStore((s) => s.rushOrder);

  return (
    <div className="campus-grid">
      <BuildingTile buildingId="supplyDepot">
        {supplyDepotLevel >= 1 && (
          <ManualActionButton
            label="Gather materials"
            cooldownMs={1000}
            feedbackText="+5 M"
            onAction={gatherMaterials}
          />
        )}
      </BuildingTile>
      <BuildingTile buildingId="fabrication">
        {fabricationLevel >= 1 && (
          <ManualActionButton
            label="Rush Order (150 F)"
            cooldownMs={5 * 60_000}
            disabled={funding < 150}
            feedbackText="+100 M"
            onAction={rushOrder}
          />
        )}
      </BuildingTile>
      <BuildingTile buildingId="refinery" />
      <BuildingTile buildingId="warehouse" />
      <BuildingTile buildingId="propellantDepot" />
    </div>
  );
}

export function App() {
  const [activeComplex, setActiveComplex] = useState<ComplexId>('campus');

  return (
    <div className="app">
      <AwayModal />
      {__DEV_TOOLS__ && <TimeWarpControl />}
      <Ticker />
      <PayrollBanner />
      <ComplexTabs active={activeComplex} onSelect={setActiveComplex} />
      <main className="complex-panel">
        {activeComplex === 'campus' && (
          <div className="campus-grid">
            <BuildingTile buildingId="offices">
              <PitchButton />
            </BuildingTile>
            <BuildingTile buildingId="finance" />
            <BuildingTile buildingId="rndLab" />
            <BuildingTile buildingId="crewQuarters" />
            <StaffHiring />
          </div>
        )}
        {activeComplex === 'production' && <ProductionPanel />}
      </main>
    </div>
  );
}
