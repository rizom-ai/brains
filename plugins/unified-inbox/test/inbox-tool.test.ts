import { describe, expect, it } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { MCPService } from "@brains/mcp-service";
import {
  InboxFollowUpRegistry,
  type InboxItem,
  type InboxRegistry,
  type Tool,
} from "@brains/plugins";

import {
  InboxDataSource,
  InboxOperatorService,
  inboxListToolOutputSchema,
} from "../src";
import { createUnifiedInboxPlugin } from "./install";
import { createPluginHarness } from "@brains/plugins/test";

function item(
  id: string,
  urgency: "high" | "normal",
  receivedAt: string,
): InboxItem {
  return {
    id,
    title: `Attention ${id}`,
    summary: `Safe summary ${id}`,
    contact: { label: `Contact ${id} · example.com`, personId: `person-${id}` },
    threadOrdinal: 4,
    receivedAt,
    urgency,
    facets: { category: urgency === "high" ? "work" : "opportunity" },
    entityRef: { entityType: "mail-item", entityId: `private-${id}` },
    actions: [{ id: "dismiss", label: "Dismiss" }],
  };
}

const mailSource = (
  items: InboxItem[],
): Parameters<InboxRegistry["registerSource"]>[1] => ({
  sourceId: "mail-items",
  displayName: "Email Triage",
  facets: [
    {
      key: "category",
      label: "Category",
      values: [
        { value: "work", label: "Work" },
        { value: "opportunity", label: "Opportunity" },
      ],
    },
  ],
  list: async () => items,
  act: async () => undefined,
});

/**
 * The tool as the runtime serves it.
 *
 * The permission check and the success/failure envelope moved to the
 * runtime with the conversion, so asserting on either means going through
 * the installed package rather than calling a handler directly.
 */
async function createToolFixture(items?: InboxItem[]): Promise<{
  service: InboxOperatorService;
  tool: Tool;
}> {
  const harness = createPluginHarness();
  const shell = harness.getMockShell();
  if (items)
    shell.getInboxRegistry().registerSource("mail-plugin", mailSource(items));
  const plugin = createUnifiedInboxPlugin();
  const capabilities = await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const tool = capabilities.tools.find(
    (candidate) => candidate.name === "unified-inbox_list",
  );
  if (!tool) throw new Error("Inbox list tool was not registered");

  const registry = shell.getInboxRegistry();
  const followUps = new InboxFollowUpRegistry();
  followUps.finalize();
  return {
    service: new InboxOperatorService(
      registry,
      new InboxDataSource(registry),
      followUps,
    ),
    tool,
  };
}

async function listToolNames(
  mcpService: MCPService,
  permission: "admin" | "trusted",
): Promise<string[]> {
  const client = new Client({ name: "inbox-tool-test", version: "1.0.0" });
  const mcpServer = mcpService.createMcpServer(permission);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    return tools.tools.map((entry) => entry.name);
  } finally {
    await client.close();
    await mcpServer.close();
  }
}

const adminContext = {
  userPermissionLevel: "admin" as const,
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "admin-user" },
};

const attentionItems = [
  item("high", "high", "2026-08-05T10:00:00.000Z"),
  item("normal", "normal", "2026-08-05T09:00:00.000Z"),
];

describe("inbox_list tool", () => {
  it("returns a bounded content-safe field allowlist for Admin callers", async () => {
    const { tool } = await createToolFixture(attentionItems);
    const result = inboxListToolOutputSchema.parse(
      await tool.handler(
        {
          sourceId: "mail-items",
          urgency: "high",
          facets: { category: "work" },
          limit: 1,
        },
        adminContext,
      ),
    );

    expect(result).toEqual({
      success: true,
      data: {
        entries: [
          {
            source: { sourceId: "mail-items", displayName: "Email Triage" },
            item: {
              title: "Attention high",
              summary: "Safe summary high",
              contact: {
                label: "Contact high · example.com",
                personId: "person-high",
              },
              receivedAt: "2026-08-05T10:00:00.000Z",
              urgency: "high",
            },
          },
        ],
        errors: [],
        total: 1,
      },
    });
    expect(tool.name).toBe("unified-inbox_list");
    expect(tool.visibility).toBe("admin");
    expect(tool.sideEffects).toBe("none");
  });

  it("uses the same source and urgency filters as the workspace", async () => {
    const { service, tool } = await createToolFixture(attentionItems);
    const workspace = await service.workspace(
      {
        sourceId: "mail-items",
        urgency: "normal",
        "facet.category": "opportunity",
        offset: 0,
        limit: 50,
      },
      { permissionLevel: "admin" },
    );
    const result = inboxListToolOutputSchema.parse(
      await tool.handler(
        {
          sourceId: "mail-items",
          urgency: "normal",
          facets: { category: "opportunity" },
          limit: 50,
        },
        adminContext,
      ),
    );

    if (!result.success) throw new Error(result.error);
    expect(result.data.entries).toEqual(
      workspace.entries.map(({ source, item: workspaceItem }) => ({
        source,
        item: {
          title: workspaceItem.title,
          ...(workspaceItem.summary ? { summary: workspaceItem.summary } : {}),
          ...(workspaceItem.contact ? { contact: workspaceItem.contact } : {}),
          receivedAt: workspaceItem.receivedAt,
          urgency: workspaceItem.urgency,
        },
      })),
    );
  });

  it("rejects source-scoped facets without a selected source", async () => {
    const { tool } = await createToolFixture(attentionItems);

    expect(
      await tool.handler({ facets: { category: "work" } }, adminContext),
    ).toEqual({
      success: false,
      error: "Invalid unified inbox filters",
    });
  });

  it("returns an empty result when no source is registered", async () => {
    const { tool } = await createToolFixture();

    expect(await tool.handler({}, adminContext)).toEqual({
      success: true,
      data: { entries: [], errors: [], total: 0 },
    });
  });

  it("omits source locators, actions, bodies, addresses, and hashes", async () => {
    const { tool } = await createToolFixture([
      {
        id: "sender-hash-8ab1",
        title: "Safe routing title",
        summary: "Safe routing summary",
        threadOrdinal: 7,
        receivedAt: "2026-08-05T10:00:00.000Z",
        urgency: "high",
        entityRef: {
          entityType: "mail-item",
          entityId: "sender@example.com",
        },
        followUps: [
          {
            kind: "draft-reply",
            context: { mailItemId: "private-follow-up-context" },
          },
        ],
        actions: [
          {
            id: "dismiss",
            label: "Source body: private transport content",
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(await tool.handler({}, adminContext));

    expect(serialized).not.toContain("sender-hash-8ab1");
    expect(serialized).not.toContain("sender@example.com");
    expect(serialized).not.toContain("private transport content");
    expect(serialized).not.toContain("private-follow-up-context");
    expect(serialized).not.toContain("entityRef");
    expect(serialized).not.toContain("actions");
    expect(serialized).not.toContain("threadOrdinal");
  });

  // The hand-written tool answered a non-Admin caller with a refusal. The
  // declaration states the permission instead, and the host never offers the
  // tool to that caller — so the refusal it used to return is a message
  // nobody is in a position to receive.
  it("is not offered to non-Admin callers, and reads no source", async () => {
    let reads = 0;
    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    shell.getInboxRegistry().registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => {
        reads += 1;
        return attentionItems;
      },
      act: async () => undefined,
    });
    const plugin = createUnifiedInboxPlugin();
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const mcpService = MCPService.createFresh(
      shell.getMessageBus(),
      shell.getLogger(),
    );
    mcpService.setProtocolMode("basic");
    for (const registered of capabilities.tools) {
      mcpService.registerTool(plugin.id, registered);
    }

    // Both halves, so the absence below is evidence of the permission and
    // not of an empty server.
    expect(await listToolNames(mcpService, "admin")).toContain(
      "unified-inbox_list",
    );
    expect(await listToolNames(mcpService, "trusted")).not.toContain(
      "unified-inbox_list",
    );
    expect(reads).toBe(0);
  });
});
