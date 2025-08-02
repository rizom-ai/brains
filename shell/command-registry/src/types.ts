import type { UserPermissionLevel } from "@brains/utils";
import { z } from "zod";

/**
 * Context provided to command handlers
 */
export interface CommandContext {
  userId: string;
  channelId: string;
  interfaceType: string;
  userPermissionLevel: UserPermissionLevel;
}

/**
 * Command metadata for discovery (no handler)
 */
export interface CommandInfo {
  name: string;
  description: string;
  usage?: string;
}

/**
 * Command response schemas - source of truth for command responses
 */
export const textCommandResponseSchema = z.object({
  type: z.literal("message"),
  message: z.string(),
});

export const jobOperationResponseSchema = z.object({
  type: z.literal("job-operation"),
  jobId: z.string(),
  message: z.string(),
});

export const batchOperationResponseSchema = z.object({
  type: z.literal("batch-operation"),
  batchId: z.string(),
  message: z.string(),
  operationCount: z.number(),
});

export const commandResponseSchema = z.union([
  textCommandResponseSchema,
  jobOperationResponseSchema,
  batchOperationResponseSchema,
]);

/**
 * Command response types derived from schemas
 */
export type TextCommandResponse = z.infer<typeof textCommandResponseSchema>;
export type JobOperationResponse = z.infer<typeof jobOperationResponseSchema>;
export type BatchOperationResponse = z.infer<
  typeof batchOperationResponseSchema
>;
export type CommandResponse = z.infer<typeof commandResponseSchema>;

/**
 * Full command interface with handler
 */
export interface Command extends CommandInfo {
  handler: (
    args: string[],
    context: CommandContext,
  ) => Promise<CommandResponse> | CommandResponse;
}

/**
 * Interface for command registry operations
 */
export interface ICommandRegistry {
  registerCommand(pluginId: string, command: Command): void;
  listCommands(): CommandInfo[];
}
