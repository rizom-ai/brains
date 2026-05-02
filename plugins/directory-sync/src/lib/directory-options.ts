import type { IEntityService } from "@brains/plugins";
import { z } from "@brains/utils";
import type { Logger } from "@brains/utils";

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
