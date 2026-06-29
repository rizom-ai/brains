import type { SystemServices } from "./types";

export function createSystemInstructions(services: SystemServices): string {
  const types = services.entityService.getEntityTypes();
  // Describe each registered type by its declarative purpose, sourced from the
  // entity adapter. The model selects `entityType` from what each type is for —
  // no hardcoded "phrase → entityType" routing examples, and only types that
  // are actually registered are ever offered.
  const typeDescriptions = types.map(
    (type) => `- ${type}: ${services.entityRegistry.getAdapter(type).purpose}`,
  );

  return [
    "## Entity CRUD",
    "",
    "Use these system tools for ALL entity operations:",
    "",
    "- **system_create**: Create an entity from existing/concrete material. " +
      "Requires confirmation before persisting; never pass `confirmed: true` on the initial user request. " +
      'Required `source` union: `{ kind: "text", content }` stores exact/direct content; `{ kind: "url", url }` creates URL/domain-backed records such as links (preserve bare domains as bare domains); `{ kind: "upload", upload, transform: "extract-markdown" }` imports extractable upload bytes as a markdown note; `{ kind: "upload", upload, transform: "preserve" }` preserves raw uploaded bytes as their durable file entity; `{ kind: "prior-response", messageId? }` saves a previous assistant answer/summary by reference without copying or paraphrasing it. ' +
      "Use system_generate, not system_create, for AI generation, generated images, cover images, and source-derived artifacts. " +
      `Available entity types: ${types.join(", ")}.`,
    "- **system_generate**: Generate a new durable entity or deterministic artifact. " +
      "Requires confirmation before queueing generation; never pass `confirmed: true` on the initial user request. " +
      'Use `{ kind: "prompt", prompt }` for AI-generated content/images. Use `{ kind: "attachment", sourceEntityType, sourceEntityId, attachmentType }` for deterministic artifacts from existing entities. ' +
      'For `entityType: "image"`, a prompt source creates a standalone generated image by default: omit `targetEntityType`, omit `targetEntityId`, and never invent placeholders such as `__new__`, `new`, or `temp`. ' +
      '`targetEntityType` + `targetEntityId` are only for attaching the generated image to an existing canonical non-image entity as its cover image. For OG/social preview renders, use an attachment source with `attachmentType: "og-image"`. ' +
      'For `entityType: "document"`, attachment sources create durable rendered documents; deck carousel PDFs use `attachmentType: "carousel"`, printable post/project/product PDFs use `attachmentType: "printable"`. ' +
      "To create an entity and a cover image, first create the entity without coverImage, then after the real canonical entity ID is known call system_generate with entityType image, source.kind prompt, targetEntityType, and targetEntityId. Never guess a future target ID; if there is no existing target entity, generate a standalone image with no target fields.",
    "- **system_update**: Modify an entity's fields or content. " +
      "Use `fields` for title, status, coverImageId, ogImageId, and other frontmatter/metadata changes. " +
      "Use system_update for coverImageId only when an existing image entity id is already known; to generate a new cover image for an existing entity, use system_generate with entityType image, source kind prompt, targetEntityType, and targetEntityId. " +
      'Agent approval/archive is a status field update on `entityType: "agent"`. Cover images use `coverImageId`; OG/social previews use `ogImageId`. ' +
      "Requires confirmation before applying changes.",
    "- **system_delete**: Owner/anchor-only entity removal. " +
      "Requires confirmation before deleting. Never pass `confirmed: true` on the initial user request; call without `confirmed` so the confirmation flow can ask the owner first. If system_delete is not available in the current tool surface, say deletion requires owner access; do not imply a confirmation flow is available. Protected identity/profile records such as brain-character and anchor-profile cannot be deleted; update them instead.",
    "- **system_get**: Retrieve a specific entity by type and ID/slug/title.",
    "- **system_list**: List entities by type with optional filters.",
    "- **system_search**: Semantic search across all entities. For each new user question about what they have written, mentioned, discussed, or saved, run a fresh search for that turn instead of answering from prior-turn search results or memory.",
    "",
    "Entity types — select `entityType` by what the type is for:",
    ...typeDescriptions,
  ].join("\n");
}
