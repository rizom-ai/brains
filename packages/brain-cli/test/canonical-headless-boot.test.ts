import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { waitUntil } from "@brains/test-utils";

const appEntrypoint = join(
  import.meta.dir,
  "fixtures",
  "canonical-headless-app.ts",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textContent(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result["content"])) return "";
  return result["content"]
    .flatMap((item) =>
      isRecord(item) &&
      item["type"] === "text" &&
      typeof item["text"] === "string"
        ? [item["text"]]
        : [],
    )
    .join("\n");
}

describe("canonical headless walking skeleton", () => {
  test("boots core over MCP stdio, syncs its vault, and answers a tool", async () => {
    const instanceDirectory = mkdtempSync(
      join(tmpdir(), "brain-canonical-headless-"),
    );
    const seedDirectory = join(instanceDirectory, "seed-content");
    mkdirSync(seedDirectory, { recursive: true });
    writeFileSync(
      join(seedDirectory, "headless-proof.md"),
      `---
title: Headless Proof
status: draft
checksum: target-headless-seed
---

A headless brain imported this note before serving its first MCP request.
`,
    );
    writeFileSync(
      join(instanceDirectory, "brain.yaml"),
      `brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core]
plugins:
  directory-sync:
    seedContentPath: ./seed-content
    seedContent: true
    initialSync: true
`,
    );

    let stderr = "";
    const transport = new StdioClientTransport({
      command: "bun",
      args: [appEntrypoint],
      cwd: instanceDirectory,
      env: {
        ...getDefaultEnvironment(),
        AI_API_KEY: "placeholder-headless-test",
        XDG_DATA_HOME: join(instanceDirectory, "xdg-data"),
      },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const client = new Client({
      name: "canonical-headless-test",
      version: "1.0.0",
    });
    let connected = false;

    try {
      await client.connect(transport);
      connected = true;

      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name)).toContain("system_list");

      const listed = await client.callTool({
        name: "system_list",
        arguments: { entityType: "note" },
      });
      expect(listed.isError).not.toBe(true);
      expect(textContent(listed)).toContain('"id": "headless-proof"');

      const detail = await client.callTool({
        name: "system_get",
        arguments: { entityType: "note", id: "headless-proof" },
      });
      expect(detail.isError).not.toBe(true);
      expect(textContent(detail)).toContain(
        "A headless brain imported this note before serving its first MCP request.",
      );

      let inboxText = "";
      await waitUntil(
        async () => {
          const inbox = await client.callTool({
            name: "inbox_list",
            arguments: {},
          });
          expect(inbox.isError).not.toBe(true);
          inboxText = textContent(inbox);
          return inboxText.includes("Headless recurring check failed");
        },
        "the failed recurring check to reach the headless Inbox",
        { timeoutMs: 10_000, intervalMs: 50 },
      );
      expect(JSON.parse(inboxText)).toEqual({
        success: true,
        data: {
          entries: [
            {
              source: {
                sourceId: "recurring-checks",
                displayName: "Recurring checks",
              },
              item: {
                title: "Headless recurring check failed",
                summary:
                  "The canonical core retained this alert without a notification channel.",
                receivedAt: expect.any(String),
                urgency: "high",
              },
            },
          ],
          errors: [],
          total: 1,
        },
      });
      expect(
        existsSync(join(instanceDirectory, "brain-data", "headless-proof.md")),
      ).toBe(true);
      expect(stderr).not.toContain("Production server listening");
      expect(stderr).not.toContain(
        "MCP HTTP transport requires the webserver interface",
      );
    } finally {
      if (connected) await client.close();
      else await transport.close();
      rmSync(instanceDirectory, { recursive: true, force: true });
    }
  }, 120_000);
});
