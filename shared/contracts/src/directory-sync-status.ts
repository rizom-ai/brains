import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type DirectorySyncStatusRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

/** The question carries nothing; the answer is the brain's one sync state. */
export const directorySyncStatusRequestSchema: DirectorySyncStatusRequestSchema =
  z.strictObject({});

type DirectorySyncGitStatusSchema = z.ZodObject<{
  branch: z.ZodString;
  hasChanges: z.ZodBoolean;
  ahead: z.ZodNumber;
  behind: z.ZodNumber;
  lastCommit: z.ZodNullable<z.ZodString>;
  remote: z.ZodNullable<z.ZodString>;
}>;

export const directorySyncGitStatusSchema: DirectorySyncGitStatusSchema =
  z.object({
    branch: z.string(),
    hasChanges: z.boolean(),
    ahead: z.number(),
    behind: z.number(),
    lastCommit: z.string().nullable(),
    remote: z.string().nullable(),
  });

type DirectorySyncStatusResponseSchema = z.ZodObject<{
  syncPath: z.ZodString;
  isInitialized: z.ZodBoolean;
  watchEnabled: z.ZodBoolean;
  lastSync: z.ZodNullable<z.ZodString>;
  totalFiles: z.ZodNumber;
  byEntityType: z.ZodRecord<z.ZodString, z.ZodNumber>;
  git: z.ZodNullable<DirectorySyncGitStatusSchema>;
  managementUrl: z.ZodOptional<z.ZodString>;
}>;

export const directorySyncStatusResponseSchema: DirectorySyncStatusResponseSchema =
  z.object({
    syncPath: z.string(),
    isInitialized: z.boolean(),
    watchEnabled: z.boolean(),
    /** ISO timestamp of the last sync, or null before the first one. */
    lastSync: z.string().nullable(),
    totalFiles: z.number(),
    byEntityType: z.record(z.string(), z.number()),
    /** Null when git sync is off or its state cannot be read. */
    git: directorySyncGitStatusSchema.nullable(),
    managementUrl: z.string().optional(),
  });

export type DirectorySyncStatusResponse = z.output<
  typeof directorySyncStatusResponseSchema
>;

/**
 * Where the brain's content sync stands: directory, watcher and git. The
 * directory-sync plugin owns it; the Studio save-pipeline strip asks.
 */
export const directorySyncStatusContract: BusContract<
  DirectorySyncStatusRequestSchema,
  DirectorySyncStatusResponseSchema,
  "request"
> = defineBusContract({
  channel: "sync:status:request",
  request: directorySyncStatusRequestSchema,
  response: directorySyncStatusResponseSchema,
  delivery: "request",
});
