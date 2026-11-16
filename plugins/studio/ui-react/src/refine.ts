import type { EntitySummary } from "./api";
import { entityTitle, sentenceLabel } from "./ui-utils";

/**
 * Refining from the library: picking entries in a collection whose entries
 * another type's generation uses up, and what Studio says once the refine
 * was confirmed. The words are the ones chat uses for the same thing.
 */

/** A confirmed refine: what was picked, and the entry the brain is writing. */
export interface RefineOutcome {
  /** The collection the entries were picked in. */
  sourceType: string;
  /** What one of its entries is called, e.g. "Note". */
  entryLabel: string;
  /** What the collection is called, e.g. "Notes". */
  sourceLabel: string;
  count: number;
  /** The collection the refined entry lands in, and what one is called. */
  targetType: string;
  targetLabel: string;
  /** The placeholder the generation fills. */
  entityId: string;
}

export interface RefineNotice {
  state: "writing" | "done" | "failed";
  tone: "info" | "success" | "error";
  text: string;
}

/** The picks with this entry added, or dropped when it was picked. */
export function togglePick(picked: readonly string[], id: string): string[] {
  return picked.includes(id)
    ? picked.filter((candidate) => candidate !== id)
    : [...picked, id];
}

/** The picked ids the list still shows, in the order it shows them. */
export function pickedInListOrder(
  picked: readonly string[],
  entities: readonly EntitySummary[],
): string[] {
  return entities.flatMap(({ id }) => (picked.includes(id) ? [id] : []));
}

/** The head's line while entries are picked. */
export function pickedLine(count: number, total: number): string {
  return `${count} picked of ${total}`;
}

/** "note" for one, "3 notes" for several, as a sentence reads them. */
function counted(count: number, entryLabel: string, plural: string): string {
  return count === 1
    ? sentenceLabel(entryLabel)
    : `${count} ${sentenceLabel(plural)}`;
}

/** The page's one action while entries are picked. */
export function refineActionLabel(
  count: number,
  entryLabel: string,
  collectionLabel: string,
): string {
  return `Refine ${counted(count, entryLabel, collectionLabel)}`;
}

/** The dialog's question. */
export function refineQuestion(
  count: number,
  entryLabel: string,
  collectionLabel: string,
): string {
  return count === 1
    ? `Refine this ${sentenceLabel(entryLabel)}?`
    : `Refine ${count} ${sentenceLabel(collectionLabel)} into one?`;
}

/**
 * What Studio says in the collection a refine lands in: that the brain is
 * writing, what it wrote and that the picked entries are gone, or that it
 * could not write and they are kept. Nothing in any other collection.
 */
export function refineNotice(
  outcome: RefineOutcome | null,
  entityType: string | null,
  entities: readonly EntitySummary[] | null,
): RefineNotice | null {
  if (outcome?.targetType !== entityType) return null;
  const { count, entryLabel, sourceLabel } = outcome;
  const numbered = `${count} ${sentenceLabel(count === 1 ? entryLabel : sourceLabel)}`;
  const written = entities?.find(({ id }) => id === outcome.entityId);
  const status = written?.frontmatter["status"];
  if (!written || status === "generating") {
    return {
      state: "writing",
      tone: "info",
      text: `Refining ${numbered} into one. ${
        count === 1 ? "It is" : "They are"
      } removed once it is saved.`,
    };
  }
  if (status === "failed") {
    const error = written.frontmatter["error"];
    const why = typeof error === "string" && error.trim() ? `: ${error}` : "";
    return {
      state: "failed",
      tone: "error",
      text: `The brain could not write the ${sentenceLabel(outcome.targetLabel)}${why}. Your ${numbered} ${
        count === 1 ? "is" : "are"
      } still in ${sourceLabel}.`,
    };
  }
  return {
    state: "done",
    tone: "success",
    text: `Refined ${numbered} into “${entityTitle(written)}”. The ${sentenceLabel(
      count === 1 ? entryLabel : sourceLabel,
    )} ${count === 1 ? "was" : "were"} removed.`,
  };
}
