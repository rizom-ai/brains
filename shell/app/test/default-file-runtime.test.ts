import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { App } from "../src/app";
import type { PluginCapabilities } from "@brains/plugins";

test("a combined App provisions its real native file runtime without an extra database owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "app-default-files-"));
  const database = (name: string): { url: string } => ({
    url: pathToFileURL(join(directory, `${name}.db`)).href,
  });
  const sourceFile = join(directory, "fixture");
  const expected = {
    sizeBytes: 5,
    sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  };
  let finalExport: typeof expected | undefined;
  const app = App.create({
    logLevel: "error",
    shellConfig: {
      database: database("entities"),
      jobQueueDatabase: database("jobs"),
      conversationDatabase: database("conversations"),
      runtimeStateDatabase: database("runtime"),
      ai: { apiKey: "no-provider-calls", model: "claude-haiku-4-5" },
      embedding: { enabled: false },
      plugins: [
        {
          id: "final-file-export",
          version: "1.0.0",
          type: "service",
          description: "Performs a final native file operation during shutdown",
          packageName: "@test/final-file-export",
          register: async (): Promise<PluginCapabilities> => ({
            tools: [],
            resources: [],
          }),
          shutdown: async (): Promise<void> => {
            const files = app.getShell().getEntityService().fileAssets;
            assert.ok(files);
            finalExport = await files.fingerprint({ sourceFile, sizeBytes: 5 });
          },
        },
      ],
    },
  });
  try {
    await app.initialize({ mode: "register-only" });
    const files = app.getShell().getEntityService().fileAssets;
    assert.ok(files);
    await Bun.write(sourceFile, "hello");
    expect(await files.fingerprint({ sourceFile, sizeBytes: 5 })).toEqual(
      expected,
    );
    await app.stop();
    expect(finalExport).toEqual(expected);
    await assert.rejects(
      files.fingerprint({ sourceFile, sizeBytes: 5 }),
      /closing/,
    );
  } finally {
    await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
