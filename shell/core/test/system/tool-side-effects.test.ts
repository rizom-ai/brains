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

function servicesWithMessages(messages: Message[]) {
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
      content: "Stored assistant answer.",
      confirmed: true,
    });
    expect(confirmation.args).not.toHaveProperty("from");

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
      content: "First answer.",
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

  it("normalizes placeholder message ids and uses stored content instead of prompt", async () => {
    const services = servicesWithMessages([
      message("assistant-1", "assistant", "Stored summary to save."),
    ]);
    const tool = createEntityCreateTool(services);

    const initial = await tool.handler(
      {
        entityType: "note",
        title: "Saved summary",
        prompt: "Save the previous summary as a note.",
        from: { kind: "conversation-message", messageId: ":latest" },
      },
      toolContext,
    );

    const confirmation = expectConfirmation(initial);
    expect(confirmation.summary).toBe('Create "Saved summary"?');
    expect(confirmation.args).toMatchObject({
      entityType: "note",
      title: "Saved summary",
      content: "Stored summary to save.",
      confirmed: true,
    });
    expect(confirmation.args).not.toHaveProperty("prompt");
    expect(confirmation.args).not.toHaveProperty("from");
  });

  it("uses stored message content instead of model-supplied content and freezes it for confirmation", async () => {
    const messages = [
      message("assistant-1", "assistant", "Original stored answer."),
    ];
    const services = servicesWithMessages(messages);
    const tool = createEntityCreateTool(services);

    const initial = await tool.handler(
      {
        entityType: "note",
        title: "Frozen answer",
        content: "Model supplied paraphrase.",
        from: { kind: "conversation-message" },
      },
      toolContext,
    );
    const confirmation = expectConfirmation(initial);
    expect(confirmation.args).toMatchObject({
      content: "Original stored answer.",
    });
    expect(confirmation.args).not.toHaveProperty("from");

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
