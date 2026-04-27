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
        repo: "your-org/test-content",
        authorName: "Test",
        authorEmail: "test@example.com",
      },
    });
    expect(result.git).toBeDefined();
    expect(result.git?.repo).toBe("your-org/test-content");
    expect(result.git?.authorName).toBe("Test");
    expect(result.git?.authorEmail).toBe("test@example.com");
  });

  it("should allow git block with just gitUrl (no repo)", () => {
    const result = directorySyncConfigSchema.parse({
      git: { gitUrl: "file:///tmp/local-repo" },
    });
    expect(result.git?.gitUrl).toBe("file:///tmp/local-repo");
  });

  it("should default bootstrapFromSeed to true", () => {
    const result = directorySyncConfigSchema.parse({
      git: { gitUrl: "file:///tmp/local-repo" },
    });
    expect(result.git?.bootstrapFromSeed).toBe(true);
  });

  it("should allow bootstrapFromSeed", () => {
    const result = directorySyncConfigSchema.parse({
      git: { gitUrl: "file:///tmp/local-repo", bootstrapFromSeed: true },
    });
    expect(result.git?.bootstrapFromSeed).toBe(true);
  });

  it("should default branch to main", () => {
    const result = directorySyncConfigSchema.parse({
      git: { repo: "test/repo" },
    });
    expect(result.git?.branch).toBe("main");
  });

  it("should allow overriding branch", () => {
    const result = directorySyncConfigSchema.parse({
      git: { repo: "test/repo", branch: "master" },
    });
    expect(result.git?.branch).toBe("master");
  });

  it("should accept gitUrl as alternative to repo", () => {
    const result = directorySyncConfigSchema.parse({
      git: { gitUrl: "file:///tmp/test-remote" },
    });
    expect(result.git?.gitUrl).toBe("file:///tmp/test-remote");
    expect(result.git?.repo).toBeUndefined();
  });

  it("should accept authToken in git config", () => {
    const result = directorySyncConfigSchema.parse({
      git: {
        repo: "your-org/test",
        authToken: "test-token-abc123",
      },
    });
    expect(result.git?.authToken).toBe("test-token-abc123");
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
        repo: "your-org/test",
      },
    });
    expect(result.autoSync).toBe(false);
    expect(result.seedContent).toBe(false);
    expect(result.syncInterval).toBe(1);
    expect(result.git?.repo).toBe("your-org/test");
  });
});
