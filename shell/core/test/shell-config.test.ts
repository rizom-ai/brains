import { describe, expect, it } from "bun:test";
import type * as ShellConfigModule from "../src/config/shellConfig";

async function loadConfigWithEnv(
  env: Record<string, string | undefined>,
): Promise<typeof ShellConfigModule> {
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const module = await import(
    `../src/config/shellConfig.ts?test=${Date.now()}-${Math.random()}`
  );

  process.env = previous;
  return module as typeof ShellConfigModule;
}

describe("standard shell paths", () => {
  it("uses XDG_DATA_HOME for state databases when set", async () => {
    const { getStandardConfig } = await loadConfigWithEnv({
      XDG_DATA_HOME: "/data",
    });

    const config = getStandardConfig();

    expect(config.database.url).toBe("file:/data/brain.db");
    expect(config.jobQueueDatabase.url).toBe("file:/data/brain-jobs.db");
    expect(config.conversationDatabase.url).toBe("file:/data/conversations.db");
    expect(config.embeddingDatabase.url).toBe("file:/data/embeddings.db");
  });
});
