import { describe, expect, it } from "bun:test";
import { aiToolClients, mcpServerName } from "./ai-tool-clients";

const address = "https://becca.rizom.ai/mcp";

describe("mcpServerName", () => {
  it("names the server after the brain's host", () => {
    expect(mcpServerName(address)).toBe("becca-rizom-ai");
    expect(mcpServerName("http://localhost:8080/mcp")).toBe("localhost-8080");
  });
});

describe("aiToolClients", () => {
  const clients = aiToolClients(address);
  const byId = new Map(clients.map((client) => [client.id, client]));

  it("leads with the chat apps and keeps developer clients in the developer group", () => {
    expect(
      clients
        .filter((client) => client.group === "primary")
        .map((client) => client.id),
    ).toEqual(["claude", "chatgpt"]);
    expect(
      clients
        .filter((client) => client.group === "developer")
        .map((client) => client.id),
    ).toEqual(["claude-code", "cursor", "vscode", "other"]);
  });

  it("gives Claude Code a command that adds this brain under its own name", () => {
    expect(byId.get("claude-code")?.snippet?.code).toBe(
      "claude mcp add --transport http becca-rizom-ai https://becca.rizom.ai/mcp",
    );
  });

  it("gives configuration snippets that are valid JSON for this brain", () => {
    expect(JSON.parse(byId.get("cursor")?.snippet?.code ?? "")).toEqual({
      mcpServers: { "becca-rizom-ai": { url: address } },
    });
    expect(JSON.parse(byId.get("vscode")?.snippet?.code ?? "")).toEqual({
      servers: { "becca-rizom-ai": { type: "http", url: address } },
    });
    expect(JSON.parse(byId.get("other")?.snippet?.code ?? "")).toEqual({
      mcpServers: {
        "becca-rizom-ai": {
          command: "npx",
          args: ["-y", "mcp-remote", address],
        },
      },
    });
  });

  it("pretty-prints configuration snippets over several lines", () => {
    expect(
      byId.get("cursor")?.snippet?.code.split("\n").length,
    ).toBeGreaterThan(3);
  });
});
