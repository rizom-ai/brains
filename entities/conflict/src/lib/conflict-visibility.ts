type Visibility = "public" | "shared" | "restricted";

const STRICTNESS: Record<Visibility, number> = {
  public: 0,
  shared: 1,
  restricted: 2,
};

/**
 * Who may read a conflict: nobody who may not read its target, nobody the
 * losing text meant to exclude, and never the public. A losing edit can be
 * an unpublished draft of a public entry.
 */
export function conflictVisibility(
  target: Visibility,
  declared: Visibility | undefined,
): Exclude<Visibility, "public"> {
  const strictest = [target, declared ?? "public"].reduce((left, right) =>
    STRICTNESS[left] >= STRICTNESS[right] ? left : right,
  );
  return strictest === "public" ? "shared" : strictest;
}
