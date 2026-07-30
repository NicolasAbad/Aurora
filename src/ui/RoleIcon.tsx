import type { RoleId } from '../core/types';

/**
 * SPRINTS.md Sprint 10.5, item 5 (cheap win): staff panel role silhouette icons —
 * abstract, no faces, role-colored accent marks. Deliberately solid-filled (not the
 * blueprint line-icon language BuildingIcon uses) — a silhouette is a different visual
 * register for people than the technical-schematic look used for structures.
 */
export function RoleIcon({ role }: { role: RoleId }) {
  return (
    <svg viewBox="0 0 24 24" className={`role-icon role-icon--${role}`} aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21 C4 14 8 12 12 12 C16 12 20 14 20 21 Z" />
    </svg>
  );
}
