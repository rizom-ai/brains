import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createTestDatabase } from "../helpers/test-db";

describe("MCP Server Integration Tests", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    // Create a test database
    testDb = await createTestDatabase();

    // Create transport with silent logs and test database path
    const testMcpPath = new URL(
      "../helpers/test-mcp-server.ts",
      import.meta.url,
    ).pathname;
    transport = new StdioClientTransport({
      command: "bun",
      args: ["run", testMcpPath],
      env: {
        ...process.env,
        DATABASE_URL: `file:${testDb.dbPath}`,
      },
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
    await testDb.cleanup();
  });

  it("should list available tools", async () => {
    const result = await client.listTools();

    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("shell:query");
    expect(toolNames).toContain("shell:search");
    expect(toolNames).toContain("shell:get");
  });

  it("should list available resources", async () => {
    const result = await client.listResources();

    expect(result.resources).toBeDefined();
    expect(result.resources.length).toBeGreaterThan(0);

    const resourceUris = result.resources.map((r) => r.uri);
    expect(resourceUris).toContain("entity://types");
    expect(resourceUris).toContain("schema://list");
  });

  it("should execute shell:search tool", async () => {
    const result = await client.callTool({
      name: "shell:search",
      arguments: {
        entityType: "note",
        query: "test",
        limit: 10,
      },
    });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    const contentArray = result.content as Array<{
      type: string;
      text: string;
    }>;
    expect(contentArray.length).toBeGreaterThan(0);
    expect(contentArray[0]?.type).toBe("text");

    // Just verify we got a valid response without assuming the structure
    const responseText = contentArray[0]?.text ?? "";
    expect(responseText).toBeTruthy();
    expect(responseText.length).toBeGreaterThan(0);
  });

  it("should read entity types resource", async () => {
    const result = await client.readResource({
      uri: "entity://types",
    });

    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBeGreaterThan(0);

    const firstContent = result.contents[0];
    expect(firstContent).toBeDefined();
    expect(firstContent?.text).toBeDefined();

    // The entity types response is a string listing types, not JSON
    const content = firstContent?.text as string;
    expect(content).toBeDefined();
    expect(typeof content).toBe("string");
  });
});
