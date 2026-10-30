import type { GuideRecipe } from "../src/schemas/guide-frontmatter";
import type { GuideWithData } from "../src/schemas/guide";

export const writerMarkdown = `---
title: Moving in as a writer
slug: writer
order: 10
persona: The writer
for: You have years of essays and a folder of drafts.
recipe: professional
material:
  - from: Drafts and fragments
    where: Google Docs, Word, a notes app
    becomes: note
    how: Download as Markdown, bring the files in
---

## Bring your drafts in

Upload the files in chat and ask the brain to keep them as notes.

Exact steps: [Content management](/docs/content-management).
`;

export function guideMarkdown(slug: string, order: number, extra = ""): string {
  return `---
title: Moving in as ${slug}
slug: ${slug}
order: ${order}
persona: The ${slug}
for: You are a ${slug}.
material: []${extra}
---

## Start

Text for ${slug}.
`;
}

export function guideWithData(
  slug: string,
  order: number,
  recipe: GuideRecipe | null = null,
): GuideWithData {
  const fields = {
    title: `Moving in as ${slug}`,
    slug,
    order,
    persona: `The ${slug}`,
    for: `You are a ${slug}.`,
    recipe,
    brings: null,
    material: [],
  };
  return {
    id: slug,
    entityType: "guide",
    content: guideMarkdown(slug, order),
    created: "2026-10-29T00:00:00.000Z",
    updated: "2026-10-29T00:00:00.000Z",
    visibility: "public",
    contentHash: `hash-${slug}`,
    metadata: fields,
    frontmatter: fields,
    body: `## Start\n\nText for ${slug}.`,
  };
}

const writerBody = `## Bring your drafts in

Upload the files in chat and ask the brain to keep them as **notes**.

Exact steps: [Interface setup](/docs/interface-setup), [Content management](/docs/content-management).

## A week later

The brain has read everything you brought.

- **Answers from your work:** what you wrote on a subject.
- **Drafts from your notes** when you ask.

Exact steps: [Feature overview](/docs/feature-overview).`;

/** A designed guide: a recipe, material that maps onto types, and stages. */
export function writerGuide(): GuideWithData {
  const fields = {
    title: "Moving in as a writer",
    slug: "writer",
    order: 10,
    persona: "The writer",
    for: "You have years of essays and a folder of drafts.",
    recipe: "professional" as const,
    brings: null,
    material: [
      {
        from: "Drafts and fragments",
        where: "Google Docs, Word",
        becomes: "note",
        how: "Download as Markdown, bring the files in",
      },
      {
        from: "Published essays",
        where: "Substack, Medium",
        becomes: "post",
        how: "Upload in chat; the original address stays canonical",
      },
      {
        from: "Notebooks",
        where: "A notes app",
        becomes: "note",
        how: "Export as Markdown",
      },
    ],
  };
  return {
    ...guideWithData("writer", 10),
    metadata: fields,
    frontmatter: fields,
    body: writerBody,
  };
}
