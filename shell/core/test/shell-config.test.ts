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

  it("fills every default from the schema", () => {
    const config = createShellConfig({
      ai: { apiKey: "test-key", model: "gpt-4o-mini" },
    });

    expect(config.name).toBe("brain-app");
    expect(config.version).toBe("1.0.0");
    expect(config.dataDir).toBe("./brain-data");
    expect(config.themeCSS).toBe("");
    expect(config.preferLocalUrls).toBe(false);
    expect(config.features).toEqual({});
    expect(config.spaces).toEqual([]);
    expect(config.plugins).toEqual([]);
    expect(config.permissions).toEqual({});
    expect(config.logging).toEqual({
      level: "info",
      format: "text",
      context: "shell",
    });
    expect(config.ai).toEqual({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 1000,
      webSearch: true,
    });
    expect(config.embedding).toEqual({ enabled: true });
  });

  it("uses the standard database paths unless a database is overridden", () => {
    const standard = getStandardConfig();
    const config = createShellConfig({
      ai: { apiKey: "test-key", model: "gpt-4o-mini" },
      conversationDatabase: { url: "file:elsewhere.db" },
    });

    expect(config.database).toEqual(standard.database);
    expect(config.jobQueueDatabase).toEqual(standard.jobQueueDatabase);
    expect(config.runtimeStateDatabase).toEqual(standard.runtimeStateDatabase);
    expect(config.embeddingDatabase).toEqual(standard.embeddingDatabase);
    expect(config.conversationDatabase).toEqual({ url: "file:elsewhere.db" });
  });

  it("defaults the AI key to an empty string when only a model is configured", () => {
    const config = createShellConfig({ ai: { model: "gpt-4o-mini" } });

    expect(config.ai.apiKey).toBe("");
  });

  it("rejects a configuration without a model", () => {
    expect(() => createShellConfig({ ai: { apiKey: "test-key" } })).toThrow();
  });

  it("omits optional fields that were not provided", () => {
    const config = createShellConfig({
      ai: { apiKey: "test-key", model: "gpt-4o-mini" },
    });

    const absent = [
      "siteBaseUrl",
      "localSiteUrl",
      "gitBrokerSocket",
      "gitBrokerCheckout",
      "entityDisplay",
      "profileKind",
      "identity",
      "profile",
      "agentInstructions",
      "evalHandlerRegistry",
    ];
    expect(Object.keys(config).filter((key) => absent.includes(key))).toEqual(
      [],
    );
    expect(Object.keys(config.ai)).not.toContain("imageApiKey");
    expect(Object.keys(config.ai)).not.toContain("reasoningEffort");
    expect(Object.keys(config.logging)).not.toContain("file");
  });

  it("keeps optional fields that were provided", () => {
    const config = createShellConfig({
      ai: {
        apiKey: "test-key",
        model: "gpt-4o-mini",
        imageApiKey: "image-key",
      },
      logging: { level: "debug", file: "/var/log/brain.log" },
      siteBaseUrl: "https://example.test",
      localSiteUrl: "http://localhost:3000",
      gitBrokerSocket: "/tmp/broker.sock",
      gitBrokerCheckout: "/srv/checkout",
      dataDir: "/srv/data",
      profileKind: "person",
      entityDisplay: { note: { label: "Note" } },
    });

    expect(config.ai.imageApiKey).toBe("image-key");
    expect(config.logging).toEqual({
      level: "debug",
      format: "text",
      context: "shell",
      file: "/var/log/brain.log",
    });
    expect(config.siteBaseUrl).toBe("https://example.test");
    expect(config.localSiteUrl).toBe("http://localhost:3000");
    expect(config.gitBrokerSocket).toBe("/tmp/broker.sock");
    expect(config.gitBrokerCheckout).toBe("/srv/checkout");
    expect(config.dataDir).toBe("/srv/data");
    expect(config.profileKind).toBe("person");
    expect(config.entityDisplay).toEqual({ note: { label: "Note" } });
  });

  it("carries runtime objects through by reference", () => {
    const permissions = { rules: [] };
    const identity = {
      name: "Rover",
      role: "assistant",
      purpose: "help",
      values: ["care"],
    };
    const agentInstructions = ["be brief"];
    const config = createShellConfig({
      ai: { apiKey: "test-key", model: "gpt-4o-mini" },
      permissions,
      identity,
      agentInstructions,
    });

    expect(config.permissions).toBe(permissions);
    expect(config.identity).toBe(identity);
    expect(config.agentInstructions).toBe(agentInstructions);
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
      expect(config.embedding.enabled).toBe(true);
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
