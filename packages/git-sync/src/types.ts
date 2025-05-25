import { z } from "zod";

export const gitSyncConfigSchema = z.object({
  repoPath: z.string(),
  remote: z.string().optional(),
  branch: z.string().default("main"),
  autoSync: z.boolean().default(false),
  syncInterval: z.number().min(1).default(30), // minutes
});

export type GitSyncConfig = z.infer<typeof gitSyncConfigSchema>;
export type GitSyncConfigInput = z.input<typeof gitSyncConfigSchema>;
