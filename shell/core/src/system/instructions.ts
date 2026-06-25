import type { SystemServices } from "./types";

const ENTITY_TYPE_EXAMPLES: { entityType: string; example: string }[] = [
  { entityType: "post", example: '- "Write a blog post" → entityType: "post"' },
  {
    entityType: "deck",
    example: '- "Create a presentation/deck" → entityType: "deck"',
  },
  {
    entityType: "note",
    example: '- "Save this as a note" → entityType: "note"',
  },
  {
    entityType: "social-post",
    example: '- "Draft a LinkedIn post" → entityType: "social-post"',
  },
  {
    entityType: "newsletter",
    example: '- "Create a newsletter" → entityType: "newsletter"',
  },
  {
    entityType: "project",
    example: '- "Add a project" → entityType: "project"',
  },
  {
    entityType: "agent",
    example: '- "List my contacts/agents" → entityType: "agent"',
  },
];

export function createSystemInstructions(services: SystemServices): string {
  const types = services.entityService.getEntityTypes();
  const registered = new Set(types);
  const typeExamples = ENTITY_TYPE_EXAMPLES.filter((entry) =>
    registered.has(entry.entityType),
  ).map((entry) => entry.example);

  return [
    "## Entity CRUD",
    "",
    "Use these system tools for ALL entity operations:",
    "",
    "- **system_create**: Create or generate any entity. " +
      "Requires confirmation before persisting or queueing creation; never pass `confirmed: true` on the initial user request. " +
      'Pass `source`: `{ kind: "text", content }` for direct creation, `{ kind: "generate", prompt }` for AI generation, `{ kind: "url", url }` for URL-first flows, `{ kind: "prior-response" }` for prior assistant response saves, or `{ kind: "attachment", sourceEntityType, sourceEntityId, attachmentType }` for source-derived artifact saves such as deck carousel PDFs, rendered OG images, and printable post/project/product PDFs. Use `system_upload_save` instead for raw uploaded file preservation. ' +
      "When creating an entity with a cover image, pass `coverImage: true` or `coverImage: { generate: true, prompt }`; do not guess a future entity ID. " +
      `Available entity types: ${types.join(", ")}.`,
    "- **system_upload_save**: Save a live raw uploaded file as a durable document/image/etc. Requires confirmation before persisting; never pass `confirmed: true` on the initial user request. ",
    "- **system_update**: Modify an entity's fields or content. " +
      "Use `fields` for title, status, coverImageId, ogImageId, and other frontmatter/metadata changes. " +
      "When the user explicitly asks to rename, retitle, approve, publish, archive, or otherwise change fields, call `system_update`; do not just retrieve the entity or claim it was changed. " +
      "Requires confirmation before applying changes.",
    "- **system_delete**: Remove an entity. " +
      "Requires confirmation before deleting. Never pass `confirmed: true` on the initial user request; call without `confirmed` so the confirmation flow can ask the user first. Protected identity/profile records such as brain-character and anchor-profile cannot be deleted; update them instead.",
    "- **system_get**: Retrieve a specific entity by type and ID/slug/title.",
    "- **system_list**: List entities by type with optional filters.",
    "- **system_search**: Semantic search across all entities.",
    "",
    "When a user asks to create content, determine the entity type from context:",
    ...typeExamples,
  ].join("\n");
}
