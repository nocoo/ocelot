export interface Route {
  repository: number | null;
  path: string | null;
  anchor: string;
}

export function readRoute(href: string): Route {
  const url = new URL(href);
  const id = Number(url.searchParams.get("repo"));
  let anchor = "";
  try {
    anchor = decodeURIComponent(url.hash.slice(1));
  } catch {
    /* Invalid fragments do not prevent opening a note. */
  }
  return {
    repository: Number.isSafeInteger(id) && id > 0 ? id : null,
    path: url.searchParams.get("note"),
    anchor,
  };
}

export function browserServices(win: Window, doc: Document) {
  return {
    route: () => readRoute(win.location.href),
    navigate: (url: string, replace: boolean) =>
      replace ? win.history.replaceState(null, "", url) : win.history.pushState(null, "", url),
    visible: () => doc.visibilityState === "visible",
    listen: (navigate: () => void, visible: () => void, search: () => void) => {
      const onVisibility = () => {
        if (doc.visibilityState === "visible") visible();
      };
      const onKey = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          search();
        }
      };
      win.addEventListener("popstate", navigate);
      doc.addEventListener("visibilitychange", onVisibility);
      doc.addEventListener("keydown", onKey);
      return () => {
        win.removeEventListener("popstate", navigate);
        doc.removeEventListener("visibilitychange", onVisibility);
        doc.removeEventListener("keydown", onKey);
      };
    },
    readScale: () => {
      try {
        const value = Number(win.localStorage.getItem("ocelot-font-scale"));
        return value >= 0.9 && value <= 1.3 ? value : 1;
      } catch {
        return 1;
      }
    },
    writeScale: (scale: number) => {
      try {
        win.localStorage.setItem("ocelot-font-scale", String(scale));
      } catch {
        /* Preferences still work for this session. */
      }
    },
    readFullWidth: () => {
      try {
        return win.localStorage.getItem("ocelot-full-width") === "true";
      } catch {
        return false;
      }
    },
    writeFullWidth: (fullWidth: boolean) => {
      try {
        win.localStorage.setItem("ocelot-full-width", String(fullWidth));
      } catch {
        /* Preferences still work for this session. */
      }
    },
  };
}

export type BrowserServices = ReturnType<typeof browserServices>;
