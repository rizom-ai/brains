import { z } from "@brains/sdk/interfaces";

/**
 * The handles a turn produced, so a client can read back what it just wrote.
 *
 * An MCP client that asks the brain to create something gets prose back and
 * no way to find the record. The ids are already in the tool results the
 * runtime reports; this names the ones worth keeping, so a follow-up
 * `get`/`job_status` does not have to search for what the caller just made.
 *
 * Derived rather than declared: no tool announces it wrote something, and
 * the shapes differ by tool — `entityId` here, `id` there, a `jobId` on the
 * result or inside its data.
 */
export interface ReadYourWritesHandle {
  readonly toolName: string;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly jobId?: string | undefined;
}

export const readYourWritesHandleSchema: z.ZodType<
  ReadYourWritesHandle,
  ReadYourWritesHandle
> = z.object({
  toolName: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  jobId: z.string().optional(),
});

interface AnnotatedToolResult {
  readonly toolName: string;
  readonly args?: Record<string, unknown> | undefined;
  readonly data?: unknown;
  readonly jobId?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function handleFor(
  result: AnnotatedToolResult,
): ReadYourWritesHandle | undefined {
  const data = isRecord(result.data) ? result.data : undefined;
  const entityId =
    nonEmptyString(data, "entityId") ?? nonEmptyString(data, "id");
  const jobId = result.jobId ?? nonEmptyString(data, "jobId");
  // Nothing was addressed, so there is nothing to read back.
  if (!entityId && !jobId) return undefined;

  const entityType =
    nonEmptyString(result.args, "entityType") ??
    nonEmptyString(result.args, "type");
  return {
    toolName: result.toolName,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(jobId ? { jobId } : {}),
  };
}

export function readYourWrites(
  results: readonly AnnotatedToolResult[],
): ReadYourWritesHandle[] {
  return results
    .map(handleFor)
    .filter((handle): handle is ReadYourWritesHandle => handle !== undefined);
}
