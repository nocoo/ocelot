import { useTheme } from "@nocoo/basalt/providers/theme";
import { useEffect, useState } from "react";

export function useResolvedTheme() {
  const { theme, setTheme } = useTheme();
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return { resolvedTheme: theme === "system" ? (systemDark ? "dark" : "light") : theme, setTheme };
}
