import {
  CONFLICT_ENTITY_TYPE,
  recordConflictContract,
} from "@brains/contracts";
import { runtimeStateMountBases } from "./dav-mounts";
import { runtimeStateKeptStore } from "./dav-kept";
import { WEBDAV_INTERACTION_ID } from "@brains/contracts";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import {
  internalFullScope,
  serviceRuntime,
  withWebRoutes,
} from "@brains/sdk/internal/service-runtime";
import { IMAGE_ASSET_MAX_BYTES } from "@brains/image";
import { z } from "@brains/utils/zod";
import { createDavRoutes } from "./dav-routes";

/** Where the drive is mounted on the brain's own origin. */
export const WEBDAV_BASE_PATH = "/dav";

/** The same ceiling directory-sync puts on an imported file. */
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const webdavConfigSchema: z.ZodObject<{
  maxFileBytes: z.ZodDefault<z.ZodNumber>;
}> = z.strictObject({
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .describe("Maximum bytes of a file a client may save")
    .default(DEFAULT_MAX_FILE_BYTES),
});

export interface WebdavState {
  routes: WebRouteDefinition[];
}

/**
 * A brain as a network drive: its entities as the folders and files
 * `brain-data/` holds, served over WebDAV to the person whose app password a
 * request carries, at that person's visibility scope.
 */
const service = defineServicePlugin({
  id: "webdav",
  config: webdavConfigSchema,
  setup: (context): WebdavState => {
    const runtime = serviceRuntime(context);
    // A job worker serves no HTTP and offers no way in.
    if (runtime.executionOnly) return { routes: [] };

    // A save that loses to a newer version is kept as a conflict. Without
    // the type that holds one it would be dropped, so the brain stops.
    runtime.registered(() => {
      if (runtime.entityReads.getEntityTypes().includes(CONFLICT_ENTITY_TYPE))
        return;
      throw new Error(
        `webdav needs the "${CONFLICT_ENTITY_TYPE}" entity type to keep saves that lose to a newer version. Add "conflict" to this brain, which the core bundle includes.`,
      );
    });
    const mounts = runtimeStateMountBases(runtime.classRuntimeState);
    runtime.ready(() => mounts.sweep());

    runtime.interaction({
      id: WEBDAV_INTERACTION_ID,
      label: "Drive",
      description: "Mount the brain as a network drive over WebDAV.",
      href: `${WEBDAV_BASE_PATH}/`,
      kind: "protocol",
      priority: 40,
      visibility: "trusted",
    });

    return {
      routes: createDavRoutes({
        basePath: WEBDAV_BASE_PATH,
        realm: runtime.identity.get().name,
        reader: runtime.entityReads,
        shapes: runtime.entityShapes,
        writes: {
          maxFileBytes: context.config.maxFileBytes,
          maxAssetBytes: IMAGE_ASSET_MAX_BYTES,
          stageAsset: (source, options) =>
            runtime.entityWrites.stageAsset(source, options),
          discardStagedAsset: (asset) =>
            runtime.entityWrites.discardStagedAsset(asset),
          deserializeEntity: (markdown, entityType) =>
            runtime.entityReads.deserializeEntity(markdown, entityType),
          createEntity: (request) => runtime.entityWrites.createEntity(request),
          updateEntity: (request) => runtime.entityWrites.updateEntity(request),
          deleteEntity: (request) => runtime.entityWrites.deleteEntity(request),
          renameEntity: (request) => runtime.entityWrites.renameEntity(request),
          permissions: runtime.permissions,
          // Without auth nobody is admitted, so nothing reaches here.
          recordAudit: async (event) => {
            await runtime.auth()?.recordAuditEvent(event);
          },
        },
        // Read when asked: auth-service binds after plugins register, and a
        // brain without it admits nobody.
        resolveAppPassword: async (request) =>
          runtime.auth()?.resolveAppPassword(request),
        mounts,
        kept: runtimeStateKeptStore(runtime.classRuntimeState),
        // Unanswered when no conflict service runs here; the save is then
        // refused, which keeps the edit with the client.
        recordConflict: async (request) => {
          const answer = await runtime.messaging.request(
            recordConflictContract,
            request,
          );
          return answer.status === "answered"
            ? answer.data.conflictId
            : undefined;
        },
        // A resolved conflict, applied or dismissed, is deleted. Asked at
        // the widest scope: only whether it is there, nothing of it is read.
        conflictPending: async (conflictId) =>
          (await runtime.entityReads.getEntityRaw({
            entityType: CONFLICT_ENTITY_TYPE,
            id: conflictId,
            visibilityScope: internalFullScope(
              "ask only whether a conflict is still waiting to be resolved",
            ),
          })) !== null,
      }),
    };
  },
});

export const webdavPackage: ServicePackageDefinition<
  typeof webdavConfigSchema
> = withWebRoutes<typeof webdavConfigSchema, WebdavState>(
  service,
  ({ state }) => state.routes,
);
