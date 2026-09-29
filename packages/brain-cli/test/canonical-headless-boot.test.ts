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
import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { waitUntil } from "@brains/test-utils";
import { isRecord } from "@brains/utils/is-record";

const appEntrypoint = join(
  import.meta.dir,
  "fixtures",
  "canonical-headless-app.ts",
);

const VERBATIM_NOTE_BODY = `# Verbatim MCP Note

Keep **bold text**, \`inline code\`, and punctuation: alpha / beta.

- First item
- Second item — with an em dash

Final checksum: MCP-VERBATIM-7F3A.`;

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

function objectContent(result: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(textContent(result));
  if (!isRecord(parsed)) throw new Error("Expected an MCP object payload");
  return parsed;
}

function successData(result: unknown): Record<string, unknown> {
  const payload = objectContent(result);
  const data = payload["data"];
  return payload["success"] === true && isRecord(data) ? data : payload;
}

describe("canonical headless walking skeleton", () => {
  test("hands seeded note content verbatim through canonical chat-only stdio MCP", async () => {
    const instanceDirectory = mkdtempSync(
      join(tmpdir(), "brain-canonical-basic-mcp-"),
    );
    const seedDirectory = join(instanceDirectory, "seed-content");
    mkdirSync(seedDirectory, { recursive: true });
    writeFileSync(
      join(seedDirectory, "headless-proof.md"),
      `---
title: Headless Proof
status: draft
---

${VERBATIM_NOTE_BODY}
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
  mcp:
    mode: basic
  directory-sync:
    seedContentPath: ./seed-content
    seedContent: true
    initialSync: true
`,
    );

    const transport = new StdioClientTransport({
      command: "bun",
      args: [appEntrypoint],
      cwd: instanceDirectory,
      env: {
        ...getDefaultEnvironment(),
        AI_API_KEY: "placeholder-headless-test",
        XDG_DATA_HOME: join(instanceDirectory, "xdg-data"),
        CANONICAL_HEADLESS_AI_SCENARIO: "read",
      },
      stderr: "pipe",
    });
    const client = new Client({
      name: "canonical-basic-mcp-test",
      version: "1.0.0",
    });
    let connected = false;

    try {
      await client.connect(transport);
      connected = true;
      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name).sort()).toEqual([
        "chat",
        "confirm",
      ]);

      let responseData: Record<string, unknown> = {};
      await waitUntil(
        async () => {
          const response = await client.callTool({
            name: "chat",
            arguments: {
              message:
                "Retrieve the seeded note with id headless-proof and return its body verbatim.",
              conversationId: "seeded-read",
            },
          });
          expect(response.isError).not.toBe(true);
          responseData = successData(response);
          return !String(responseData["text"]).includes("knowledge base ready");
        },
        "the seeded brain to answer through basic MCP chat",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      expect(responseData["text"]).toBe(VERBATIM_NOTE_BODY);
      expect(responseData["toolResults"]).toEqual([
        expect.objectContaining({
          toolName: "system_get",
          args: { entityType: "note", id: "headless-proof" },
          data: {
            entity: expect.objectContaining({
              content: VERBATIM_NOTE_BODY,
            }),
          },
        }),
      ]);
    } finally {
      if (connected) await client.close();
      else await transport.close();
      rmSync(instanceDirectory, { recursive: true, force: true });
    }
  }, 120_000);

  test("writes, confirms, and reads back through canonical basic MCP", async () => {
    const instanceDirectory = mkdtempSync(
      join(tmpdir(), "brain-canonical-basic-mcp-write-"),
    );
    mkdirSync(join(instanceDirectory, "seed-content"), { recursive: true });
    writeFileSync(
      join(instanceDirectory, "brain.yaml"),
      `brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core]
plugins:
  mcp:
    mode: basic
  directory-sync:
    seedContentPath: ./seed-content
    seedContent: true
    initialSync: true
`,
    );

    const transport = new StdioClientTransport({
      command: "bun",
      args: [appEntrypoint],
      cwd: instanceDirectory,
      env: {
        ...getDefaultEnvironment(),
        AI_API_KEY: "placeholder-headless-test",
        XDG_DATA_HOME: join(instanceDirectory, "xdg-data"),
        CANONICAL_HEADLESS_AI_SCENARIO: "write-confirm-read",
      },
      stderr: "pipe",
    });
    const client = new Client({
      name: "canonical-basic-mcp-write-test",
      version: "1.0.0",
    });
    let connected = false;

    try {
      await client.connect(transport);
      connected = true;
      expect(
        (await client.listTools()).tools.map(({ name }) => name).sort(),
      ).toEqual(["chat", "confirm"]);

      let pending: Record<string, unknown> = {};
      await waitUntil(
        async () => {
          pending = objectContent(
            await client.callTool({
              name: "chat",
              arguments: {
                message:
                  "Save this exact Markdown as a note:\n\n# MCP Basic Evidence Note\n\nProtocol write confirmation survived.",
                conversationId: "write-confirm-read",
              },
            }),
          );
          return pending["needsConfirmation"] === true;
        },
        "the seeded brain to request confirmation through basic MCP chat",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      const confirmationArgs = pending["args"];
      if (!isRecord(confirmationArgs)) {
        throw new Error("Expected MCP confirmation arguments");
      }
      const approvalId = confirmationArgs["approvalId"];
      if (typeof approvalId !== "string") {
        throw new Error(`Expected MCP approval id: ${JSON.stringify(pending)}`);
      }
      expect(pending).toMatchObject({
        needsConfirmation: true,
        toolName: "system_create",
        args: {
          conversationId: "write-confirm-read",
          approvalId,
        },
      });

      const confirmed = successData(
        await client.callTool({
          name: "confirm",
          arguments: {
            approvalId,
            confirmed: true,
            conversationId: "write-confirm-read",
          },
        }),
      );
      expect(confirmed["text"]).toContain("Completed");
      expect(JSON.stringify(confirmed["toolResults"])).toContain(
        "mcp-basic-evidence-note",
      );

      const retrieved = successData(
        await client.callTool({
          name: "chat",
          arguments: {
            message:
              "Retrieve the note with exact id mcp-basic-evidence-note and quote its body.",
            conversationId: "write-confirm-read",
          },
        }),
      );
      expect(retrieved["text"]).toContain(
        "Protocol write confirmation survived.",
      );
    } finally {
      if (connected) await client.close();
      else await transport.close();
      rmSync(instanceDirectory, { recursive: true, force: true });
    }
  }, 120_000);

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
  mcp:
    mode: debug
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
