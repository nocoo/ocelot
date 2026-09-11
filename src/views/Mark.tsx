export function Mark({ small = false }: { small?: boolean }) {
  return (
    <img
      className={small ? "ocelot-mark small" : "ocelot-mark"}
      src="/logo-80.png"
      srcSet="/logo-80.png 1x, /logo-160.png 2x"
      width="80"
      height="80"
      alt=""
      aria-hidden="true"
    />
  );
}
