import { describe, expect, it } from "bun:test";
import { resolveRuntimeSyncPath } from "../src/plugin";

describe("directory-sync runtime checkout path", () => {
  it("uses the broker-owned absolute checkout instead of resolving a relative shell default again", () => {
    expect(
      resolveRuntimeSyncPath({
        configuredSyncPath: undefined,
        dataDir: "./brain-data",
        gitConfigured: true,
        gitBrokerCheckout: "/brain/brain-data",
      }),
    ).toBe("/brain/brain-data");
  });

  it("keeps ordinary non-Git path selection unchanged", () => {
    expect(
      resolveRuntimeSyncPath({
        configuredSyncPath: "/content",
        dataDir: "/brain/brain-data",
        gitConfigured: false,
        gitBrokerCheckout: undefined,
      }),
    ).toBe("/content");
  });

  it("fails early when a Git role received no checkout handoff", () => {
    expect(() =>
      resolveRuntimeSyncPath({
        configuredSyncPath: undefined,
        dataDir: "./brain-data",
        gitConfigured: true,
        gitBrokerCheckout: undefined,
      }),
    ).toThrow("checkout path is unavailable");
  });
});
