import { useState } from 'react';
import { Ticker } from './ui/Ticker';
import { ComplexTabs } from './ui/ComplexTabs';
import { BuildingTile } from './ui/BuildingTile';
import { PitchButton } from './ui/PitchButton';
import { StaffHiring } from './ui/StaffHiring';
import { PayrollBanner } from './ui/PayrollBanner';
import { AwayModal } from './ui/AwayModal';
import { TimeWarpControl } from './ui/TimeWarpControl';
import type { ComplexId } from './core/types';

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
      </main>
    </div>
  );
}
