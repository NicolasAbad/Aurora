import { useRef, useState } from 'react';

const FEEDBACK_LIFETIME_MS = 900;

interface Feedback {
  id: number;
  text: string;
}

interface ManualActionButtonProps {
  label: string;
  cooldownMs: number;
  disabled?: boolean;
  feedbackText: string;
  onAction: () => void;
}

/** Shared shape for ECONOMY §2's "evolving manual verbs" (Gather Materials, Rush
 * Order) — cooldown + floating feedback, same pattern PitchButton established. The
 * cooldown is UI-only (core actions have no cooldown of their own), matching Pitch.
 * `disabled` gates unaffordable/unlocked-but-can't-afford states from the caller (same
 * responsibility split as BuildingTile's own upgrade button). */
export function ManualActionButton({
  label,
  cooldownMs,
  disabled,
  feedbackText,
  onAction,
}: ManualActionButtonProps) {
  const [cooling, setCooling] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextId = useRef(0);

  function handleClick() {
    if (cooling || disabled) return;
    onAction();

    setCooling(true);
    setTimeout(() => setCooling(false), cooldownMs);

    const id = nextId.current++;
    setFeedback((f) => [...f, { id, text: feedbackText }]);
    setTimeout(() => setFeedback((f) => f.filter((x) => x.id !== id)), FEEDBACK_LIFETIME_MS);
  }

  return (
    <div className="pitch-button-wrap">
      <button type="button" className="upgrade-button" disabled={cooling || disabled} onClick={handleClick}>
        {label}
      </button>
      {feedback.map((f) => (
        <span key={f.id} className="pitch-feedback">
          {f.text}
        </span>
      ))}
    </div>
  );
}
