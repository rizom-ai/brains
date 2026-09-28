import { z } from "@brains/utils/zod";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { internalFullScope, type BaseEntity } from "@brains/entity-service";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import type { ServicePluginContext } from "./context";
import { GroupingDefinitionSource } from "../internal/document-grouping-source";
import type { GroupingDefinitionsSnapshot } from "../internal/grouping-source-contract";

export type {
  GroupingDefinition,
  GroupingDefinitionsSnapshot,
} from "../internal/grouping-source-contract";

/** One owned control document, not registry access or arbitrary persist validators. */
export interface ServiceGroupingDeclaration {
  readonly source: {
    readonly entity: AnyEntityDefinition;
    /** Decode the document's grouping map. The runtime independently validates it. */
    readonly read: (content: string) => unknown;
    /** Detached policy/repair metadata for the owning service's presentation. */
    readonly publish?:
      ((snapshot: GroupingDefinitionsSnapshot) => void) | undefined;
  };
}

export function registerDeclaredGroupings(
  declaration: ServiceGroupingDeclaration,
  context: ServicePluginContext,
  ownedTypes: ReadonlySet<string>,
  signal: AbortSignal,
): void {
  const { entity, read, publish } = declaration.source;
  const entityType = entity.type;
  if (
    !ownedTypes.has(entityType) ||
    context.entities.getAdapter(entityType)?.isSingleton !== true
  )
    throw new Error("Grouping source must be an owned singleton entity");
  const floor =
    context.entityService.getEntityTypeConfig(entityType).actionPolicy;
  for (const action of ["create", "update", "delete"] as const) {
    if (floor?.[action] !== "admin" && floor?.[action] !== "never")
      throw new Error("Grouping source requires an admin action policy floor");
  }
  if (context.entities.getGroupings().length > 0)
    throw new Error(
      "Document-owned groupings cannot replace another owner's declarations",
    );
  const isContributor = (type: string): boolean => {
    const adapter = context.entities.getAdapter(type);
    return (
      type !== entityType &&
      !!adapter?.frontmatterSchema &&
      !adapter.isSingleton &&
      context.entityService.getEntityTypeConfig(type).binaryStorage !== "asset"
    );
  };
  const source = new GroupingDefinitionSource({
    getContributorTypes: (): string[] =>
      context.entityService.getEntityTypes().filter(isContributor),
    entityType,
    signal,
    decode: read,
    read: async (): Promise<BaseEntity | null> => {
      const row = await context.entityService.getEntityRaw({
        entityType,
        id: entityType,
        visibilityScope: internalFullScope(
          "refresh owned grouping source before use",
        ),
      });
      if (row && row.visibility !== "shared")
        throw new Error("Grouping source must be shared");
      return row;
    },
    validate: (groupings): void =>
      context.entities.validateGroupings(groupings),
    replace: (groupings, options): void =>
      context.entities.replaceGroupings(groupings, options),
  });
  context.entities.registerGroupingSource({
    entityType,
    ensureCurrent: async (options) => {
      await source.ensureCurrent(options);
      signal.throwIfAborted();
      publish?.(source.getSnapshot());
    },
  });
  context.entities.registerPersistValidator(entityType, async (record) => {
    signal.throwIfAborted();
    const snapshot = source.validateContent(record.content);
    const issues: z.core.$ZodIssue[] = snapshot.issues.map((issue) => ({
      code: "custom",
      ...issue,
    }));
    if (record.id !== entityType)
      issues.push({
        code: "custom",
        path: ["id"],
        message: "Grouping source uses its entity type as the singleton ID.",
      });
    if (record.visibility !== "shared")
      issues.push({
        code: "custom",
        path: ["visibility"],
        message:
          "Grouping definitions must be shared so their editors can read them.",
      });
    if (issues.length) throw new z.ZodError(issues);
  });
  for (const type of context.entityService.getEntityTypes()) {
    if (!isContributor(type)) continue;
    context.entities.registerPersistValidator(type, async (record) => {
      signal.throwIfAborted();
      const definitions = Object.entries(source.getSnapshot().groupings).filter(
        ([, value]) => !value.excludeTypes?.includes(type),
      );
      if (!definitions.length) return;
      const frontmatter = parseMarkdown(record.content, {
        cache: false,
      }).frontmatter;
      const issues: z.core.$ZodIssue[] = [];
      for (const [key, definition] of definitions) {
        const parsed = z
          .array(z.string())
          .optional()
          .safeParse(frontmatter[key]);
        if (!parsed.success) {
          issues.push(
            ...parsed.error.issues.map((issue) => ({
              ...issue,
              path: [key, ...issue.path],
            })),
          );
          continue;
        }
        const values = parsed.data ?? [];
        if (!definition.multiple && values.length > 1)
          issues.push({
            code: "custom",
            path: [key],
            message: `${definition.label}: choose at most one value.`,
          });
        if (
          definition.values &&
          values.some((value) => !definition.values?.includes(value))
        )
          issues.push({
            code: "custom",
            path: [key],
            message: `${definition.label}: choose values from the configured list.`,
          });
      }
      if (issues.length) throw new z.ZodError(issues);
    });
  }
}
