import type { IEntityService } from "@brains/entity-service";

/**
 * Extract the body from markdown content (strip frontmatter).
 */
function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match?.[1]?.trim() ?? content.trim();
}

/**
 * Convert a prompt target (e.g. "blog:generation") to an entity ID (e.g. "blog-generation").
 */
function targetToEntityId(target: string): string {
  return target.replace(/:/g, "-");
}

/**
 * Build a human-readable title from a target string.
 * e.g. "blog:generation" → "Blog Generation"
 */
function targetToTitle(target: string): string {
  return target
    .split(":")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Build markdown content for a prompt entity.
 */
function buildPromptMarkdown(
  target: string,
  title: string,
  body: string,
): string {
  return `---\ntitle: "${title}"\ntarget: "${target}"\n---\n${body}\n`;
}

/** Track which targets have been materialized to avoid repeated DB writes */
const materialized = new Set<string>();

/**
 * Resolve a prompt by target name.
 *
 * Looks up a prompt entity in the database. If found, returns the body
 * (markdown content stripped of frontmatter). If not found, creates the
 * entity from the fallback default (materializing it in DB + on disk via
 * directory-sync auto-export), then returns the fallback.
 *
 * @param entityService - The entity service to query
 * @param target - The prompt target (e.g. "blog:generation")
 * @param fallback - The default prompt text if no entity exists
 * @returns The resolved prompt text
 */
export async function resolvePrompt(
  entityService: IEntityService,
  target: string,
  fallback: string,
): Promise<string> {
  const entityId = targetToEntityId(target);

  try {
    const entity = await entityService.getEntity("prompt", entityId);

    if (entity?.content) {
      materialized.add(target);
      return extractBody(entity.content);
    }
  } catch {
    // Entity lookup failed — fall through to materialization
  }

  // Materialize the default prompt as an entity (once per target)
  if (!materialized.has(target)) {
    materialized.add(target);
    try {
      const title = targetToTitle(target);
      const content = buildPromptMarkdown(target, title, fallback);
      await entityService.createEntity({
        id: entityId,
        entityType: "prompt",
        content,
        metadata: { title, target, slug: entityId },
      });
    } catch {
      // Creation failed (e.g. entity type not registered yet) — silent fallback
    }
  }

  return fallback;
}

/**
 * Reset the materialization cache (for testing).
 */
export function resetPromptCache(): void {
  materialized.clear();
}
