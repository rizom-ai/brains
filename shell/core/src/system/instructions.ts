import type { SystemServices } from "./types";
import { systemToolsNeverWrite } from "./entity-action-policy";

/**
 * Whether no system tool can act on the type: it is never created, updated
 * or deleted through them, and search cannot find it, as a type kept out of
 * embeddings and full-text search. Its own tools or the Inbox handle it.
 */
function outOfSystemTools(services: SystemServices, type: string): boolean {
  const neverWrites = systemToolsNeverWrite(services.permissionService);
  const config = services.entityRegistry.getEntityTypeConfig(type);
  return (
    (["create", "update", "delete"] as const).every((action) =>
      neverWrites(type, action),
    ) &&
    config.embeddable === false &&
    config.fullTextSearchable === false
  );
}

export function createSystemInstructions(services: SystemServices): string {
  const types = services.entityService.getEntityTypes();
  // Describe each registered type by its declarative purpose, sourced from the
  // entity adapter. The model selects `entityType` from what each type is for —
  // no hardcoded "phrase → entityType" routing examples, and only types that
  // are actually registered are ever offered.
  const typeDescriptions = types
    .filter((type) => !outOfSystemTools(services, type))
    .map(
      (type) =>
        `- ${type}: ${services.entityRegistry.getAdapter(type).purpose}`,
    );

  // Rules that span the system tools only. Each tool's own contract lives in
  // its description, which reaches the model with the tool — and only when
  // the caller may use it — instead of a second copy here on every step.
  return [
    "## Entity CRUD",
    "",
    "Use the system tools for ALL entity operations; each tool's description is its contract.",
    "",
    "Treat explicit verbs such as save, create, capture, remember, import, add/connect an agent, approve/archive an agent, update, delete, generate, publish, or sync as mutation requests. Entity-specific instructions may require proactively recording the user's request itself for demand or workflow tracking; follow those instructions even when the user did not use a separate save/create verb. Ordinary status questions like 'what is the status', 'is it ready', 'did that finish', or 'what happened' are not capture requests; answer them by using the relevant status/read tool for the prior operation. Never call system_create for a status follow-up.",
    "",
    "Do not ask for prose confirmation instead of calling the applicable mutating tool; for create, update, delete, generate, publish, sync, and similar state-changing requests, the initial tool call without `confirmed` is how you create the pending confirmation. Never pass `confirmed: true` on the initial user request. Deletion is Admin-only: if system_delete is not available in the current tool surface, say deletion requires Admin access without calling any tool to find or read the target; do not imply a confirmation flow is available. Never claim a durable create/update/delete change was saved, created, done, or completed unless the relevant tool call succeeded or returned a pending confirmation. If a create/update/delete tool is unavailable, unauthorized, or intentionally not called, say you can't make that durable change from the current context; never say saved/created/done. For an explicit write request from an unauthorized/currently unwritable context, refuse directly; do not call system_status or system_search to check permission or look up related content. Entity type descriptions may mark projection-owned or system-maintained types read-only; refuse mutation requests for those types directly without calling read or write tools, searching for a target, or asking which record to mutate.",
    "",
    "Entity types — select `entityType` by what the type is for:",
    ...typeDescriptions,
  ].join("\n");
}
