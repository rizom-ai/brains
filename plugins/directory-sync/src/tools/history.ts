import { z } from "@brains/utils/zod";
import type { GitLogEntry, IGitSync } from "../types";

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

/** What a history lookup answers: one revision's content, or the versions. */
export interface HistoryOutcome {
  entityType: string;
  id: string;
  sha?: string | undefined;
  content?: string | undefined;
  commits?: GitLogEntry[] | undefined;
  message: string;
}

export async function handleHistory(
  input: HistoryInput,
  gitSync: IGitSync,
): Promise<HistoryOutcome> {
  const filePath = `${input.entityType}/${input.id}.md`;
  const limit = input.limit ?? 10;

  if (input.sha) {
    const content = await gitSync.show(input.sha, filePath);
    return {
      sha: input.sha,
      entityType: input.entityType,
      id: input.id,
      content,
      message: `Content at ${input.sha.slice(0, 7)}`,
    };
  }

  const commits = await gitSync.log(filePath, limit);
  return {
    entityType: input.entityType,
    id: input.id,
    commits,
    message:
      commits.length === 0
        ? `No history found for ${input.entityType}/${input.id}`
        : `${commits.length} version${commits.length === 1 ? "" : "s"} found`,
  };
}
