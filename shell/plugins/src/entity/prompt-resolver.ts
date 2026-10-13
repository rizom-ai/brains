import type { IEntityService } from "@brains/entity-service";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { z } from "@brains/utils/zod";

function targetToEntityId(target: string): string {
  return target.replace(/:/g, "-");
}

function targetToTitle(target: string): string {
  return target
    .split(/[:.-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** A prompt entity's body is its markdown with the frontmatter stripped. */
function promptBody(content: string): string {
  return parseMarkdownWithFrontmatter(
    content,
    z.record(z.string(), z.unknown()),
  ).content;
}

/** Read an override without global caches, materialization, or tolerated read errors. */
export async function readPromptOverride(
  read: (entityType: string, id: string) => Promise<{ content: string } | null>,
  target: string,
  fallback: string,
): Promise<string> {
  const entity = await read("prompt", targetToEntityId(target));
  return entity?.content ? promptBody(entity.content) : fallback;
}

/** Targets whose default has been materialized once; bodies are never cached. */
const materialized = new Set<string>();

/**
 * Resolve a prompt by target name.
 *
 * Looks up a prompt entity in the database. If found, returns the body
 * (markdown content stripped of frontmatter). If not found, creates the
 * entity from the fallback default (materializing it in DB + on disk via
 * directory-sync auto-export), then returns the fallback.
 *
 * Every call reads the entity, so an edited prompt applies to the next call.
 */
/** The entity reads and writes prompt resolution performs. */
export type PromptEntityStore = Pick<
  IEntityService,
  "getEntity" | "createEntity"
>;

export async function resolvePrompt(
  entityService: PromptEntityStore,
  target: string,
  fallback: string,
): Promise<string> {
  const entityId = targetToEntityId(target);

  let entity;
  try {
    entity = await entityService.getEntity({
      entityType: "prompt",
      id: entityId,
    });
  } catch {
    // DB error — answer the fallback; the next call reads again
    return fallback;
  }

  if (entity?.content) return promptBody(entity.content);
  if (materialized.has(target)) return fallback;

  // Entity doesn't exist — materialize the default prompt
  const title = targetToTitle(target);
  const content = generateMarkdownWithFrontmatter(fallback, {
    title,
    target,
  });

  // Only the write is tolerated, for the case the comment names: the prompt
  // entity type may not be registered yet. Building the content above is ours,
  // and swallowing a fault there would seed the fallback forever without ever
  // saying why.
  try {
    await entityService.createEntity({
      entity: {
        id: entityId,
        entityType: "prompt",
        content,
        metadata: { title, target, slug: entityId },
      },
    });
  } catch {
    // Entity type not registered yet — the fallback below still answers.
  }

  materialized.add(target);
  return fallback;
}

/**
 * Forget which defaults were materialized (for testing).
 */
export function resetPromptMaterialization(): void {
  materialized.clear();
}

/**
 * Materialize prompt entities for every registered template that carries a
 * basePrompt. Returns the number of templates materialized.
 */
/** The template listing prompt materialization reads. */
export type PromptTemplateSource = Pick<TemplateRegistry, "list">;

export async function materializePrompts(
  templateRegistry: PromptTemplateSource,
  entityService: PromptEntityStore,
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
