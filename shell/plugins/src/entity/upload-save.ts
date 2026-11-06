import type {
  CreateInterceptor,
  UploadSaveHandler,
} from "@brains/entity-service";

/**
 * Build an upload-save handler from an entity's create-from-upload path.
 *
 * The save is rewritten into a create input whose `from` is the upload ref, so
 * a plugin that already promotes uploads through system_create reuses that
 * promotion. A promotion that does not handle the input fails with
 * `unhandledError`.
 */
export function createUploadSaveHandler(
  entityType: string,
  promote: CreateInterceptor,
  unhandledError: string,
): UploadSaveHandler {
  return async (input, executionContext) => {
    const interception = await promote(
      {
        entityType,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
          : {}),
        from: input.upload,
      },
      executionContext,
    );
    return interception.kind === "handled"
      ? interception.result
      : { success: false, error: unhandledError };
  };
}
