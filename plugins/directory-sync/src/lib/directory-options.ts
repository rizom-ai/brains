import type { IEntityService } from "@brains/plugins";
import { z } from "@brains/utils";
import type { Logger } from "@brains/utils";
import { resolveSyncPath } from "./directory-path";

export const directorySyncOptionsSchema = z.object({
  syncPath: z.string(),
  autoSync: z.boolean().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  deleteOnFileRemoval: z.boolean().optional(),
});

export type DirectorySyncOptions = z.infer<
  typeof directorySyncOptionsSchema
> & {
  entityService: IEntityService;
  logger: Logger;
};

export interface NormalizedDirectorySyncOptions {
  originalSyncPath: string;
  syncPath: string;
  autoSync: boolean;
  watchInterval: number;
  deleteOnFileRemoval: boolean;
  entityTypes: string[] | undefined;
}

export function normalizeDirectorySyncOptions(
  options: DirectorySyncOptions,
): NormalizedDirectorySyncOptions {
  const {
    entityService: _entityService,
    logger: _logger,
    ...validatableOptions
  } = options;
  directorySyncOptionsSchema.parse(validatableOptions);

  return {
    originalSyncPath: options.syncPath,
    syncPath: resolveSyncPath(options.syncPath),
    autoSync: options.autoSync ?? true,
    watchInterval: options.watchInterval ?? 5000,
    deleteOnFileRemoval: options.deleteOnFileRemoval ?? true,
    entityTypes: options.entityTypes,
  };
}
