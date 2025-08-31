import { z } from "@brains/utils";

/**
 * Schema for git sync status response
 */
export const gitSyncStatusSchema = z
  .object({
    isRepo: z.boolean(),
    hasChanges: z.boolean(),
    ahead: z.number(),
    behind: z.number(),
    branch: z.string(),
    lastCommit: z.string().optional(),
    remote: z.string().optional(),
    files: z.array(
      z.object({
        path: z.string(),
        status: z.string(),
      }),
    ),
  })
  .describe("gitSyncStatus");

export type GitSyncStatus = z.infer<typeof gitSyncStatusSchema>;
