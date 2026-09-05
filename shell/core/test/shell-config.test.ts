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

  it("preserves configured reasoning effort", () => {
    const config = createShellConfig({
      ai: {
        apiKey: "test-key",
        model: "gpt-5.6-luna",
        reasoningEffort: "low",
      },
    });

    expect(config.ai.reasoningEffort).toBe("low");
  });

  it("uses bounded parallel job execution by default and accepts an override", () => {
    expect(
      createShellConfig({
        ai: { apiKey: "test-key", model: "gpt-4o-mini" },
      }).jobQueue.workerConcurrency,
    ).toBe(4);
    expect(
      createShellConfig({
        ai: { apiKey: "test-key", model: "gpt-4o-mini" },
        jobQueue: { workerConcurrency: 2 },
      }).jobQueue.workerConcurrency,
    ).toBe(2);
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
      expect(config.embedding.enabled).toBe(true);
    } finally {
      delete process.env["XDG_DATA_HOME"];
    }
  });

  it("provides only local database URLs, without remote credentials", () => {
    const config = getStandardConfig();
    for (const database of [
      config.database,
      config.jobQueueDatabase,
      config.conversationDatabase,
      config.runtimeStateDatabase,
    ]) {
      expect(Object.keys(database)).toEqual(["url"]);
      expect(database.url.startsWith("file:")).toBe(true);
    }
  });
});
