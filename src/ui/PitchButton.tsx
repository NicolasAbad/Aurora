import { useGameStore } from '../state/persistStore';
import { pitchYield } from '../core/economy';
import { ManualActionButton } from './ManualActionButton';

const COOLDOWN_MS = 1000; // ECONOMY §2

export function PitchButton() {
  const officesLevel = useGameStore((s) => s.buildings.offices.level);
  const pitch = useGameStore((s) => s.pitch);

  return (
    <ManualActionButton
      label="Pitch investors"
      cooldownMs={COOLDOWN_MS}
      buttonClassName="pitch-button"
      feedbackText={() => `+${pitchYield(officesLevel)}`}
      onAction={pitch}
    />
  );
}
