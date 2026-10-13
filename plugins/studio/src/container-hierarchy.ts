import type {
  BaseEntity,
  EntityIdPath,
  ServicePluginContext,
} from "@brains/plugins";
import { decodeEntityIdPath } from "@brains/entity-service";
import { getTypeCapabilities } from "./editor-access";
import type { StudioRequestAccess } from "./editor-contracts";

type QueryEntityHierarchyRequest = Parameters<
  ServicePluginContext["entityService"]["queryEntityHierarchy"]
>[0];
type EntityHierarchyPage = Awaited<
  ReturnType<ServicePluginContext["entityService"]["queryEntityHierarchy"]>
>;

/** What every query of one Studio collection request shares. */
export type HierarchyQueryBase = Omit<
  QueryEntityHierarchyRequest,
  "entityType" | "prefix" | "includeDescendants" | "limit" | "offset"
>;

export interface ContainerFolder {
  path: EntityIdPath;
  name: string;
  descendantCount: number;
  /** A container's folder is named by the container itself. */
  title?: string;
}

export interface ContainerPage {
  prefix: EntityIdPath | null;
  folders: ContainerFolder[];
  entities: Array<{ entity: BaseEntity; path: EntityIdPath }>;
  total: number;
  /** Titles for the prefix's segments, where a segment names a container. */
  trail?: Array<string | null>;
}

/** The type contained in a container, if this caller may browse it. */
export async function containedTypeOf(
  context: ServicePluginContext,
  container: string,
  access: StudioRequestAccess,
): Promise<string | undefined> {
  const contained = context.entityService
    .getEntityTypes()
    .find(
      (type) =>
        context.entityService.getEntityTypeConfig(type).containedIn ===
        container,
    );
  if (contained === undefined) return undefined;
  return (await getTypeCapabilities(context, contained, access))
    ? contained
    : undefined;
}

/** The largest page one hierarchy query is asked for. */
const QUERY_PAGE = 100;

/**
 * A container type's collection, with its contents beneath it: each
 * container is a folder titled by itself; inside, its own record comes
 * first, then its contents' folders and entries. A search covers containers
 * and contents alike, containers first.
 */
export async function containerPage(
  context: ServicePluginContext,
  input: {
    container: string;
    contained: string;
    prefix: EntityIdPath | null;
    searching: boolean;
    limit: number;
    offset: number;
    base: HierarchyQueryBase;
    titleOf: (entity: BaseEntity) => string | undefined;
  },
): Promise<ContainerPage> {
  const query = (
    entityType: string,
    request: Pick<
      QueryEntityHierarchyRequest,
      "prefix" | "includeDescendants" | "limit" | "offset"
    >,
  ): Promise<EntityHierarchyPage> =>
    context.entityService.queryEntityHierarchy({
      ...input.base,
      entityType,
      ...request,
    });
  const { container, contained, prefix, limit, offset } = input;

  if (input.searching) {
    // Within one container, only its contents match.
    if (prefix && prefix.length > 0) {
      const page = await query(contained, {
        prefix,
        includeDescendants: true,
        limit,
        offset,
      });
      return {
        prefix,
        folders: [],
        entities: page.entities,
        total: page.totalEntities,
      };
    }
    const containers = await query(container, {
      prefix: null,
      includeDescendants: true,
      limit,
      offset,
    });
    const room = limit - containers.entities.length;
    const contents = await query(contained, {
      prefix: null,
      includeDescendants: true,
      limit: Math.max(1, room),
      offset: Math.max(0, offset - containers.totalEntities),
    });
    return {
      prefix: null,
      folders: [],
      entities: [
        ...containers.entities,
        ...(room > 0 ? contents.entities.slice(0, room) : []),
      ],
      total: containers.totalEntities + contents.totalEntities,
    };
  }

  if (!prefix || prefix.length === 0) {
    const [containers, contents] = await Promise.all([
      allEntries(query, container),
      query(contained, { prefix: null, limit: 1, offset: 0 }),
    ]);
    const counts = new Map(
      contents.folders.map((folder) => [folder.name, folder.descendantCount]),
    );
    return {
      prefix: null,
      folders: containers.map(({ entity }) => ({
        path: [entity.id],
        name: entity.id,
        title: input.titleOf(entity) ?? entity.id,
        descendantCount: counts.get(entity.id) ?? 0,
      })),
      entities: [],
      total: 0,
    };
  }

  const [containerId] = prefix;
  const record = containerId
    ? await context.entityService.getEntity({
        entityType: container,
        id: containerId,
        visibilityScope: input.base.visibilityScope,
      })
    : null;
  // The container's own record opens its folder.
  const head = prefix.length === 1 && record ? [record] : [];
  const page = await query(contained, {
    prefix,
    limit: offset < head.length ? Math.max(1, limit - head.length) : limit,
    offset: Math.max(0, offset - head.length),
  });
  return {
    prefix: page.prefix,
    folders: page.folders,
    entities: [
      ...(offset < head.length
        ? head.map((entity) => ({
            entity,
            path: decodeEntityIdPath(entity.id),
          }))
        : []),
      ...page.entities,
    ].slice(0, limit),
    total: page.totalEntities + head.length,
    trail: [
      record ? (input.titleOf(record) ?? record.id) : null,
      ...prefix.slice(1).map(() => null),
    ],
  };
}

/** Every entry of a type's root, page by page. */
async function allEntries(
  query: (
    entityType: string,
    request: Pick<
      QueryEntityHierarchyRequest,
      "prefix" | "includeDescendants" | "limit" | "offset"
    >,
  ) => Promise<EntityHierarchyPage>,
  entityType: string,
  offset = 0,
): Promise<EntityHierarchyPage["entities"]> {
  const page = await query(entityType, {
    prefix: null,
    limit: QUERY_PAGE,
    offset,
  });
  const next = offset + page.entities.length;
  if (page.entities.length === 0 || next >= page.totalEntities) {
    return page.entities;
  }
  return [...page.entities, ...(await allEntries(query, entityType, next))];
}
