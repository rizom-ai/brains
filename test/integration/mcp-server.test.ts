import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP Server Integration Tests", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Create transport
    transport = new StdioClientTransport({
      command: "bun",
      args: ["run", "examples/brain-mcp-server.ts"],
    });

    // Create and connect client
    client = new Client({
      name: "integration-test",
      version: "1.0.0",
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("should list available tools", async () => {
    const result = await client.listTools();
    
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);
    
    const toolNames = result.tools.map(t => t.name);
    expect(toolNames).toContain("brain_query");
    expect(toolNames).toContain("brain_command");
    expect(toolNames).toContain("entity_search");
    expect(toolNames).toContain("entity_get");
    expect(toolNames).toContain("brain_status");
  });

  it("should list available resources", async () => {
    const result = await client.listResources();
    
    expect(result.resources).toBeDefined();
    expect(result.resources.length).toBeGreaterThan(0);
    
    const resourceUris = result.resources.map(r => r.uri);
    expect(resourceUris).toContain("health");
    expect(resourceUris).toContain("entity-types");
    expect(resourceUris).toContain("schema-list");
  });

  it("should execute brain_status tool", async () => {
    const result = await client.callTool({
      name: "brain_status",
      arguments: {},
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    
    const content = JSON.parse(result.content[0].text);
    expect(content.status).toBe("operational");
    expect(content.database).toBeDefined();
    expect(content.components).toBeDefined();
  });

  it("should read health resource", async () => {
    const result = await client.readResource({
      uri: "health",
    });

    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBeGreaterThan(0);
    
    const content = JSON.parse(result.contents[0].text);
    expect(content.status).toBe("healthy");
    expect(content.timestamp).toBeDefined();
    expect(content.uptime).toBeDefined();
  });
});