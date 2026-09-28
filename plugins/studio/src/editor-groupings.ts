import type { ServicePluginContext } from "@brains/plugins";
import {
  GROUPING_PAGE_LIMIT,
  GROUPING_MAX_PAGE_LIMIT,
  groupingSearchSchema,
  groupingSortSchema,
  groupingValueSchema,
} from "@brains/plugins";
import { decodeEntityIdPath } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { getTypeCapabilities } from "./editor-access";
import type {
  EditorRouteOptions,
  StudioRequestAccess,
} from "./editor-contracts";
import { splitEntityContent } from "./editor-content";
import { entityDisplayTitle } from "./editor-entities";
import { jsonResponse } from "./editor-response";
import type {
  GroupingDefinitionsFrontmatter,
  StudioGrouping,
} from "./grouping-definitions-contract";
import { isGroupingContributorType } from "./grouping-definitions";
import { studioGroupingUsageQuerySchema } from "./grouping-query";

const querySchema = studioGroupingUsageQuerySchema.extend({
  type: z.string().min(1).max(100).optional(),
  value: groupingValueSchema.optional(),
  q: groupingSearchSchema.default(""),
  sort: groupingSortSchema.default("updated-desc"),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(GROUPING_MAX_PAGE_LIMIT)
    .default(GROUPING_PAGE_LIMIT),
});

/** Descriptors cannot disclose contributing types the caller cannot read. */
export function studioGroupDescriptors(
  definitions: GroupingDefinitionsFrontmatter["groupings"],
  admitted: ReadonlySet<string>,
): StudioGrouping[] {
  return Object.entries(definitions)
    .map(([key, definition]) => ({
      key,
      field: key,
      label: definition.label,
      types: [...admitted].filter(
        (type) => !definition.excludeTypes?.includes(type),
      ),
      rules: {
        multiple: definition.multiple,
        ...(definition.values && { values: definition.values }),
      },
    }))
    .filter((grouping) => grouping.types.length > 0);
}

export async function handleGroupingRead(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
  mode: "catalog" | "members" | "usage",
  getDefinitions: EditorRouteOptions["getGroupingDefinitions"],
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({
    ...Object.fromEntries(params),
    values: params.getAll("value"),
  });
  if (!query.success || (mode === "members" && query.data.value === undefined))
    return jsonResponse({ error: "Invalid grouping query" }, 400);
  await context.entities.ensureGroupingsCurrent();
  const definitions = getDefinitions?.().groupings ?? {};
  const grouping = Object.hasOwn(definitions, query.data.grouping)
    ? definitions[query.data.grouping]
    : undefined;
  if (!grouping) return jsonResponse({ error: "Unknown grouping" }, 404);
  const admitted = new Set<string>();
  for (const type of context.entityService.getEntityTypes()) {
    if (
      isGroupingContributorType(context, type) &&
      !grouping.excludeTypes?.includes(type) &&
      (await getTypeCapabilities(context, type, access))
    )
      admitted.add(type);
  }
  const descriptor = studioGroupDescriptors(
    { [query.data.grouping]: grouping },
    admitted,
  )[0];
  if (!descriptor) return jsonResponse({ error: "Unknown grouping" }, 404);
  if (!(await context.entityService.ensureGroupingsReady())) {
    const response = jsonResponse(
      { code: "groupings_initializing", error: "Collections are initializing" },
      503,
    );
    response.headers.set("Retry-After", "1");
    return response;
  }
  const input = {
    grouping: descriptor.key,
    entityTypes: descriptor.types.filter(
      (type) => !query.data.type || query.data.type === type,
    ),
    visibilityScope: access.visibilityScope,
    signal: request.signal,
  };
  if (mode === "usage") {
    return jsonResponse(
      await context.entityService.queryGroupingUsage({
        ...input,
        values: query.data.values,
      }),
    );
  }
  const pagination = { offset: query.data.offset, limit: query.data.limit };
  if (mode === "catalog") {
    return jsonResponse({
      grouping: descriptor,
      ...(await context.entityService.queryGroupingCatalog({
        ...input,
        ...pagination,
      })),
    });
  }
  const page = await context.entityService.queryGroupingMembers({
    ...input,
    ...pagination,
    value: query.data.value ?? "",
    q: query.data.q,
    sort: query.data.sort,
  });
  return jsonResponse({
    grouping: descriptor,
    total: page.total,
    entities: page.entities.map((entity) => ({
      id: entity.id,
      entityType: entity.entityType,
      path: decodeEntityIdPath(entity.id),
      frontmatter: {
        ...splitEntityContent(entity.entityType, entity.content, context)
          .frontmatter,
        visibility: entity.visibility,
      },
      displayTitle: entityDisplayTitle(context, entity),
      updated: entity.updated,
    })),
  });
}
