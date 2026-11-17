import { WEBDAV_INTERACTION_ID } from "@brains/contracts";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import {
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
