import { useRef, useState } from 'react';
import { useGameStore } from '../state/persistStore';
import { pitchYield } from '../core/economy';

const COOLDOWN_MS = 1000; // ECONOMY §2
const FEEDBACK_LIFETIME_MS = 900;

interface Feedback {
  id: number;
  amount: number;
}

export function PitchButton() {
  const officesLevel = useGameStore((s) => s.buildings.offices.level);
  const pitch = useGameStore((s) => s.pitch);
  const [cooling, setCooling] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextId = useRef(0);

  function handleClick() {
    if (cooling) return;
    pitch();

    setCooling(true);
    setTimeout(() => setCooling(false), COOLDOWN_MS);

    const id = nextId.current++;
    setFeedback((f) => [...f, { id, amount: pitchYield(officesLevel) }]);
    setTimeout(() => setFeedback((f) => f.filter((x) => x.id !== id)), FEEDBACK_LIFETIME_MS);
  }

  return (
    <div className="pitch-button-wrap">
      <button type="button" className="pitch-button" disabled={cooling} onClick={handleClick}>
        Pitch investors
      </button>
      {feedback.map((f) => (
        <span key={f.id} className="pitch-feedback">
          +{f.amount}
        </span>
      ))}
    </div>
  );
}
