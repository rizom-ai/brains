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
      'Required `source` union: `{ kind: "text", content }` stores exact/direct content; `{ kind: "url", url }` creates URL/domain-backed records such as links (preserve bare domains as bare domains); `{ kind: "upload", upload, transform: "extract-markdown" }` imports extractable upload bytes as a markdown note; `{ kind: "upload", upload, transform: "preserve" }` preserves raw uploaded bytes as their durable file entity; `{ kind: "prior-response", messageId? }` saves a previous assistant answer/summary by reference without copying or paraphrasing it. If the immediate context is an assistant summary/answer about an upload and the user asks to save that response, create a note with `source.kind: "prior-response"`; only use upload `preserve` when they explicitly want to save the uploaded file/document itself. ' +
      "Use system_generate, not system_create, for AI generation, generated images, cover images, and source-derived artifacts. " +
      `Available entity types: ${types.join(", ")}.`,
    "- **system_generate**: Generate a new durable entity or deterministic artifact. " +
      "Requires confirmation before queueing generation; call system_generate without `confirmed` to request that confirmation, and never pass `confirmed: true` on the initial user request. " +
      "When the user asks you to create, write, draft, or generate new durable content and has not supplied final exact content to store, call system_generate instead of drafting the content in chat or asking for separate prose approval first. If generation depends on an existing source entity (for example, a newsletter from a blog post), resolve the source with read/search/list tools first, then call system_generate in the same turn when a clear source is found. If no existing durable source entity is resolved, omit `operation.source`; never invent source IDs, use upload IDs/filenames as entity refs, use profile/brain-character as a generic source, or create placeholder source refs. For broad topical prompts like 'about AI' or 'about continuous learning', omit `operation.source`. If the user asks for the latest source and candidates include dates such as publishedAt, choose the newest matching candidate and proceed with system_generate rather than asking for separate prose approval. Do not say 'I can generate it if you want' or 'I need to queue it first'; calling system_generate without `confirmed` is the confirmation request. " +
      'Required `operation` union: `{ kind: "prompt", entityType, prompt, source?: { entityType, entityId } }` generates a new non-image durable entity; include `source` when generating from an existing entity, such as a newsletter from a blog post. `{ kind: "standalone-image", prompt }` generates an unattached image; `{ kind: "cover-image", target: { entityType, entityId }, prompt }` generates an image and attaches it to an existing canonical entity as `coverImageId`; `{ kind: "attachment", source: { entityType, entityId }, attachmentType }` renders a deterministic artifact from an existing entity attachment provider. ' +
      'For save/render/regenerate requests for source-derived artifacts, call `system_generate` with `operation.kind: "attachment"` immediately. For OG/social preview renders, use `attachmentType: "og-image"`; the provider derives the output image and updates `ogImageId`. For deck carousel PDFs use `attachmentType: "carousel"`; for printable post/project/product PDFs use `attachmentType: "printable"`. If the user asks to attach a generated artifact to another entity, generate the artifact first; update the target only after the real artifact ID exists. ' +
      "To create an entity and a cover image, first create/generate only the entity, then after confirmation and after the real canonical entity ID is known call system_generate with operation.kind cover-image. In a single initial request for 'a post with a cover image', do not also call standalone-image; never guess a future target ID, and do not generate a standalone image as a substitute for a requested cover image.",
    "- **system_update**: Modify an entity's fields or content. " +
      "Use `fields` for title, status, coverImageId, ogImageId, and other frontmatter/metadata changes. " +
      "Use system_update for coverImageId when an existing image entity id is known; if the user says to set an existing image as a cover, update `coverImageId` even when `ogImageId` already points at that image. To generate a new cover image for an existing entity, use system_generate with operation.kind cover-image. " +
      'Agent approval/archive is a status field update on `entityType: "agent"`. Cover images use `coverImageId`; OG/social previews use `ogImageId`; do not treat them as interchangeable. ' +
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
