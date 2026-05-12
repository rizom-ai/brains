/**
 * Helper for creating consistent job handler results.
 * Reduces boilerplate in try/catch blocks.
 */
export const JobResult = {
  /**
   * Create a success result by spreading data into { success: true, ...data }
   */
  success<T extends Record<string, unknown>>(data: T): { success: true } & T {
    return { success: true, ...data };
  },

  /**
   * Create a failure result from an error.
   * Extracts error message from Error objects or converts to string.
   */
  failure(error: unknown): { success: false; error: string } {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  },
};
