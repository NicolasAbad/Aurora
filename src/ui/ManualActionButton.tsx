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
  feedbackText: string | (() => string);
  onAction: () => void;
  /** Base look — Pitch stays visually prominent (`pitch-button`), other manual verbs
   * use the more neutral `upgrade-button` look. Cooldown/recharge/shake behavior is
   * identical either way (UI_SPEC §4 applies to every manual-action cooldown, not just
   * Pitch's). */
  buttonClassName?: string;
}

/**
 * Shared shape for ECONOMY §2's "evolving manual verbs" (Pitch, Gather Materials, Rush
 * Order): cooldown + floating feedback + UI_SPEC §4's cooldown-feel rule — a visible
 * recharge fill for the cooldown duration, and a click landing during cooldown gets an
 * acknowledging shake rather than silently doing nothing (the button is never `disabled`
 * natively — a disabled element can't receive the click that needs acknowledging).
 * Cooldown is UI-only; core actions have no cooldown of their own.
 */
export function ManualActionButton({
  label,
  cooldownMs,
  disabled,
  feedbackText,
  onAction,
  buttonClassName = 'upgrade-button',
}: ManualActionButtonProps) {
  const [cooling, setCooling] = useState(false);
  const [rechargeKey, setRechargeKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const nextId = useRef(0);

  function handleClick() {
    if (disabled) return;

    if (cooling) {
      // Acknowledged, not ignored (UI_SPEC §4: "a cooldown must read as rhythm, never
      // as a dead button") — re-trigger the shake even if one is already mid-animation.
      setShaking(false);
      requestAnimationFrame(() => setShaking(true));
      return;
    }

    onAction();

    setCooling(true);
    setRechargeKey((k) => k + 1); // remounts the recharge overlay so its animation restarts
    setTimeout(() => setCooling(false), cooldownMs);

    const id = nextId.current++;
    setFeedback((f) => [...f, { id, text: typeof feedbackText === 'function' ? feedbackText() : feedbackText }]);
    setTimeout(() => setFeedback((f) => f.filter((x) => x.id !== id)), FEEDBACK_LIFETIME_MS);
  }

  return (
    <div className="manual-action-wrap">
      <button
        type="button"
        className={`${buttonClassName}${shaking ? ' manual-action-button--shake' : ''}`}
        disabled={disabled}
        onClick={handleClick}
        onAnimationEnd={() => setShaking(false)}
      >
        <span className="manual-action-button__label">{label}</span>
        {cooling && (
          <span
            key={rechargeKey}
            className="manual-action-button__recharge"
            style={{ animationDuration: `${cooldownMs}ms` }}
          />
        )}
      </button>
      {feedback.map((f) => (
        <span key={f.id} className="manual-action-feedback">
          {f.text}
        </span>
      ))}
    </div>
  );
}
