import { z } from "@brains/utils/zod";
import { SdkError, toSdkError } from "@brains/contracts";

/** Only field paths and validator-authored messages cross the operator boundary. */
export interface OperatorValidationFailure {
  readonly kind: "invalid";
  readonly issues: readonly {
    readonly path: readonly (string | number)[];
    readonly message: string;
  }[];
}

const issuesSchema = z.object({
  issues: z.array(
    z.object({
      path: z
        .array(z.union([z.string(), z.number().int().nonnegative()]))
        .default([]),
      message: z.string(),
    }),
  ),
});
const wrappedSchema = z.object({
  name: z.literal("EntityValidationError"),
  entityType: z.string(),
  originalError: z.unknown(),
});
const causes = new WeakMap<object, unknown>();

/** Runtime diagnostics only; never exported by the authoring SDK. */
export function operatorValidationCause(result: object): unknown {
  return causes.get(result);
}

export function operatorFailure<T extends object>(
  result: T,
  cause: unknown,
): T {
  causes.set(result, cause);
  return Object.freeze(result);
}

export async function operatorRead<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    const mapped = toSdkError(cause);
    let code = mapped.code;
    try {
      if (signal?.aborted && cause === signal.reason) code = "cancelled";
      else if (issuesSchema.safeParse(cause).success) code = "invalid_input";
    } catch {
      // Unreadable exception properties remain private diagnostics.
    }
    const error = new SdkError(
      code,
      code === mapped.code ? { publicMessage: mapped.publicMessage } : {},
    );
    causes.set(error, cause);
    throw error;
  }
}

export async function operatorMutation<T>(
  operation: () => Promise<T>,
): Promise<T | OperatorValidationFailure> {
  try {
    return await operation();
  } catch (cause) {
    const mapped = toSdkError(cause);
    let code = mapped.code;
    let failure: OperatorValidationFailure | undefined;
    try {
      if (
        z
          .object({ name: z.literal("EntityWriteConflictError") })
          .safeParse(cause).success
      ) {
        code = "conflict";
      }
      const wrapped = wrappedSchema.safeParse(cause);
      const parsed = issuesSchema.safeParse(
        wrapped.success ? wrapped.data.originalError : cause,
      );
      if (
        wrapped.success ||
        parsed.success ||
        mapped.code === "invalid_input"
      ) {
        failure = Object.freeze({
          kind: "invalid",
          issues: Object.freeze(
            (parsed.success ? parsed.data.issues : [])
              .slice(0, 50)
              .map((issue) =>
                Object.freeze({
                  path: Object.freeze(
                    issue.path
                      .slice(0, 32)
                      .map((part) =>
                        typeof part === "string" ? part.slice(0, 256) : part,
                      ),
                  ),
                  message: issue.message.slice(0, 1024),
                }),
              ),
          ),
        });
      }
    } catch {
      // Hostile exception getters must not become a second information channel.
    }
    if (failure) {
      causes.set(failure, cause);
      return failure;
    }
    // Preserve codes/public messages but do not expose diagnostic message/cause.
    const error = new SdkError(
      code,
      code === mapped.code ? { publicMessage: mapped.publicMessage } : {},
    );
    causes.set(error, cause);
    throw error;
  }
}
