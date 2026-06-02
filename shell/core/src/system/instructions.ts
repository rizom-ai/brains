import type { SystemServices } from "./types";

export function createSystemInstructions(services: SystemServices): string {
  const types = services.entityService.getEntityTypes();

  return [
    "## Entity CRUD",
    "",
    "Use these system tools for ALL entity operations:",
    "",
    "- **system_create**: Create or generate any entity. " +
      "Pass `content` for direct creation, `prompt` for AI generation, `url` for URL-first flows like saving links or remote agents, or `from` for source-derived artifact saves such as deck carousel PDFs and printable post/project/product PDFs. " +
      "When creating an entity with a cover image, pass `coverImage: true` or `coverImage: { generate: true, prompt }`; do not guess a future entity ID. " +
      `Available entity types: ${types.join(", ")}.`,
    "- **system_update**: Modify an entity's fields or content. " +
      "Use `fields` for title, status, coverImageId, and other frontmatter/metadata changes. " +
      "When the user explicitly asks to rename, retitle, approve, publish, archive, or otherwise change fields, call `system_update`; do not just retrieve the entity or claim it was changed. " +
      "Requires confirmation before applying changes.",
    "- **system_delete**: Remove an entity. " +
      "Requires confirmation before deleting. Never pass `confirmed: true` on the initial user request; call without `confirmed` so the confirmation flow can ask the user first. Protected identity/profile records such as brain-character and anchor-profile cannot be deleted; update them instead.",
    "- **system_get**: Retrieve a specific entity by type and ID/slug/title.",
    "- **system_list**: List entities by type with optional filters.",
    "- **system_search**: Semantic search across all entities.",
    "",
    "When a user asks to create content, determine the entity type from context:",
    '- "Write a blog post" → entityType: "post"',
    '- "Create a presentation/deck" → entityType: "deck"',
    '- "Save this as a note" → entityType: "base"',
    '- "Draft a LinkedIn post" → entityType: "social-post"',
    '- "Create a newsletter" → entityType: "newsletter"',
    '- "Add a project" → entityType: "project"',
    '- "List my contacts/agents" → entityType: "agent"',
    "",
    "Never use old tool names like blog_generate, note_create, or deck_generate.",
  ].join("\n");
}
