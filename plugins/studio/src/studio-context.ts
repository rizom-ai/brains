import { isGroupingContributor } from "@brains/plugins";
import type {
  ServiceAI,
  ServiceClassMessaging,
  ServiceEntityReads,
  ServiceEntityShapes,
  ServiceEntityWrites,
  ServiceGroupings,
  ServiceIdentity,
  ServicePermissions,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";

/**
 * The brain's records as Studio reads and writes them, as its class did
 * through `context.entityService`: the reads, the writes, and the
 * grouping queries Studio owns.
 */
export interface StudioEntityService
  extends
    Pick<
      ServiceEntityReads,
      | "getEntityTypes"
      | "getEntityTypeConfig"
      | "getEntity"
      | "getEntityRaw"
      | "listEntities"
      | "countEntities"
      | "getEntityCounts"
      | "queryEntityHierarchy"
      | "deserializeEntity"
    >,
    Pick<ServiceEntityWrites, "createEntity" | "updateEntity" | "deleteEntity">,
    Pick<
      ServiceGroupings,
      | "ensureGroupingsReady"
      | "queryGroupingUsage"
      | "queryGroupingMembers"
      | "queryGroupingCatalog"
    > {}

/**
 * The registered types as Studio renders them, as its class read them
 * through `context.entities`: each type's frontmatter with every
 * extension, whether it takes part in a declared grouping, the handler an
 * upload is promoted through, and the groupings kept current.
 */
export interface StudioEntities extends Pick<
  ServiceGroupings,
  "ensureGroupingsCurrent"
> {
  getEffectiveFrontmatterSchema: ServiceEntityShapes["frontmatterSchema"];
  isGroupingContributor: ServiceEntityShapes["isGroupingContributor"];
  getUploadSaveHandler: ServiceRuntime["uploadSaveHandler"];
}

/**
 * What Studio's editor, workspaces and jump destinations read, write and
 * ask through, as its class did through its context, built from its
 * service runtime.
 */
export interface StudioContext {
  readonly entityService: StudioEntityService;
  readonly entities: StudioEntities;
  /** How each type's records are shaped, as the class read its adapter. */
  readonly shapes: Pick<
    ServiceEntityShapes,
    | "isSingleton"
    | "hasBody"
    | "metadataFromFrontmatter"
    | "folderTitles"
    | "displayTitle"
  >;
  readonly permissions: ServicePermissions;
  readonly ai: Pick<ServiceAI, "generateObject">;
  readonly messaging: Pick<ServiceClassMessaging, "request">;
  readonly identity: Pick<ServiceIdentity, "getProfile" | "getAppInfo">;
  readonly inbox: ServiceRuntime["inbox"];
  readonly themeCSS: string;
  readonly entityDisplay: ServiceRuntime["entityDisplay"];
  readonly readiness: ServiceRuntime["readiness"];
  readonly channelDescriptors: ServiceRuntime["channelDescriptors"];
  readonly routeByRole: ServiceRuntime["routeByRole"];
  readonly sharedUploads: ServiceRuntime["sharedUploads"];
  readonly auth: ServiceRuntime["auth"];
  readonly assignableMembers: ServiceRuntime["assignableMembers"];
  readonly hasPlugin: ServiceRuntime["hasPlugin"];
}

/** Studio's context, from its service runtime. */
export function studioContextOf(runtime: ServiceRuntime): StudioContext {
  const { entityReads, entityWrites, entityShapes } = runtime;
  const groupings = runtime.groupings();
  return Object.freeze({
    entityService: Object.freeze({
      getEntityTypes: () => entityReads.getEntityTypes(),
      getEntityTypeConfig: (type) => entityReads.getEntityTypeConfig(type),
      getEntity: (request) => entityReads.getEntity(request),
      getEntityRaw: (request) => entityReads.getEntityRaw(request),
      listEntities: (request) => entityReads.listEntities(request),
      countEntities: (request) => entityReads.countEntities(request),
      getEntityCounts: (scope) => entityReads.getEntityCounts(scope),
      queryEntityHierarchy: (request) =>
        entityReads.queryEntityHierarchy(request),
      deserializeEntity: (markdown, type) =>
        entityReads.deserializeEntity(markdown, type),
      createEntity: (request) => entityWrites.createEntity(request),
      updateEntity: (request) => entityWrites.updateEntity(request),
      deleteEntity: (request) => entityWrites.deleteEntity(request),
      ensureGroupingsReady: () => groupings.ensureGroupingsReady(),
      queryGroupingUsage: (request) => groupings.queryGroupingUsage(request),
      queryGroupingMembers: (request) =>
        groupings.queryGroupingMembers(request),
      queryGroupingCatalog: (request) =>
        groupings.queryGroupingCatalog(request),
    } satisfies StudioEntityService),
    entities: Object.freeze({
      getEffectiveFrontmatterSchema: (type) =>
        entityShapes.frontmatterSchema(type),
      isGroupingContributor: (type) => entityShapes.isGroupingContributor(type),
      getUploadSaveHandler: (mediaType) => runtime.uploadSaveHandler(mediaType),
      ensureGroupingsCurrent: () => groupings.ensureGroupingsCurrent(),
    } satisfies StudioEntities),
    shapes: entityShapes,
    permissions: runtime.permissions,
    ai: runtime.ai,
    messaging: runtime.messaging,
    identity: runtime.identity,
    inbox: runtime.inbox,
    themeCSS: runtime.themeCSS,
    entityDisplay: runtime.entityDisplay,
    readiness: () => runtime.readiness(),
    channelDescriptors: () => runtime.channelDescriptors(),
    routeByRole: (role) => runtime.routeByRole(role),
    sharedUploads: (options) => runtime.sharedUploads(options),
    auth: () => runtime.auth(),
    assignableMembers: () => runtime.assignableMembers(),
    hasPlugin: (pluginId) => runtime.hasPlugin(pluginId),
  } satisfies StudioContext);
}

/**
 * Whether a type may take part in a grouping, by the shell's eligibility
 * rule: it has frontmatter, keeps more than one record, and is neither a
 * system type nor a stored asset. The source enforcement and the editor's
 * type choices share it.
 */
export function isGroupingContributorType(
  context: Pick<StudioContext, "entityService" | "entities" | "shapes">,
  type: string,
): boolean {
  const frontmatterSchema =
    context.entities.getEffectiveFrontmatterSchema(type);
  return isGroupingContributor(
    {
      ...(frontmatterSchema && { frontmatterSchema }),
      isSingleton: context.shapes.isSingleton(type),
    },
    context.entityService.getEntityTypeConfig(type),
  );
}
