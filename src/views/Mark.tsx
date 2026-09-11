export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "ocelot-mark small" : "ocelot-mark"}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="18" fill="currentColor" />
      <path d="m17 18 11 7h8l11-7-2 21-8 9H27l-8-9Z" fill="var(--mark-paper)" />
      <path
        d="m23 31 8 3-5 4m15-7-8 3 5 4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="m29 41 3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="24" r="1.8" fill="currentColor" />
      <circle cx="41" cy="24" r="1.8" fill="currentColor" />
    </svg>
  );
}
