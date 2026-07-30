import type { MissionLogCategory } from '../core/missionLogCategory';

/** SPRINTS.md Sprint 10.5, item 5 (cheap win): Mission Log category icon badges, one
 * consistent glyph per category — same thin-stroke blueprint line language as
 * BuildingIcon, at feed-entry scale. */
function iconShapes(category: MissionLogCategory) {
  switch (category) {
    case 'rocket':
      return (
        <>
          <path d="M12 3 L14.5 9 L14.5 17 L9.5 17 L9.5 9 Z" />
          <path d="M9.5 17 L7 20 L9.5 20 Z" />
          <path d="M14.5 17 L17 20 L14.5 20 Z" />
        </>
      );
    case 'flask':
      return (
        <>
          <line x1="9" y1="3" x2="15" y2="3" />
          <path d="M10 3 V8 L6 18 A2 2 0 0 0 8 21 H16 A2 2 0 0 0 18 18 L14 8 V3" />
        </>
      );
    case 'people':
      return (
        <>
          <circle cx="12" cy="7" r="4" />
          <path d="M4 21 C4 14 8 12 12 12 C16 12 20 14 20 21 Z" />
        </>
      );
    case 'building':
      return (
        <>
          <rect x="5" y="4" width="14" height="17" />
          <line x1="5" y1="10" x2="19" y2="10" />
          <rect x="10.5" y="15" width="3" height="6" />
        </>
      );
    case 'document':
      return (
        <>
          <path d="M6 3 H15 L18 6 V21 H6 Z" />
          <path d="M15 3 V6 H18" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </>
      );
    case 'star':
      return <path d="M12 3 L14.5 9.5 L21 10 L16 14.3 L17.5 21 L12 17.3 L6.5 21 L8 14.3 L3 10 L9.5 9.5 Z" />;
  }
}

export function MissionLogIcon({ category }: { category: MissionLogCategory }) {
  return (
    <svg viewBox="0 0 24 24" className={`mission-log-icon mission-log-icon--${category}`} aria-hidden="true">
      {iconShapes(category)}
    </svg>
  );
}
