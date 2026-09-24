import { z } from "@brains/utils/zod";
import {
  entityGroupingSchema,
  groupingKeySchema,
  type EntityGrouping,
} from "@brains/entity-service";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import type { ServicePluginContext } from "./context";

export interface GroupingVocabularyValue {
  readonly multiple: boolean;
  readonly values: readonly string[];
}

/** Named consumer: Studio. No arbitrary validators or foreign write authority. */
export interface ServiceGroupingDeclaration {
  readonly definitions: readonly EntityGrouping[];
  readonly vocabulary?: {
    readonly entity: AnyEntityDefinition;
    /** Strict source decoding; malformed stored policy reopens its groups for repair. */
    readonly read: (
      content: string,
    ) => Readonly<Record<string, GroupingVocabularyValue>>;
  };
}

const vocabularySchema = z.record(
  groupingKeySchema,
  z.object({
    multiple: z.boolean(),
    values: z.array(z.string().min(1)).min(1),
  }),
);

/** Runtime-owned enforcement participates in the same persistence boundary as every writer. */
export function registerDeclaredGroupings(
  declaration: ServiceGroupingDeclaration,
  context: ServicePluginContext,
  ownedTypes: ReadonlySet<string>,
): void {
  const definitions = z
    .array(entityGroupingSchema)
    .max(20)
    .parse(declaration.definitions);
  const vocabulary = declaration.vocabulary;
  const source = vocabulary
    ? {
        entityType: vocabulary.entity.type,
        read: vocabulary.read,
      }
    : undefined;
  if (source) {
    if (
      !ownedTypes.has(source.entityType) ||
      context.entities.getAdapter(source.entityType)?.isSingleton !== true
    ) {
      throw new Error("Grouping vocabulary must be an owned singleton entity");
    }
    const floor = context.entityService.getEntityTypeConfig(
      source.entityType,
    ).actionPolicy;
    for (const action of ["create", "update", "delete"] as const) {
      if (floor?.[action] !== "admin" && floor?.[action] !== "never") {
        throw new Error(
          "Grouping vocabulary requires an admin action policy floor",
        );
      }
    }
  }
  context.entities.validateGroupings(definitions);
  for (const grouping of definitions)
    context.entities.registerGrouping(grouping);
  if (!source) return;
  const decode = (content: string): z.output<typeof vocabularySchema> =>
    vocabularySchema.parse(source.read(content));
  context.entities.registerPersistValidator(
    source.entityType,
    async (entity) => {
      const vocabulary = decode(entity.content);
      const declared = new Set(
        context.entities.getGroupings().map((grouping) => grouping.key),
      );
      const issues: z.core.$ZodIssue[] = [];
      if (entity.id !== source.entityType)
        issues.push({
          code: "custom",
          path: ["id"],
          message:
            "Grouping vocabulary uses its entity type as the singleton ID.",
        });
      for (const key of Object.keys(vocabulary)) {
        if (!declared.has(key))
          issues.push({
            code: "custom",
            path: ["groupings", key],
            message: `Unknown grouping: ${key}`,
          });
      }
      if (entity.visibility !== "shared")
        issues.push({
          code: "custom",
          path: ["visibility"],
          message:
            "Grouping vocabularies are always shared, so the editors they constrain can read them.",
        });
      if (issues.length) throw new z.ZodError(issues);
    },
  );
  // Entity registration precedes finalization; grouping declarations may finalize
  // in either order. Resolve only the fixed runtime membership rule at write time.
  for (const type of context.entityService.getEntityTypes()) {
    context.entities.registerPersistValidator(type, async (entity) => {
      if (!context.entities.isGroupingContributor(type)) return;
      const applicable = context.entities
        .getGroupings()
        .filter((grouping) => grouping.types.includes(type));
      if (applicable.length === 0) return;
      // Internal read is used ONLY for enforcement; policy content is never returned
      // through this capability. Do not cache across writes, imports or workers.
      const stored = await context.entityService.getEntity({
        entityType: source.entityType,
        id: source.entityType,
        visibilityScope: "restricted",
      });
      let vocabulary: z.output<typeof vocabularySchema> = {};
      if (stored) {
        try {
          vocabulary = decode(stored.content);
        } catch {
          // Malformed stored policy must remain repairable, not deny every write.
          vocabulary = {};
        }
      }
      const issues: z.core.$ZodIssue[] = [];
      for (const grouping of applicable) {
        const allowed = Object.hasOwn(vocabulary, grouping.key)
          ? vocabulary[grouping.key]
          : undefined;
        if (!allowed) continue;
        const values =
          z
            .array(z.string())
            .optional()
            .parse(entity.metadata[grouping.field]) ?? [];
        if (values.some((value) => !allowed.values.includes(value)))
          issues.push({
            code: "custom",
            path: [grouping.field],
            message: `${grouping.label}: choose values from the configured list.`,
          });
        if (!allowed.multiple && values.length > 1)
          issues.push({
            code: "custom",
            path: [grouping.field],
            message: `${grouping.label}: choose at most one value.`,
          });
      }
      if (issues.length) throw new z.ZodError(issues);
    });
  }
}
