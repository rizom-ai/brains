import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { operateRemote } from "../src/commands/operate-remote";

// Mock MCPClient
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockListTools = mock(() =>
  Promise.resolve([
    {
      name: "system_list",
      description: "List entities",
      inputSchema: {
        type: "object",
        properties: { entityType: { type: "string" } },
        required: ["entityType"],
      },
    },
    {
      name: "system_status",
      description: "System status",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "directory-sync_sync",
      description: "Sync",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "media-tools_preview-attachment",
      description: "Preview attachment",
      inputSchema: {
        type: "object",
        properties: {
          entityType: { type: "string" },
          entityId: { type: "string" },
          attachmentType: { type: "string" },
        },
        required: ["entityType", "entityId", "attachmentType"],
      },
    },
  ]),
);
const mockCallTool = mock(() => Promise.resolve('{"entities":[]}'));

void mock.module("../src/lib/mcp-client", () => ({
  MCPClient: class {
    connect = mockConnect;
    close = mockClose;
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

describe("operateRemote", () => {
  let outputDir: string | undefined;

  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockListTools.mockClear();
    mockCallTool.mockClear();
    outputDir = undefined;
  });

  afterEach(async () => {
    if (outputDir) {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("should connect to remote and call matched tool", async () => {
    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "list",
      ["post"],
      {},
      undefined,
    );
    expect(result.success).toBe(true);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("should fail for unknown command", async () => {
    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "foobar",
      [],
      {},
      undefined,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown command");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("should match system tool by suffix", async () => {
    await operateRemote(
      "https://rover.rizom.ai/mcp",
      "status",
      [],
      {},
      undefined,
    );
    expect(mockCallTool).toHaveBeenCalledWith("system_status", {});
  });

  it("should match plugin tool by suffix", async () => {
    await operateRemote(
      "https://rover.rizom.ai/mcp",
      "sync",
      [],
      {},
      undefined,
    );
    expect(mockCallTool).toHaveBeenCalledWith("directory-sync_sync", {});
  });

  it("writes inline remote preview artifacts to the local outputDir", async () => {
    outputDir = await mkdtemp(join(tmpdir(), "remote-preview-test-"));
    mockCallTool.mockImplementationOnce(() =>
      Promise.resolve(
        JSON.stringify({
          success: true,
          data: {
            filename: "preview.pdf",
            mimeType: "application/pdf",
            bytes: 9,
            inline: true,
            contentBase64: Buffer.from("%PDF-test").toString("base64"),
          },
        }),
      ),
    );

    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "preview-attachment",
      ["deck", "deck-1", "carousel"],
      { outputDir },
      undefined,
    );

    expect(result.success).toBe(true);
    expect(mockCallTool).toHaveBeenCalledWith(
      "media-tools_preview-attachment",
      {
        entityType: "deck",
        entityId: "deck-1",
        attachmentType: "carousel",
      },
    );
    expect(await readFile(join(outputDir, "preview.pdf"), "utf8")).toBe(
      "%PDF-test",
    );
  });

  it("should always close even on error", async () => {
    mockListTools.mockImplementationOnce(() =>
      Promise.reject(new Error("Connection refused")),
    );

    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "list",
      ["post"],
      {},
      undefined,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("Connection refused");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
