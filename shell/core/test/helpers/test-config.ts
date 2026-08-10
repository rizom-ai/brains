import type { ShellConfigInput } from "../../src/config/shellConfig";

/**
 * Shell config pointing every database at a per-test temp directory.
 */
export function createTestShellConfig(
  dir: string,
  overrides: Partial<ShellConfigInput> = {},
): ShellConfigInput {
  return {
    plugins: [],
    database: { url: `file:${dir}/test.db` },
    jobQueueDatabase: { url: `file:${dir}/test-jobs.db` },
    conversationDatabase: { url: `file:${dir}/test-conv.db` },
    runtimeStateDatabase: { url: `file:${dir}/test-runtime-state.db` },
    ai: {
      model: "claude-haiku-4-5",
      apiKey: "test-key",
    },
    embedding: {
      enabled: true,
    },
    ...overrides,
  };
}
