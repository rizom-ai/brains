# @brains/whitepaper

White paper entity type for strategic long-form documents.

White papers are stored as markdown with structured frontmatter for lifecycle, audience, source relationships, cover images, and generated document attachments.

## Entity type

- Display name: White paper
- Entity type: `whitepaper`
- Directory sync path: `whitepaper/*.md`

## Frontmatter

```yaml
title: New Institutions
status: outline
slug: new-institutions
audience:
  - public-interest technology builders
thesis: Long-form thesis here.
sourceEntities:
  - entityType: post
    id: institutional-memory
coverImageId: cover-image-id
documents:
  - id: generated-pdf-id
appendices:
  - title: Key Terms
    type: glossary
```

Optional appendices can describe body sections such as key terms, further reading, methodology, references, or implementation details. Appendix content remains in the markdown body, for example `## Appendix: Key Terms`.

## Website templates

White papers register public site templates for website use:

- `whitepaper-list` renders archive/list pages from `whitepaper:entities`.
- `whitepaper-detail` renders individual whitepaper pages from `whitepaper:entities`.

The datasource parses markdown frontmatter/body and follows the existing list/detail route-generation pattern used by other entity packages.

## Printable PDF

White papers register a `printable` attachment provider. Durable PDF saves can use the existing document source-attachment flow:

```json
{
  "entityType": "document",
  "sourceAttachment": {
    "sourceEntityType": "whitepaper",
    "sourceEntityId": "new-institutions",
    "attachmentType": "printable"
  },
  "targetEntityType": "whitepaper",
  "targetEntityId": "new-institutions"
}
```

When attached, the document plugin appends the generated document reference to `documents: [{ id }]` on the whitepaper.
