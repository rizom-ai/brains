import type { ToolResult } from "@brains/plugins";
import { toolSuccess, toolError } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { IGitSync } from "../types";

export interface HistoryInput {
  entityType: string;
  id: string;
  sha?: string | undefined;
  limit?: number | undefined;
}

const historyInputSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  sha: z.string().optional(),
  limit: z.number().int().positive().optional().default(10),
});

export function parseHistoryInput(input: unknown): HistoryInput {
  const parsed = historyInputSchema.parse(input);
  return {
    entityType: parsed.entityType,
    id: parsed.id,
    ...(parsed.sha ? { sha: parsed.sha } : {}),
    limit: parsed.limit,
  };
}

export async function handleHistory(
  input: HistoryInput,
  gitSync: IGitSync,
): Promise<ToolResult> {
  const filePath = `${input.entityType}/${input.id}.md`;
  const limit = input.limit ?? 10;

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

    const commits = await gitSync.log(filePath, limit);

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
