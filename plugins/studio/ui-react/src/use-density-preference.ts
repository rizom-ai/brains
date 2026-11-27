import { useCallback, useState } from "react";

/** How much a Library row shows: its excerpt and cover, or one line. */
export type RowDensity = "comfortable" | "compact";

const KEY = "studio.density";

/** The density chosen in this browser; comfortable until one is chosen. */
export function readDensity(): RowDensity {
  try {
    return window.localStorage.getItem(KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    // Storage may be blocked; rows then start comfortable.
    return "comfortable";
  }
}

export function storeDensity(density: RowDensity): void {
  try {
    if (density === "compact") window.localStorage.setItem(KEY, density);
    else window.localStorage.removeItem(KEY);
  } catch {
    // The choice still holds for this visit.
  }
}

/** The row density, remembered in this browser for every list. */
export function useDensityPreference(): [
  density: RowDensity,
  setDensity: (density: RowDensity) => void,
] {
  const [density, setState] = useState(readDensity);
  const setDensity = useCallback((next: RowDensity): void => {
    setState(next);
    storeDensity(next);
  }, []);
  return [density, setDensity];
}
