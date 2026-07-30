import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { isManualVerbLowValue, pitchYield } from '../core/economy';
import { getResourceRatePerSecond } from '../core/selectors';
import { ManualActionButton } from './ManualActionButton';

const COOLDOWN_MS = 1000; // ECONOMY §2

export function PitchButton() {
  const officesLevel = useGameStore((s) => s.buildings.offices.level);
  const production = useGameStore(useShallow((s) => ({ buildings: s.buildings, staff: s.staff })));
  const modifiers = useGameStore((s) => s.modifiers);
  const pitch = useGameStore((s) => s.pitch);

  const yieldAmount = pitchYield(officesLevel);
  // UI_SPEC §4c v3.6: same net-of-salary Funding rate the ticker itself shows (Ticker.tsx).
  const fundingRate = getResourceRatePerSecond(production, 'funding', modifiers, Date.now());

  return (
    <ManualActionButton
      label="Pitch investors"
      cooldownMs={COOLDOWN_MS}
      buttonClassName="pitch-button"
      feedbackText={() => `+${yieldAmount}`}
      onAction={pitch}
      receded={isManualVerbLowValue(yieldAmount, fundingRate)}
    />
  );
}
