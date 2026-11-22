/**
 * Which stored form a moved type writes (docs/plans/one-stored-form.md).
 * `old` is alpha R: every moved type reads the old and the new form and
 * writes the old one, and the quiet rewrite on start leaves stored rows
 * alone. `new` is alpha W: every moved type writes the new form and the
 * rewrite brings stored rows to it. A definition and the boot path read
 * this one switch; tests build both forms explicitly.
 */
export type StoredForm = "old" | "new";

/** Flipped to "new" in its own commit, for alpha W. */
export const storedFormWrites: StoredForm = "new";
