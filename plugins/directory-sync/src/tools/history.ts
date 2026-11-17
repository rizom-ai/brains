import {
  type ToolResult,
  toolSuccess,
  toolError,
} from "@brains/sdk/internal/service-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { IGitSync } from "../types";

/** The history action as the sync tool parses it. */
export const historyActionSchema: z.ZodObject<{
  action: z.ZodLiteral<"history">;
  entityType: z.ZodString;
  id: z.ZodString;
  sha: z.ZodOptional<z.ZodString>;
  limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}> = z.object({
  action: z.literal("history"),
  entityType: z.string().min(1),
  id: z.string().min(1),
  sha: z.string().optional(),
  limit: z.number().int().positive().optional().default(10),
});

export type HistoryInput = z.output<typeof historyActionSchema>;

export async function handleHistory(
  input: HistoryInput,
  gitSync: IGitSync,
): Promise<ToolResult> {
  const filePath = `${input.entityType}/${input.id}.md`;

  try {
    if (input.sha) {
      const content = await gitSync.show(input.sha, filePath);
      return toolSuccess(
        {
          sha: input.sha,
          entityType: input.entityType,
          id: input.id,
          content,
        },
        `Content at ${input.sha.slice(0, 7)}`,
      );
    }

    const commits = await gitSync.log(filePath, input.limit);

    if (commits.length === 0) {
      return toolSuccess(
        { commits: [] },
        `No history found for ${input.entityType}/${input.id}`,
      );
    }

    return toolSuccess(
      { commits, entityType: input.entityType, id: input.id },
      `${commits.length} version${commits.length === 1 ? "" : "s"} found`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error, "History lookup failed"));
  }
}
