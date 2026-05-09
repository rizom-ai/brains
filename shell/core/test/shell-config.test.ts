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

describe("shell config", () => {
  it("preserves shared conversation spaces", async () => {
    const { createShellConfig } = await loadConfigWithEnv({});

    const config = createShellConfig({
      ai: { apiKey: "test-key", model: "gpt-4o-mini" },
      spaces: ["discord:project-*"],
    });

    expect(config.spaces).toEqual(["discord:project-*"]);
  });
});

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

  it("does not read database auth tokens from ambient env", async () => {
    const { getStandardConfig } = await loadConfigWithEnv({
      DATABASE_AUTH_TOKEN: "db-secret",
      JOB_QUEUE_DATABASE_AUTH_TOKEN: "jobs-secret",
      CONVERSATION_DATABASE_AUTH_TOKEN: "conversation-secret",
    });

    const config = getStandardConfig();

    expect(config.database.authToken).toBeUndefined();
    expect(config.embeddingDatabase.authToken).toBeUndefined();
    expect(config.jobQueueDatabase.authToken).toBeUndefined();
    expect(config.conversationDatabase.authToken).toBeUndefined();
  });
});
