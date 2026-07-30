/** UI_SPEC §1b item 3 (Sprint 11, "checklist transitions"): "checkmarks that draw
 * themselves (animated stroke)" — replaces the plain ✓ glyph. A fresh mount every time a
 * checklist item flips to done (React swaps the '○' string child for this component
 * entirely), so the draw-in animation always replays without needing a key trick. */
export function AnimatedCheck() {
  return (
    <svg viewBox="0 0 24 24" className="animated-check" aria-hidden="true">
      <path d="M4 12.5 L9.5 18 L20 6" />
    </svg>
  );
}
