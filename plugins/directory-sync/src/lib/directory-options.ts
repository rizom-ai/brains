import type { EntityServiceClient } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { resolveSyncPath } from "./directory-path";
import { DEFAULT_MAX_IMPORT_FILE_BYTES } from "./oversized-file-error";

export const directorySyncOptionsSchema: z.ZodObject<{
  syncPath: z.ZodString;
  autoSync: z.ZodOptional<z.ZodBoolean>;
  watchInterval: z.ZodOptional<z.ZodNumber>;
  includeMetadata: z.ZodOptional<z.ZodBoolean>;
  entityTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  deleteOnFileRemoval: z.ZodOptional<z.ZodBoolean>;
  maxImportFileBytes: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  syncPath: z.string(),
  autoSync: z.boolean().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  deleteOnFileRemoval: z.boolean().optional(),
  maxImportFileBytes: z.number().int().positive().optional(),
});

export type DirectorySyncOptionsInput = z.output<
  typeof directorySyncOptionsSchema
>;

export interface DirectorySyncOptions extends DirectorySyncOptionsInput {
  entityService: EntityServiceClient;
  logger: Logger;
}

export interface NormalizedDirectorySyncOptions {
  originalSyncPath: string;
  syncPath: string;
  autoSync: boolean;
  watchInterval: number;
  deleteOnFileRemoval: boolean;
  maxImportFileBytes: number;
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
    maxImportFileBytes:
      options.maxImportFileBytes ?? DEFAULT_MAX_IMPORT_FILE_BYTES,
    entityTypes: options.entityTypes,
  };
}
