export const JobResult = {
  success<T extends Record<string, unknown>>(data: T): { success: true } & T {
    return { success: true, ...data };
  },

  failure(error: unknown): { success: false; error: string } {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  },
};
