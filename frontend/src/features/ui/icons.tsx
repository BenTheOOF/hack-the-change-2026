import Link from "next/link";

// One small stroke icon set (24px grid) so no screen uses emoji or text glyphs as icons.
const PATHS = {
  today: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6",
  plus: "M12 5v14M5 12h14",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  message: "M4 5h16v11H9l-5 4z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  undo: "M4 11a8 8 0 1 1 2.3 5.7M4 4v7h7",
  play: "M7 4.5l12 7.5-12 7.5z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  circle: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  pulse: "M3 12h4l3-7 4 14 3-7h4",
  down: "M12 4v11M7 10l5 5 5-5M5 20h14",
  up: "M12 20V9M7 14l5-5 5 5M5 4h14",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path d="M3 17h6l4-10 6 19 4-12h6" />
        </svg>
      </span>
      <span>
        physio<span className="brand-light">trace</span>
      </span>
    </Link>
  );
}
