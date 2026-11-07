import { SdkError, sdkErrorSchema, type SdkErrorCode } from "@brains/contracts";
import type { JobInfo } from "@brains/job-queue";
import { parseWithSchema } from "@brains/utils/parse-schema";
import type { z } from "@brains/utils/zod";

/**
 * What a status reader is told of a failure: its recorded public form, as an
 * SdkError would publish it. The diagnostic beside it is for operators only,
 * and a failure recorded without a valid public form reads as a failed
 * handler.
 */
export function publicJobFailure(
  job: Pick<JobInfo, "lastError" | "lastErrorPublic">,
): { readonly code: SdkErrorCode; readonly error: string } | undefined {
  if (!job.lastError) return undefined;
  const failure =
    sdkErrorSchema.safeParse(job.lastErrorPublic).data ??
    new SdkError("handler_failed").toJSON();
  return { code: failure.code, error: failure.message };
}

/**
 * A completed job's result, parsed by its output schema. A job stores its
 * handler's answer as written, so the schema's transforms run here, once.
 */
export function readJobResult<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
  job: Pick<JobInfo, "status" | "result">,
): z.output<TSchema> | undefined {
  return job.status === "completed" && job.result !== undefined
    ? parseWithSchema<TSchema>(schema, job.result)
    : undefined;
}
