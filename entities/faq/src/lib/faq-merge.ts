import { createFaqContent, parseFaqContent, faqMetadata } from "./faq-content";
import type { FaqEntity, FaqAlternative, FaqFrontmatter } from "../schemas/faq";

/** Prepare once; the caller chooses a single-entity CAS or atomic pair write. */
export function prepareFaqMerge(
  faq: Readonly<FaqEntity>,
  merge: { asks: number; alternatives?: FaqAlternative[] },
): FaqEntity {
  const { frontmatter, answer, alternatives } = parseFaqContent(faq.content);
  const known = [
    answer,
    ...alternatives.map((alternative) => alternative.answer),
  ];
  const newAlternatives = (merge.alternatives ?? []).filter(
    (alternative) =>
      !known.some((text) => text.trim() === alternative.answer.trim()),
  );
  const merged: FaqFrontmatter = {
    ...frontmatter,
    asked: frontmatter.asked + merge.asks,
  };
  return {
    ...faq,
    content: createFaqContent(merged, answer, [
      ...alternatives,
      ...newAlternatives,
    ]),
    metadata: faqMetadata(merged),
  };
}
