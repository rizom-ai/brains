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
 * Resolve a prompt by target name.
 *
 * Looks up a prompt entity in the database. If found, returns the body
 * (markdown content stripped of frontmatter). If not found or on error,
 * returns the fallback default.
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
  try {
    const entityId = targetToEntityId(target);
    const entity = await entityService.getEntity("prompt", entityId);

    if (entity?.content) {
      return extractBody(entity.content);
    }

    return fallback;
  } catch {
    return fallback;
  }
}
