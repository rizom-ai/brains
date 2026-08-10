import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  operateRemote,
  type RemoteTool,
  type RemoteToolClient,
  type RemoteToolClientFactory,
} from "../src/commands/operate-remote";

const REMOTE_TOOLS: RemoteTool[] = [
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
    name: "directory_sync",
    description: "Sync",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * Build a fake remote client plus the factory that hands it to operateRemote.
 *
 * The client is injected as a parameter rather than swapped in with
 * `mock.module` — mcp-client is workspace-internal source, and module
 * replacement is reserved for genuinely external dependencies.
 */
function createFakeRemote(
  options: { listTools?: () => Promise<RemoteTool[]> } = {},
): {
  connect: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
  listTools: ReturnType<typeof mock>;
  callTool: ReturnType<typeof mock>;
  factory: RemoteToolClientFactory;
} {
  const connect = mock(() => Promise.resolve());
  const close = mock(() => Promise.resolve());
  const listTools = mock(
    options.listTools ??
      ((): Promise<RemoteTool[]> => Promise.resolve(REMOTE_TOOLS)),
  );
  const callTool = mock(() => Promise.resolve('{"entities":[]}'));

  const client = {
    connect,
    close,
    listTools,
    callTool,
  } satisfies RemoteToolClient;

  const factory: RemoteToolClientFactory = () => Promise.resolve(client);

  return { connect, close, listTools, callTool, factory };
}

describe("operateRemote", () => {
  let remote: ReturnType<typeof createFakeRemote>;

  beforeEach(() => {
    remote = createFakeRemote();
  });

  it("should connect to remote and call matched tool", async () => {
    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "list",
      ["post"],
      {},
      undefined,
      remote.factory,
    );
    expect(result.success).toBe(true);
    expect(remote.connect).toHaveBeenCalledTimes(1);
    expect(remote.callTool).toHaveBeenCalledTimes(1);
    expect(remote.close).toHaveBeenCalledTimes(1);
  });

  it("should fail for unknown command", async () => {
    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "foobar",
      [],
      {},
      undefined,
      remote.factory,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown command");
    expect(remote.close).toHaveBeenCalledTimes(1);
  });

  it("should match system tool by suffix", async () => {
    await operateRemote(
      "https://rover.rizom.ai/mcp",
      "status",
      [],
      {},
      undefined,
      remote.factory,
    );
    expect(remote.callTool).toHaveBeenCalledWith("system_status", {});
  });

  it("should match plugin tool by suffix", async () => {
    await operateRemote(
      "https://rover.rizom.ai/mcp",
      "sync",
      [],
      {},
      undefined,
      remote.factory,
    );
    expect(remote.callTool).toHaveBeenCalledWith("directory_sync", {});
  });

  it("should always close even on error", async () => {
    const failing = createFakeRemote({
      listTools: () => Promise.reject(new Error("Connection refused")),
    });

    const result = await operateRemote(
      "https://rover.rizom.ai/mcp",
      "list",
      ["post"],
      {},
      undefined,
      failing.factory,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("Connection refused");
    expect(failing.close).toHaveBeenCalledTimes(1);
  });

  it("passes the url and token through to the client factory", async () => {
    const factory = mock<RemoteToolClientFactory>(() =>
      Promise.resolve({
        connect: () => Promise.resolve(),
        close: () => Promise.resolve(),
        listTools: () => Promise.resolve(REMOTE_TOOLS),
        callTool: () => Promise.resolve("{}"),
      }),
    );

    await operateRemote(
      "https://rover.rizom.ai/mcp",
      "status",
      [],
      {},
      "secret-token",
      factory,
    );

    expect(factory).toHaveBeenCalledWith(
      "https://rover.rizom.ai/mcp",
      "secret-token",
    );
  });
});
