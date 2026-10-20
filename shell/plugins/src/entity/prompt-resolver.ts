import type { BaseEntity, IEntityService } from "@brains/entity-service";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import type { TemplateRegistry } from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import { computeContentHash } from "@brains/utils/hash";
import { formatLabel } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

function targetToEntityId(target: string): string {
  return target.replace(/:/g, "-");
}

function targetToTitle(target: string): string {
  return formatLabel(target.replace(/[:.]/g, " "));
}

/** The title materialization wrote before it kept acronyms ("Ai", "Linkedin"). */
function generatedTitleBefore(target: string): string {
  return target
    .split(/[:.-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const promptFrontmatterSchema = z.record(z.string(), z.unknown());

function parsePrompt(content: string): {
  body: string;
  frontmatter: Record<string, unknown>;
} {
  const parsed = parseMarkdownWithFrontmatter(content, promptFrontmatterSchema);
  return { body: parsed.content, frontmatter: parsed.metadata };
}

/** A prompt entity's body is its markdown with the frontmatter stripped. */
function promptBody(content: string): string {
  return parsePrompt(content).body;
}

/** Bodies compare trimmed: writing frontmatter may add or drop surrounding newlines. */
function hashPromptBody(body: string): string {
  return computeContentHash(body.trim());
}

/** A prompt entity holding a default, stamped with the hash it was written from. */
function defaultPromptEntity(
  target: string,
  fallback: string,
): {
  id: string;
  entityType: "prompt";
  content: string;
  metadata: Record<string, unknown>;
} {
  const id = targetToEntityId(target);
  const title = targetToTitle(target);
  const defaultHash = hashPromptBody(fallback);
  return {
    id,
    entityType: "prompt",
    content: generateMarkdownWithFrontmatter(fallback, {
      title,
      target,
      defaultHash,
    }),
    metadata: { title, target, slug: id, defaultHash },
  };
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
  const prompt = defaultPromptEntity(target, fallback);

  // Only the write is tolerated, for the case the comment names: the prompt
  // entity type may not be registered yet. Building the content above is ours,
  // and swallowing a fault there would seed the fallback forever without ever
  // saying why.
  try {
    await entityService.createEntity({ entity: prompt });
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

/** The template listing prompt materialization reads, keyed as generation looks templates up. */
export type PromptTemplateSource = Pick<TemplateRegistry, "getAll">;

/** The entity reads and writes keeping prompt copies in step with their defaults performs. */
export type PromptMaterializationStore = Pick<
  IEntityService,
  | "getEntity"
  | "createEntity"
  | "updateEntity"
  | "deleteEntity"
  | "hasEntityType"
>;

/** What one boot-time pass did to the prompt copies, by target (removed copies by entity id). */
export interface PromptMaterializationReport {
  /** No copy existed; the default was written with its hash. */
  created: string[];
  /** The copy was untouched and its default changed; it now holds the new default. */
  refreshed: string[];
  /** The copy matches the current default; its hash was recorded. */
  stamped: string[];
  /** The copy still had its old generated title, now written as people spell it. */
  retitled: string[];
  /** The copy was edited from a default that has since changed. */
  staleOverrides: string[];
  /** The copy predates provenance and differs from the current default. */
  unverifiedOverrides: string[];
  /** Copies written under a template's short name, which generation never read. */
  removedLegacy: string[];
  failed: Array<{ target: string; error: string }>;
}

type SyncOutcome = Exclude<
  keyof PromptMaterializationReport,
  "removedLegacy" | "failed" | "retitled"
>;

async function writeDefaultHash(
  entityService: PromptMaterializationStore,
  entity: BaseEntity,
  frontmatter: Record<string, unknown>,
  body: string,
  defaultHash: string,
): Promise<void> {
  await entityService.updateEntity({
    entity: {
      ...entity,
      content: generateMarkdownWithFrontmatter(body, {
        ...frontmatter,
        defaultHash,
      }),
      metadata: { ...entity.metadata, defaultHash },
    },
  });
}

/**
 * Bring one prompt copy in step with its default. An untouched copy follows
 * the default; an edited one is kept and, once its default moves, reported.
 */
async function syncPromptDefault(
  entityService: PromptMaterializationStore,
  target: string,
  fallback: string,
): Promise<SyncOutcome | undefined> {
  const entity = await entityService.getEntity({
    entityType: "prompt",
    id: targetToEntityId(target),
  });
  if (!entity) {
    await entityService.createEntity({
      entity: defaultPromptEntity(target, fallback),
    });
    materialized.add(target);
    return "created";
  }

  const { body, frontmatter } = parsePrompt(entity.content);
  const defaultHash = hashPromptBody(fallback);
  const bodyHash = hashPromptBody(body);
  const recorded =
    typeof frontmatter["defaultHash"] === "string"
      ? frontmatter["defaultHash"]
      : undefined;

  if (bodyHash === defaultHash) {
    if (recorded === defaultHash) return undefined;
    await writeDefaultHash(
      entityService,
      entity,
      frontmatter,
      body,
      defaultHash,
    );
    return "stamped";
  }
  if (recorded === undefined) return "unverifiedOverrides";
  if (recorded === defaultHash) return undefined;
  if (bodyHash !== recorded) return "staleOverrides";

  await writeDefaultHash(
    entityService,
    entity,
    frontmatter,
    fallback,
    defaultHash,
  );
  return "refreshed";
}

/**
 * Write a copy's title as people spell it ("AI", "LinkedIn") while it is still
 * the one materialization generated; a title someone edited is theirs.
 */
async function correctGeneratedTitle(
  entityService: PromptMaterializationStore,
  target: string,
): Promise<boolean> {
  const title = targetToTitle(target);
  const before = generatedTitleBefore(target);
  if (before === title) return false;
  const entity = await entityService.getEntity({
    entityType: "prompt",
    id: targetToEntityId(target),
  });
  if (!entity) return false;
  const { body, frontmatter } = parsePrompt(entity.content);
  if (frontmatter["title"] !== before) return false;
  await entityService.updateEntity({
    entity: {
      ...entity,
      content: generateMarkdownWithFrontmatter(body, { ...frontmatter, title }),
      metadata: { ...entity.metadata, title },
    },
  });
  return true;
}

/** Delete a copy written under a short name only while it is still the one materialization wrote. */
async function removeShortNameCopy(
  entityService: PromptMaterializationStore,
  id: string,
  shortName: string,
): Promise<boolean> {
  const entity = await entityService.getEntity({ entityType: "prompt", id });
  if (!entity) return false;
  if (parsePrompt(entity.content).frontmatter["target"] !== shortName) {
    return false;
  }
  return entityService.deleteEntity({
    entityType: "prompt",
    id,
    options: { expectedContentHash: entity.contentHash },
  });
}

/**
 * Keep a prompt entity for every registered template that carries a
 * basePrompt, keyed by the registry key generation resolves, and in step with
 * its default. Each template settles on its own, so one unreadable copy is
 * reported without holding back the rest.
 */
export async function materializePrompts(
  templateRegistry: PromptTemplateSource,
  entityService: PromptMaterializationStore,
): Promise<PromptMaterializationReport> {
  const report: PromptMaterializationReport = {
    created: [],
    refreshed: [],
    stamped: [],
    retitled: [],
    staleOverrides: [],
    unverifiedOverrides: [],
    removedLegacy: [],
    failed: [],
  };
  if (!entityService.hasEntityType("prompt")) return report;

  const defaults = [...templateRegistry.getAll()].flatMap(
    ([target, template]) =>
      template.basePrompt
        ? [{ target, name: template.name, basePrompt: template.basePrompt }]
        : [],
  );

  // The title is settled after the body, on the copy the body sync left.
  const synced = await Promise.allSettled(
    defaults.map(async ({ target, basePrompt }) => ({
      outcome: await syncPromptDefault(entityService, target, basePrompt),
      retitled: await correctGeneratedTitle(entityService, target),
    })),
  );
  synced.forEach((result, index) => {
    const target = defaults[index]?.target ?? "";
    if (result.status === "rejected") {
      report.failed.push({ target, error: getErrorMessage(result.reason) });
      return;
    }
    if (result.value.outcome) report[result.value.outcome].push(target);
    if (result.value.retitled) report.retitled.push(target);
  });

  const readIds = new Set(
    defaults.map(({ target }) => targetToEntityId(target)),
  );
  const shortNames = new Map<string, string>();
  for (const { target, name } of defaults) {
    const id = targetToEntityId(name);
    if (name !== target && !readIds.has(id)) shortNames.set(id, name);
  }
  const removed = await Promise.allSettled(
    [...shortNames].map(([id, name]) =>
      removeShortNameCopy(entityService, id, name),
    ),
  );
  [...shortNames.entries()].forEach(([id, name], index) => {
    const result = removed[index];
    if (result?.status === "rejected") {
      report.failed.push({
        target: name,
        error: getErrorMessage(result.reason),
      });
    } else if (result?.value) {
      report.removedLegacy.push(id);
    }
  });

  return report;
}
