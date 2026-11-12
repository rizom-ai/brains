import { compareIds } from "@brains/utils/sort";
import type { DocWithData } from "../schemas/doc";

export type GroupedDocs = Array<{ section: string; docs: DocWithData[] }>;

const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Docs in reading order: by order, then title, then id. */
export function sortDocs(docs: DocWithData[]): DocWithData[] {
  return [...docs].sort(
    (a, b) =>
      a.metadata.order - b.metadata.order ||
      a.metadata.title.localeCompare(b.metadata.title) ||
      compareIds(a.id, b.id),
  );
}

export function groupDocs(docs: DocWithData[]): GroupedDocs {
  const groups = new Map<string, DocWithData[]>();
  for (const doc of sortDocs(docs)) {
    const section = doc.metadata.section;
    groups.set(section, [...(groups.get(section) ?? []), doc]);
  }
  return [...groups.entries()].map(([section, sectionDocs]) => ({
    section,
    docs: sectionDocs,
  }));
}

export function hrefFor(doc: DocWithData): string {
  return `/docs/${doc.metadata.slug}`;
}

export function sectionId(index: number): string {
  return `section-${index + 1}`;
}

export function romanNumeral(index: number): string {
  return numerals[index] ?? String(index + 1);
}
