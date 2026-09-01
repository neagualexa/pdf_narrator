import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query from JS.
 *
 * The pane split is applied as an inline `grid-template-columns`, and inline
 * styles beat stylesheet rules - so the narrow layout cannot be expressed in
 * CSS alone. The same query drives both, keeping them from disagreeing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
