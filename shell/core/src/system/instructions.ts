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
      'Required `source` union: `{ kind: "text", content }` stores exact/direct content; `{ kind: "generate", prompt }` queues AI generation; `{ kind: "url", url }` creates URL/domain-backed records such as links and agent contacts (preserve bare domains as bare domains); `{ kind: "upload", upload, transform: "extract-markdown" }` imports extractable upload bytes as a markdown note; `{ kind: "prior-response", messageId? }` saves a previous assistant answer/summary by reference without copying or paraphrasing it; `{ kind: "attachment", sourceEntityType, sourceEntityId, attachmentType }` creates deterministic artifacts from existing entities. ' +
      'For `entityType: "image"`, a generate source creates a standalone/generated image without requiring a target; `targetEntityType` + `targetEntityId` attach the generated image to an existing entity as its cover image. For OG/social preview renders, use an attachment source with `attachmentType: "og-image"`. ' +
      'For `entityType: "document"`, attachment sources create durable rendered documents; deck carousel PDFs use `attachmentType: "carousel"`, printable post/project/product PDFs use `attachmentType: "printable"`. ' +
      "When creating a new entity with its own cover image, pass `coverImage: true` or `coverImage: { generate: true, prompt }` and omit `targetEntityType`/`targetEntityId`; do not guess a future entity ID. " +
      `Available entity types: ${types.join(", ")}.`,
    "- **system_upload_save**: Save a live raw uploaded file as its durable file entity. Requires confirmation before persisting; never pass `confirmed: true` on the initial user request. Use the exact upload candidate object from the current model turn. This is for raw file bytes, not for saving the assistant's prior summary/description of those bytes.",
    "- **system_update**: Modify an entity's fields or content. " +
      "Use `fields` for title, status, coverImageId, ogImageId, and other frontmatter/metadata changes. " +
      "Use system_update for coverImageId only when an existing image entity id is already known; to generate a new cover image for an existing entity, use system_create with entityType image, source kind generate, targetEntityType, and targetEntityId. " +
      'Agent approval/archive is a status field update on `entityType: "agent"`. Cover images use `coverImageId`; OG/social previews use `ogImageId`. ' +
      "Requires confirmation before applying changes.",
    "- **system_delete**: Remove an entity. " +
      "Requires confirmation before deleting. Never pass `confirmed: true` on the initial user request; call without `confirmed` so the confirmation flow can ask the user first. Protected identity/profile records such as brain-character and anchor-profile cannot be deleted; update them instead.",
    "- **system_get**: Retrieve a specific entity by type and ID/slug/title.",
    "- **system_list**: List entities by type with optional filters.",
    "- **system_search**: Semantic search across all entities.",
    "",
    "Entity type aliases:",
    ...typeExamples,
    '- "agent contact", "remote agent", "peer brain", or a bare agent/domain contact record → entityType: "agent"',
    '- "wish", "wishlist", or an unfulfilled capability/outcome to remember → entityType: "wish"',
    '- "image", "cover image", "OG image", "social preview" → entityType: "image"',
    '- "PDF", "printable", "carousel document", or rendered file artifact → entityType: "document"',
  ].join("\n");
}
