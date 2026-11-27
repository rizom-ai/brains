import { useCallback, useState } from "react";

const key = (entityType: string): string => `studio.inspector.${entityType}`;

function storedHidden(entityType: string): boolean {
  try {
    return window.localStorage.getItem(key(entityType)) === "hidden";
  } catch {
    // Storage may be blocked; the inspector then starts shown.
    return false;
  }
}

/**
 * Whether an entry's inspector is hidden, remembered per type in this
 * browser: someone who writes notes without properties hides it once.
 */
export function useInspectorPreference(
  entityType: string,
): [hidden: boolean, setHidden: (hidden: boolean) => void] {
  const [state, setState] = useState(() => ({
    entityType,
    hidden: storedHidden(entityType),
  }));
  // Another type keeps its own preference; read it on the same paint.
  const current =
    state.entityType === entityType
      ? state
      : { entityType, hidden: storedHidden(entityType) };
  if (current !== state) setState(current);
  const setHidden = useCallback(
    (hidden: boolean): void => {
      setState({ entityType, hidden });
      try {
        if (hidden) window.localStorage.setItem(key(entityType), "hidden");
        else window.localStorage.removeItem(key(entityType));
      } catch {
        // The choice still holds for this visit.
      }
    },
    [entityType],
  );
  return [current.hidden, setHidden];
}
