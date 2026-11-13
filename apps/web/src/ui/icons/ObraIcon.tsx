import './obraIcon.css';

/** Line icons of the Obra reference (docs/design/ui-obra-reference.html), drawn on a 24 x 24 grid. */
export const OBRA_ICON_PATHS = {
  lupa: '<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5"/>',
  topa: '<path d="M3 17h11v-5H8l-2 5"/><path d="M14 13h3l2 4"/><circle cx="7" cy="18" r="2"/><circle cx="14" cy="18" r="2"/><path d="M19 9v9h2"/>',
  mano: '<path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11M12 10V8.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-4-2l-3-4.5a1.5 1.5 0 0 1 2.4-1.8L9 15"/>',
  cab: '<rect x="6" y="5" width="12" height="15" rx="1"/><path d="M12 5v15M12 2v3"/>',
  structure: '<path d="M3 20h18M5 20V9h14v11M5 14h14M9 9V5h6v4"/>',
  transport:
    '<rect x="7" y="3" width="10" height="18" rx="1"/><path d="M10 8l2-2 2 2M10 16l2 2 2-2"/>',
  offices:
    '<rect x="4" y="3" width="16" height="18"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
  hotel: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  commerce:
    '<path d="M4 9l2-5h12l2 5M4 9h16v11H4zM4 9a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0"/><path d="M10 20v-5h4v5"/>',
  services: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  escalator: '<path d="M3 19h4l10-12h4M5 15l9-10"/>',
  elevator: '<rect x="5" y="3" width="14" height="18"/><path d="M9 9l3-3 3 3M9 15l3 3 3-3"/>',
  elevatorService: '<rect x="5" y="3" width="14" height="18"/><path d="M9 12h6M12 9v6"/>',
  elevatorExpress:
    '<rect x="5" y="3" width="14" height="18"/><path d="M10 7l-2 5h4l-2 5M15 7v10"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  finance: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  fire: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 2-2 1-6 1-9z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  // Units without a drawing in the reference.
  generic: '<rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16"/>',
  bed: '<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M7 3v6M5 3v6M9 3v6M16 3c-2 2-2 6 0 8v10"/>',
  film: '<rect x="3" y="5" width="18" height="14"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  party: '<path d="M5 20l4-12 8 8zM12 6l1-3M16 8l3-2M18 12l3 1"/>',
  recycle: '<path d="M8 6l4-3 4 3M12 3v8M5 14l-2 5h8M19 14l2 5h-8M16 19l-3-3 3-3"/>',
  medical: '<rect x="4" y="4" width="16" height="16"/><path d="M12 8v8M8 12h8"/>',
  housekeeping: '<path d="M6 21h12M9 21V9h6v12M10 9V4h4v5"/>',
  parking: '<rect x="4" y="3" width="16" height="18"/><path d="M10 17V8h3a3 3 0 0 1 0 6h-3"/>',
} as const;

export type ObraIconName = keyof typeof OBRA_ICON_PATHS;

export interface ObraIconProps {
  name: ObraIconName;
  class?: string;
}

export function ObraIcon({ name, class: className }: ObraIconProps) {
  return (
    <svg
      class={className === undefined ? 'obra-icon' : `obra-icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: OBRA_ICON_PATHS[name] }}
    />
  );
}
