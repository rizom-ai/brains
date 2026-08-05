import type { IAssetsNamespace, IEntityService } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { resolveSyncPath } from "./directory-path";
import { DEFAULT_MAX_ASSET_IMPORT_BYTES } from "./import-limits";
import { DEFAULT_MAX_IMPORT_FILE_BYTES } from "./oversized-file-error";

export interface DirectorySyncOptionsInput {
  syncPath: string;
  autoSync?: boolean | undefined;
  watchInterval?: number | undefined;
  includeMetadata?: boolean | undefined;
  entityTypes?: string[] | undefined;
  deleteOnFileRemoval?: boolean | undefined;
  maxImportFileBytes?: number | undefined;
  maxAssetImportBytes?: number | undefined;
}

export interface DirectorySyncOptions extends DirectorySyncOptionsInput {
  entityService: IEntityService;
  assets: IAssetsNamespace;
  logger: Logger;
}

export const directorySyncOptionsSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<DirectorySyncOptionsInput, DirectorySyncOptionsInput> = z.object({
  syncPath: z.string(),
  autoSync: z.boolean().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  deleteOnFileRemoval: z.boolean().optional(),
  maxImportFileBytes: z.number().int().positive().optional(),
  maxAssetImportBytes: z.number().int().positive().optional(),
});

export interface NormalizedDirectorySyncOptions {
  originalSyncPath: string;
  syncPath: string;
  autoSync: boolean;
  watchInterval: number;
  deleteOnFileRemoval: boolean;
  maxImportFileBytes: number;
  maxAssetImportBytes: number;
  entityTypes: string[] | undefined;
}

export function normalizeDirectorySyncOptions(
  options: DirectorySyncOptions,
): NormalizedDirectorySyncOptions {
  const {
    entityService: _entityService,
    assets: _assets,
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
    maxAssetImportBytes:
      options.maxAssetImportBytes ?? DEFAULT_MAX_ASSET_IMPORT_BYTES,
    entityTypes: options.entityTypes,
  };
}
