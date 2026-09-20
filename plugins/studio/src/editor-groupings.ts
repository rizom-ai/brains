import type { EntityGrouping, ServicePluginContext } from "@brains/plugins";
import { decodeEntityIdPath } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { getTypeCapabilities } from "./editor-access";
import type { StudioRequestAccess } from "./editor-contracts";
import { splitEntityContent } from "./editor-content";
import { entityDisplayTitle } from "./editor-entities";
import { jsonResponse } from "./editor-response";

const querySchema = z.object({
  grouping: z.string().min(1).max(80),
  type: z.string().min(1).max(100).optional(),
  value: z.string().max(10000).optional(),
  q: z.string().max(200).default(""),
  sort: z
    .enum(["updated-desc", "updated-asc", "created-desc", "created-asc"])
    .default("updated-desc"),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Descriptors cannot disclose contributing types the caller cannot read. */
export function studioGroupDescriptors(
  groupings: EntityGrouping[],
  admitted: ReadonlySet<string>,
): EntityGrouping[] {
  return groupings
    .map((grouping) => ({
      ...grouping,
      types: grouping.types.filter((type) => admitted.has(type)),
    }))
    .filter((grouping) => grouping.types.length > 0);
}

export async function handleGroupingRead(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
  mode: "catalog" | "members",
): Promise<Response> {
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success || (mode === "members" && query.data.value === undefined))
    return jsonResponse({ error: "Invalid grouping query" }, 400);
  const grouping = context.entities
    .getGroupings()
    .find((candidate) => candidate.key === query.data.grouping);
  if (!grouping) return jsonResponse({ error: "Unknown grouping" }, 404);
  const admitted = new Set<string>();
  for (const type of grouping.types) {
    if (await getTypeCapabilities(context, type, access)) admitted.add(type);
  }
  const descriptor = studioGroupDescriptors([grouping], admitted)[0];
  if (!descriptor) return jsonResponse({ error: "Unknown grouping" }, 404);
  if (!context.entityService.areGroupingsReady()) {
    const response = jsonResponse(
      { code: "groupings_initializing", error: "Collections are initializing" },
      503,
    );
    response.headers.set("Retry-After", "1");
    return response;
  }
  const input = {
    grouping: grouping.key,
    entityTypes: descriptor.types.filter(
      (type) => !query.data.type || query.data.type === type,
    ),
    visibilityScope: access.visibilityScope,
    offset: query.data.offset,
    limit: query.data.limit,
    signal: request.signal,
  };
  if (mode === "catalog") {
    return jsonResponse({
      grouping: descriptor,
      ...(await context.entityService.queryGroupingCatalog(input)),
    });
  }
  const page = await context.entityService.queryGroupingMembers({
    ...input,
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
