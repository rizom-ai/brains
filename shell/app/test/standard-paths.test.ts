import { describe, expect, it } from "bun:test";
import {
  resolveGitBrokerCheckout,
  resolveStandardConfig,
  resolveStandardPaths,
} from "../src/standard-paths";

describe("resolveStandardPaths", () => {
  it("honors XDG env vars like deployed containers set them", () => {
    expect(
      resolveStandardPaths({
        XDG_DATA_HOME: "/data",
        XDG_CACHE_HOME: "/cache",
      }),
    ).toEqual({ dataDir: "/data", cacheDir: "/cache", distDir: "./dist" });
  });

  it("falls back to the fixed relative defaults", () => {
    expect(resolveStandardPaths({})).toEqual({
      dataDir: "./data",
      cacheDir: "./cache",
      distDir: "./dist",
    });
  });
});

describe("resolveGitBrokerCheckout", () => {
  it("accepts only the supervisor-assigned absolute checkout path", () => {
    expect(
      resolveGitBrokerCheckout({
        BRAIN_GIT_BROKER_CHECKOUT: "/brain/brain-data",
      }),
    ).toBe("/brain/brain-data");
    expect(resolveGitBrokerCheckout({})).toBeUndefined();
    expect(() =>
      resolveGitBrokerCheckout({ BRAIN_GIT_BROKER_CHECKOUT: "./brain-data" }),
    ).toThrow("must be absolute");
  });
});

describe("resolveStandardConfig", () => {
  it("maps XDG_DATA_HOME to /data database urls (Docker/Kamal contract)", () => {
    const config = resolveStandardConfig({ XDG_DATA_HOME: "/data" });

    expect(config.database.url).toBe("file:/data/brain.db");
    expect(config.jobQueueDatabase.url).toBe("file:/data/brain-jobs.db");
    expect(config.conversationDatabase.url).toBe("file:/data/conversations.db");
    expect(config.runtimeStateDatabase.url).toBe("file:/data/runtime-state.db");
  });
});
