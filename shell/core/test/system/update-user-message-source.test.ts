import { describe, expect, test } from "bun:test";
import { expectConfirmationArgs } from "@brains/mcp-service/test";
import type { ToolContext } from "@brains/mcp-service";
import type { Message } from "@brains/conversation-service";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createEntityUpdateTool } from "../../src/system/entity-update-tool";
import { createMockSystemServices } from "./mock-services";

const context: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "owner" },
  conversationId: "conversation-owned",
  userPermissionLevel: "admin",
};
const frontmatter = "---\ntitle: Working plan\nvisibility: restricted\n---\n";
const confirmationSchema = z.record(z.string(), z.unknown());
const source = {
  kind: "user-message",
  boundaryMode: "lines",
  startAfter: "BEGIN EXACT CONTENT",
  endBefore: "END EXACT CONTENT",
};

function message(content: string, id = "user-source"): Message {
  return {
    id,
    conversationId: "conversation-owned",
    role: "user",
    content,
    timestamp: new Date(0).toISOString(),
    metadata: null,
  };
}

function fixture(messages: Message[]): {
  services: ReturnType<typeof createMockSystemServices>;
  tool: ReturnType<typeof createEntityUpdateTool>;
} {
  const services = createMockSystemServices({
    conversationService: {
      getMessages: async (id) =>
        messages.filter((entry) => entry.conversationId === id),
    },
  });
  services.addEntities([
    {
      id: "working-plan",
      entityType: "note",
      content: `${frontmatter}# Working plan\n\nOld body.\n`,
      contentHash: "hash-working-plan",
      visibility: "restricted",
      metadata: { title: "Working plan" },
      created: "2026-10-01T00:00:00.000Z",
      updated: "2026-10-01T00:00:00.000Z",
    },
  ]);
  return { services, tool: createEntityUpdateTool(services) };
}

function pasted(body: string): string {
  return `Replace note 'working-plan' with:\nBEGIN EXACT CONTENT\n${body}END EXACT CONTENT`;
}

function input(): Record<string, unknown> {
  return { entityType: "note", id: "working-plan", source };
}

describe("system_update user-message source", () => {
  test("describes source as the path for user-supplied rewrites", () => {
    const { tool } = fixture([]);
    expect(tool.description).toContain(
      "For a large rewrite whose text the user supplied, use source with exact user-message boundaries instead of copying it into content.",
    );
    expect(tool.description).toContain(
      "Use only one of fields, content, edits, or source.",
    );
  });

  test("replaces the body verbatim through a compact, pinned approval", async () => {
    const block =
      "**Markdown** `C:\\notes\\draft.md` regex `\\d+` math $\\alpha$ literal $& 🌱\n";
    const body = `# Working plan\n\n${block.repeat(250)}`;
    const messages = [message(pasted(body))];
    const { services, tool } = fixture(messages);

    const pending = await tool.handler(input(), context);
    expect("preview" in pending ? pending.preview : undefined).toContain(
      "+ **Markdown**",
    );
    const args = confirmationSchema.parse(expectConfirmationArgs(pending));
    expect(args).toMatchObject({
      entityType: "note",
      id: "working-plan",
      contentHash: "hash-working-plan",
      source: {
        ...source,
        messageId: "user-source",
        contentHash: computeContentHash(body),
      },
    });
    expect(args).not.toHaveProperty("content");
    expect(JSON.stringify(args).length).toBeLessThan(1000);
    expect(services.getLastUpdateRequest()).toBeUndefined();

    // An intervening turn must not redirect an approval to the latest text.
    messages.push(message("Yes, apply it.", "later-user"));
    expect(await tool.handler(args, context)).toMatchObject({ success: true });
    const updated = services.getLastUpdateRequest()?.entity;
    expect(updated?.content).toBe(`${frontmatter}${body}`);
    expect(updated?.visibility).toBe("restricted");
  });

  test("replaces the whole document when the selected text has frontmatter", async () => {
    const document = "---\ntitle: Renamed plan\n---\n# Renamed plan\n";
    const { services, tool } = fixture([message(pasted(document))]);
    const args = expectConfirmationArgs(await tool.handler(input(), context));
    expect(await tool.handler(args, context)).toMatchObject({ success: true });
    expect(services.getLastUpdateRequest()?.entity.content).toBe(document);
  });

  test("replays the stored source when a confirmation omits the operation", async () => {
    const { services, tool } = fixture([message(pasted("New body.\n"))]);
    const args = confirmationSchema.parse(
      expectConfirmationArgs(await tool.handler(input(), context)),
    );
    expect(
      await tool.handler(
        {
          entityType: "note",
          id: "working-plan",
          confirmed: true,
          confirmationToken: args["confirmationToken"],
        },
        context,
      ),
    ).toMatchObject({ success: true });
    expect(services.getLastUpdateRequest()?.entity.content).toBe(
      `${frontmatter}New body.\n`,
    );
  });

  test("fails rather than writing other text when the source message changed", async () => {
    const messages = [message(pasted("Approved body.\n"))];
    const { services, tool } = fixture(messages);
    const args = expectConfirmationArgs(await tool.handler(input(), context));
    messages[0] = message(pasted("Edited after approval.\n"));

    expect(await tool.handler(args, context)).toEqual({
      success: false,
      error:
        "User-message source changed after the proposal. Request the change again and confirm the new approval.",
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  test("rejects ambiguous boundaries without proposing an update", async () => {
    const { services, tool } = fixture([
      message(`${pasted("Body.\n")}\nEND EXACT CONTENT`),
    ]);
    expect(await tool.handler(input(), context)).toMatchObject({
      success: false,
      error: expect.stringContaining("must each occur exactly once"),
    });
    expect(services.getLastUpdateRequest()).toBeUndefined();
  });

  test.each([
    { content: "Model text" },
    { edits: [{ oldText: "Old body.", newText: "New body." }] },
    { fields: { title: "Renamed" } },
  ])("rejects combining source with %j", async (operation) => {
    const { tool } = fixture([message(pasted("Body.\n"))]);
    expect(await tool.handler({ ...input(), ...operation }, context)).toEqual({
      success: false,
      error: "Provide only one of 'fields', 'content', 'edits', or 'source'.",
    });
  });
});
