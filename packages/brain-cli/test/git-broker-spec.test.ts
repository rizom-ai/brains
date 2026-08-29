import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellConfigSchema } from "@brains/core";
import {
  BRAIN_DEFAULT_DATA_DIR,
  resolveGitBrokerEntrypointPath,
  resolveGitBrokerSpec,
} from "../src/lib/git-broker-spec";

/**
 * Whether a broker starts at all is decided here, from the same `brain.yaml`
 * the app roles read.
 */

describe("git broker spec", () => {
  it("selects a lightweight sibling entrypoint only when it exists", () => {
    const root = mkdtempSync(join(tmpdir(), "git-broker-entrypoint-"));
    const brainEntrypoint = join(root, "brain.js");
    const brokerEntrypoint = join(root, "git-broker.js");
    try {
      expect(resolveGitBrokerEntrypointPath(brainEntrypoint)).toBeUndefined();
      writeFileSync(brokerEntrypoint, "// broker\n");
      expect(resolveGitBrokerEntrypointPath(brainEntrypoint)).toBe(
        brokerEntrypoint,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts no broker for a Brain without Git", () => {
    expect(resolveGitBrokerSpec("/brain", { brain: "brain" })).toBeUndefined();
    expect(
      resolveGitBrokerSpec("/brain", {
        brain: "brain",
        plugins: { "directory-sync": { autoSync: true } },
      }),
    ).toBeUndefined();
    // A git block that names no remote is the "git sync disabled" case the
    // plugin already logs; there is nothing to own.
    expect(
      resolveGitBrokerSpec("/brain", {
        brain: "brain",
        plugins: { "directory-sync": { git: { branch: "main" } } },
      }),
    ).toBeUndefined();
  });

  it("derives one socket per instance, outside the checkout", () => {
    const spec = resolveGitBrokerSpec("/brain", {
      brain: "brain",
      plugins: {
        "directory-sync": { git: { repo: "rizom-ai/content" } },
      },
    });

    // Inside the checkout the socket would be a file Git could stage, and a
    // clone or reset could remove the ownership boundary itself.
    expect(spec).toEqual({
      socketPath: join("/brain", ".brain-runtime", "git-broker.sock"),
      checkoutPath: join("/brain", "brain-data"),
    });
  });

  it("refuses a configuration whose checkout would contain the socket", () => {
    expect(() =>
      resolveGitBrokerSpec("/brain", {
        brain: "brain",
        plugins: {
          "directory-sync": {
            syncPath: ".",
            git: { repo: "rizom-ai/content" },
          },
        },
      }),
    ).toThrow(/runtime directory/);
  });

  it("assumes the data dir the shell actually defaults to", () => {
    // The broker child and the app roles must resolve the same checkout. They
    // derive it from separate processes, so the shared assumption is pinned
    // rather than left to drift.
    const shellDefaults = shellConfigSchema.parse({
      name: "test",
      version: "0.0.0",
      database: { url: "file:test.db" },
      jobQueueDatabase: { url: "file:jobs.db" },
      conversationDatabase: { url: "file:conversations.db" },
      runtimeStateDatabase: { url: "file:runtime.db" },
      embedding: { url: "file:embedding.db" },
      ai: { model: "test", apiKey: "test-key" },
    });

    expect(shellDefaults.dataDir).toBe(BRAIN_DEFAULT_DATA_DIR);
  });
});
