import type { IEntityService } from "@brains/entity-service";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { z } from "@brains/utils";

function targetToEntityId(target: string): string {
  return target.replace(/:/g, "-");
}

function targetToTitle(target: string): string {
  return target
    .split(/[:.-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Caches resolved prompt bodies and tracks materialization */
const promptCache = new Map<string, string>();

/**
 * Resolve a prompt by target name.
 *
 * Looks up a prompt entity in the database. If found, returns the body
 * (markdown content stripped of frontmatter). If not found, creates the
 * entity from the fallback default (materializing it in DB + on disk via
 * directory-sync auto-export), then returns the fallback.
 *
 * Results are cached — subsequent calls for the same target skip the DB.
 */
export async function resolvePrompt(
  entityService: IEntityService,
  target: string,
  fallback: string,
): Promise<string> {
  const cached = promptCache.get(target);
  if (cached !== undefined) return cached;

  const entityId = targetToEntityId(target);

  let entity;
  try {
    entity = await entityService.getEntity({
      entityType: "prompt",
      id: entityId,
    });
  } catch {
    // DB error — return fallback without caching so next call retries
    return fallback;
  }

  if (entity?.content) {
    const body = parseMarkdownWithFrontmatter(
      entity.content,
      z.record(z.unknown()),
    ).content;
    promptCache.set(target, body);
    return body;
  }

  // Entity doesn't exist — materialize the default prompt
  try {
    const title = targetToTitle(target);
    const content = generateMarkdownWithFrontmatter(fallback, {
      title,
      target,
    });
    await entityService.createEntity({
      entity: {
        id: entityId,
        entityType: "prompt",
        content,
        metadata: { title, target, slug: entityId },
      },
    });
  } catch {
    // Creation failed (e.g. entity type not registered yet) — silent fallback
  }

  promptCache.set(target, fallback);
  return fallback;
}

/**
 * Reset the prompt cache (for testing).
 */
export function resetPromptCache(): void {
  promptCache.clear();
}

/**
 * Materialize prompt entities for every registered template that carries a
 * basePrompt. Returns the number of templates materialized.
 */
export async function materializePrompts(
  templateRegistry: TemplateRegistry,
  entityService: IEntityService,
): Promise<number> {
  const promptTemplates = templateRegistry
    .list()
    .filter((t): t is typeof t & { basePrompt: string } => !!t.basePrompt);

  await Promise.all(
    promptTemplates.map((t) =>
      resolvePrompt(entityService, t.name, t.basePrompt),
    ),
  );

  return promptTemplates.length;
}
