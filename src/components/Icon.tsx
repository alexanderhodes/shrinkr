const PATHS = {
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5",
  dims: "M3 8h18v8H3z M7 8v3 M11 8v4 M15 8v3 M19 8v4",
  weight: "M12 3a3.5 3.5 0 0 1 3.4 2.7H8.6A3.5 3.5 0 0 1 12 3z M5.5 8.5h13L20 20H4z",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  plus: "M12 5v14 M5 12h14",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  export: "M12 4v11 M7 11l5 5 5-5 M5 20h14",
  close: "M6 6l12 12 M18 6L6 18",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5h.01",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
