import { describe, it, expect } from "bun:test";
import { directorySyncConfigSchema } from "../src/types";

describe("git config block", () => {
  it("should accept config without git (git disabled)", () => {
    const result = directorySyncConfigSchema.parse({});
    expect(result.git).toBeUndefined();
  });

  it("should accept config with git block", () => {
    const result = directorySyncConfigSchema.parse({
      git: {
        repo: "rizom-ai/test-content",
        authorName: "Test",
        authorEmail: "test@example.com",
      },
    });
    expect(result.git).toBeDefined();
    expect(result.git?.repo).toBe("rizom-ai/test-content");
    expect(result.git?.authorName).toBe("Test");
    expect(result.git?.authorEmail).toBe("test@example.com");
  });

  it("should require repo when git is provided", () => {
    expect(() => directorySyncConfigSchema.parse({ git: {} })).toThrow();
  });

  it("should accept authToken in git config", () => {
    const result = directorySyncConfigSchema.parse({
      git: {
        repo: "rizom-ai/test",
        authToken: "ghp_secret123",
      },
    });
    expect(result.git?.authToken).toBe("ghp_secret123");
  });

  it("should have syncInterval at top level with default of 2 minutes", () => {
    const result = directorySyncConfigSchema.parse({});
    expect(result.syncInterval).toBe(2);
  });

  it("should allow overriding syncInterval", () => {
    const result = directorySyncConfigSchema.parse({
      syncInterval: 5,
    });
    expect(result.syncInterval).toBe(5);
  });

  it("should preserve existing directory-sync config alongside git", () => {
    const result = directorySyncConfigSchema.parse({
      autoSync: false,
      seedContent: false,
      syncInterval: 1,
      git: {
        repo: "rizom-ai/test",
      },
    });
    expect(result.autoSync).toBe(false);
    expect(result.seedContent).toBe(false);
    expect(result.syncInterval).toBe(1);
    expect(result.git?.repo).toBe("rizom-ai/test");
  });
});
