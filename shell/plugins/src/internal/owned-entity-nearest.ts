import { SdkError, toSdkError } from "@brains/contracts";
import {
  getVisibleContentVisibilities,
  type ContentVisibility,
  type EntityServiceClient,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import type { OwnedEntityNearest } from "../entity/owned-entity-nearest";
import {
  assertCanonicalEntityMetadata,
  definitionEntitySchema,
} from "../entity/entity-schema";

const requestSchema = z.object({
  entityType: z.string().min(1).max(200),
  query: z.string().min(1).max(100_000).regex(/\S/u),
  visibility: z.enum(["public", "shared", "restricted"]),
  maxDistance: z.number().min(0).max(2),
  limit: z.number().int().min(1).max(100),
  excludeIds: z.array(z.string().min(1).max(500)).max(100).default([]),
  publishedOnly: z.boolean().default(false),
});
const rowSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  distance: z.number().min(-0.001).max(2.001),
});

export function createOwnedEntityNearest(
  service: Pick<EntityServiceClient, "searchWithDistances" | "getEntity">,
  ownedTypes: ReadonlySet<string>,
  scope?: ContentVisibility,
  signal?: AbortSignal,
): OwnedEntityNearest {
  const owned = new Set(ownedTypes);
  const active = (): void => {
    if (signal?.aborted) throw new SdkError("cancelled");
  };
  return async (definition, query, options) => {
    try {
      let input: z.output<typeof requestSchema>;
      let selected: typeof definition;
      try {
        selected = Object.freeze({
          ...definition,
          type: definition.type,
          metadata: definition.metadata,
          metadataFrom: definition.metadataFrom,
          singleton: definition.singleton,
        });
        assertCanonicalEntityMetadata(selected);
        input = requestSchema.parse({
          entityType: selected.type,
          query,
          visibility: options.visibility,
          maxDistance: options.maxDistance,
          limit: options.limit,
          excludeIds: options.excludeIds,
          publishedOnly: options.publishedOnly,
        });
      } catch (cause) {
        throw new SdkError("invalid_input", { cause });
      }
      const schema = definitionEntitySchema(selected);
      if (
        !owned.has(input.entityType) ||
        (scope !== undefined &&
          !getVisibleContentVisibilities(scope).includes(input.visibility))
      )
        throw new SdkError("permission_denied");
      active();
      const raw = await service.searchWithDistances({
        query: input.query,
        types: [input.entityType],
        visibility: input.visibility,
        visibilityScope: scope ?? input.visibility,
        publishedOnly: input.publishedOnly,
        maxDistance: input.maxDistance,
        limit: input.limit,
        excludeIds: input.excludeIds,
        ...(signal && { signal }),
      });
      active();
      const rows = z.array(rowSchema).max(input.limit).safeParse(raw);
      if (!rows.success)
        throw new SdkError("invalid_response", { cause: rows.error });
      const candidates = rows.data
        .filter(
          (row) =>
            row.entityType === input.entityType &&
            row.distance <= input.maxDistance &&
            !input.excludeIds.includes(row.entityId),
        )
        .sort((a, b) => a.distance - b.distance);
      const seen = new Set<string>();
      const result = [];
      for (const candidate of candidates) {
        if (seen.has(candidate.entityId)) continue;
        seen.add(candidate.entityId);
        active();
        const stored = await service.getEntity({
          entityType: input.entityType,
          id: candidate.entityId,
          visibilityScope: input.visibility,
          publishedOnly: input.publishedOnly,
          ...(signal && { signal }),
        });
        active();
        // Recheck after the index query: visibility/deletion can change concurrently.
        if (stored?.visibility !== input.visibility) continue;
        if (
          stored.entityType !== input.entityType ||
          stored.id !== candidate.entityId
        )
          throw new SdkError("invalid_response");
        const parsed = schema.safeParse(structuredClone(stored));
        if (!parsed.success)
          throw new SdkError("invalid_response", { cause: parsed.error });
        if (
          parsed.data.entityType !== input.entityType ||
          parsed.data.id !== candidate.entityId ||
          parsed.data.visibility !== input.visibility
        )
          throw new SdkError("invalid_response");
        result.push(
          Object.freeze({ entity: parsed.data, distance: candidate.distance }),
        );
      }
      return Object.freeze(result);
    } catch (cause) {
      if (signal?.aborted) throw new SdkError("cancelled", { cause });
      throw toSdkError(cause);
    }
  };
}
