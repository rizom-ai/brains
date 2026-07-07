import { describe, expect, it } from "bun:test";
import { createShellConfig, getStandardConfig } from "../src/config";

describe("shell config", () => {
  it("preserves shared conversation spaces", () => {
    const config = createShellConfig({
      ai: { apiKey: "test-key", model: "gpt-4o-mini" },
      spaces: ["discord:project-*"],
    });

    expect(config.spaces).toEqual(["discord:project-*"]);
  });
});

describe("standard shell paths", () => {
  it("uses fixed relative defaults and ignores ambient env", () => {
    // Environment policy (XDG_DATA_HOME etc.) belongs to the app/deploy
    // layer, which passes explicit config in; core stays deterministic.
    process.env["XDG_DATA_HOME"] = "/somewhere-else";
    try {
      const config = getStandardConfig();

      expect(config.database.url).toBe("file:./data/brain.db");
      expect(config.jobQueueDatabase.url).toBe("file:./data/brain-jobs.db");
      expect(config.conversationDatabase.url).toBe(
        "file:./data/conversations.db",
      );
      expect(config.runtimeStateDatabase.url).toBe(
        "file:./data/runtime-state.db",
      );
      expect(config.embeddingDatabase.url).toBe("file:./data/embeddings.db");
      expect(config.embedding.cacheDir).toBe("./cache/embeddings");
    } finally {
      delete process.env["XDG_DATA_HOME"];
    }
  });

  it("does not read database auth tokens from ambient env", () => {
    const config = getStandardConfig();

    expect(config.database.authToken).toBeUndefined();
    expect(config.embeddingDatabase.authToken).toBeUndefined();
    expect(config.jobQueueDatabase.authToken).toBeUndefined();
    expect(config.conversationDatabase.authToken).toBeUndefined();
    expect(config.runtimeStateDatabase.authToken).toBeUndefined();
  });
});
