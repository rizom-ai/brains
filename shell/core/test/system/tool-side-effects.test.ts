import { describe, expect, it } from "bun:test";
import type { Message } from "@brains/conversation-service";
import type { ToolContext, ToolResponse } from "@brains/mcp-service";
import { createEntityCreateTool } from "../../src/system/entity-create-tool";
import { createEntityDeleteTool } from "../../src/system/entity-delete-tool";
import { createEntityReadTools } from "../../src/system/entity-read-tools";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";

const now = "2026-06-24T00:00:00.000Z";
const toolContext: ToolContext = {
  interfaceType: "web-chat",
  userId: "agent-user",
  conversationId: "conversation-1",
  userPermissionLevel: "anchor",
};

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  metadata: unknown = null,
  conversationId = "conversation-1",
): Message {
  return {
    id,
    conversationId,
    role,
    content,
    metadata:
      metadata === null
        ? null
        : typeof metadata === "string"
          ? metadata
          : JSON.stringify(metadata),
    timestamp: now,
  };
}

function servicesWithMessages(
  messages: Message[],
): ReturnType<typeof createMockSystemServices> {
  const services = createMockSystemServices({
    conversationService: {
      getMessages: async (conversationId: string) =>
        messages.filter((item) => item.conversationId === conversationId),
    } as never,
  });
  services.addEntities([
    {
      id: "existing-note",
      entityType: "note",
      content: "Existing note",
      contentHash: "",
      metadata: { title: "Existing note" },
      created: now,
      updated: now,
    },
  ]);
  return services;
}

function expectConfirmation(
  response: ToolResponse,
): Extract<ToolResponse, { needsConfirmation: true }> {
  if (!("needsConfirmation" in response)) {
    throw new Error(`Expected confirmation, got ${JSON.stringify(response)}`);
  }
  return response;
}

describe("system tool side-effect metadata", () => {
  it("marks entity read tools as side-effect free", () => {
    const tools = createEntityReadTools(createMockSystemServices());

    expect(
      Object.fromEntries(tools.map((tool) => [tool.name, tool.sideEffects])),
    ).toMatchObject({
      system_get: "none",
      system_list: "none",
      system_search: "none",
    });
  });

  it("marks entity mutation tools as writes", () => {
    const services = createMockSystemServices();
    const tools = [
      createEntityCreateTool(services),
      createEntityUpdateTool(services),
      createEntityDeleteTool(services),
    ];

    expect(
      Object.fromEntries(tools.map((tool) => [tool.name, tool.sideEffects])),
    ).toMatchObject({
      system_create: "writes",
      system_update: "writes",
      system_delete: "writes",
    });
  });
});

describe("system_create conversation-message sources", () => {
  it("defaults to the latest savable assistant message and skips internal/non-savable turns", async () => {
    const services = servicesWithMessages([
      message("assistant-1", "assistant", "Stored assistant answer."),
      message("approval", "assistant", "Confirmation required.", {
        cards: [{ kind: "tool-approval" }],
      }),
      message("upload-intent", "assistant", "I got `brief.pdf`.", {
        cards: [{ kind: "actions", id: "actions:upload-intent" }],
      }),
      message("entity-memory", "assistant", "Updated the note.", {
        entityMemoryRefs: [{ entityId: "note-1" }],
      }),
      message("user-1", "user", "save that"),
    ]);
    const tool = createEntityCreateTool(services);

    const initial = await tool.handler(
      {
        entityType: "note",
        title: "Saved answer",
        from: { kind: "conversation-message" },
      },
      toolContext,
    );

    const confirmation = expectConfirmation(initial);
    expect(confirmation.preview).toContain(
      "Content preview: Stored assistant answer.",
    );
    expect(confirmation.args).toMatchObject({
      entityType: "note",
      title: "Saved answer",
      source: { kind: "text", content: "Stored assistant answer." },
      confirmed: true,
    });
    expect(confirmation.args).not.toHaveProperty("from");
    expect(confirmation.args).not.toHaveProperty("content");

    const confirmed = await tool.handler(confirmation.args, toolContext);
    expect(confirmed).toMatchObject({ success: true });
    expect(services.getEntities().get("saved-answer")?.content).toBe(
      "Stored assistant answer.",
    );
  });

  it("resolves an explicit message id from the current conversation", async () => {
    const services = servicesWithMessages([
      message("assistant-1", "assistant", "First answer."),
      message("assistant-2", "assistant", "Second answer."),
    ]);
    const tool = createEntityCreateTool(services);

    const initial = await tool.handler(
      {
        entityType: "note",
        title: "First answer note",
        from: { kind: "conversation-message", messageId: "assistant-1" },
      },
      toolContext,
    );

    expect(expectConfirmation(initial).args).toMatchObject({
      source: { kind: "text", content: "First answer." },
    });
  });

  it("rejects unknown or foreign conversation message ids", async () => {
    const services = servicesWithMessages([
      message(
        "foreign-message",
        "assistant",
        "Wrong conversation.",
        null,
        "conversation-2",
      ),
    ]);
    const tool = createEntityCreateTool(services);

    const response = await tool.handler(
      {
        entityType: "note",
        title: "Nope",
        from: { kind: "conversation-message", messageId: "foreign-message" },
      },
      toolContext,
    );

    expect(response).toEqual({
      success: false,
      error:
        "Conversation message is not accessible in this conversation or does not exist.",
    });
  });

  it("normalizes placeholder message ids and uses latest savable stored content", async () => {
    const placeholderIds = [":latest", "auto", "/messages/auto"];

    for (const messageId of placeholderIds) {
      const services = servicesWithMessages([
        message("assistant-1", "assistant", "Stored summary to save."),
      ]);
      const tool = createEntityCreateTool(services);

      const initial = await tool.handler(
        {
          entityType: "note",
          title: "Saved summary",
          from: { kind: "conversation-message", messageId },
        },
        toolContext,
      );

      const confirmation = expectConfirmation(initial);
      expect(confirmation.summary).toBe('Create "Saved summary"?');
      expect(confirmation.args).toMatchObject({
        entityType: "note",
        title: "Saved summary",
        source: { kind: "text", content: "Stored summary to save." },
        confirmed: true,
      });
      expect(confirmation.args).not.toHaveProperty("from");
      expect(confirmation.args).not.toHaveProperty("content");
    }
  });

  it("rejects conversation-message refs combined with any other source", async () => {
    const cases: Array<Record<string, unknown>> = [
      { content: "Model supplied paraphrase." },
      { prompt: "Save the previous summary as a note." },
      { url: "https://example.com/source" },
      { upload: { kind: "upload", id: "upload-1" } },
      {
        sourceAttachment: {
          sourceEntityType: "post",
          sourceEntityId: "missing-post",
          attachmentType: "printable",
        },
      },
    ];

    for (const source of cases) {
      const services = servicesWithMessages([
        message("assistant-1", "assistant", "Stored summary to save."),
      ]);
      const tool = createEntityCreateTool(services);

      const response = await tool.handler(
        {
          entityType: "note",
          title: "Ambiguous source",
          from: { kind: "conversation-message" },
          ...source,
        },
        toolContext,
      );

      expect(response).toMatchObject({ success: false });
      expect((response as { error: string }).error).toContain(
        "conversation-message source cannot be combined",
      );
    }
  });

  it("resolves canonical prior-response source refs", async () => {
    const services = servicesWithMessages([
      message("assistant-1", "assistant", "Stored preferred source answer."),
    ]);
    const tool = createEntityCreateTool(services);

    const response = await tool.handler(
      {
        entityType: "note",
        title: "Preferred prior response",
        source: { kind: "prior-response" },
      },
      toolContext,
    );

    const confirmation = expectConfirmation(response);
    expect(confirmation.args).toMatchObject({
      entityType: "note",
      title: "Preferred prior response",
      source: { kind: "text", content: "Stored preferred source answer." },
      confirmed: true,
    });
    expect(confirmation.args).not.toHaveProperty("from");
    expect(confirmation.args).not.toHaveProperty("content");
  });

  it("rejects canonical source combined with transitional flat source fields", async () => {
    const services = servicesWithMessages([
      message("assistant-1", "assistant", "Stored answer."),
    ]);
    const tool = createEntityCreateTool(services);

    const response = await tool.handler(
      {
        entityType: "note",
        title: "Ambiguous source",
        source: { kind: "prior-response" },
        content: "Conflicting content.",
      },
      toolContext,
    );

    expect(response).toMatchObject({ success: false });
    expect((response as { error: string }).error).toContain(
      "source cannot be combined with transitional flat source fields",
    );
  });

  it("does not inspect conversation messages for direct content creates", async () => {
    let getMessagesCalls = 0;
    const services = createMockSystemServices({
      conversationService: {
        getMessages: async () => {
          getMessagesCalls += 1;
          return [];
        },
      } as never,
    });
    services.addEntities([
      {
        id: "existing-note",
        entityType: "note",
        content: "Existing note",
        contentHash: "",
        metadata: { title: "Existing note" },
        created: now,
        updated: now,
      },
    ]);
    const tool = createEntityCreateTool(services);

    const response = await tool.handler(
      {
        entityType: "note",
        title: "Direct note",
        content: "Direct current-user text.",
      },
      toolContext,
    );

    expect(response).toMatchObject({ needsConfirmation: true });
    expect(getMessagesCalls).toBe(0);
  });

  it("freezes stored message content for confirmation", async () => {
    const messages = [
      message("assistant-1", "assistant", "Original stored answer."),
    ];
    const services = servicesWithMessages(messages);
    const tool = createEntityCreateTool(services);

    const initial = await tool.handler(
      {
        entityType: "note",
        title: "Frozen answer",
        from: { kind: "conversation-message" },
      },
      toolContext,
    );
    const confirmation = expectConfirmation(initial);
    expect(confirmation.args).toMatchObject({
      source: { kind: "text", content: "Original stored answer." },
    });
    expect(confirmation.args).not.toHaveProperty("from");
    expect(confirmation.args).not.toHaveProperty("content");

    messages.push(
      message("assistant-2", "assistant", "Newer drifting answer."),
    );
    const confirmed = await tool.handler(confirmation.args, toolContext);

    expect(confirmed).toMatchObject({ success: true });
    expect(services.getEntities().get("frozen-answer")?.content).toBe(
      "Original stored answer.",
    );
  });
});
