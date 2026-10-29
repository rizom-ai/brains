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

export function guideWithData(slug: string, order: number): GuideWithData {
  const fields = {
    title: `Moving in as ${slug}`,
    slug,
    order,
    persona: `The ${slug}`,
    for: `You are a ${slug}.`,
    recipe: null,
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
