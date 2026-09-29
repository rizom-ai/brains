import { describe, expect, test } from "bun:test";
import { expectConfirmationArgs } from "@brains/mcp-service/test";
import type { ToolContext } from "@brains/mcp-service";
import type { Message } from "@brains/conversation-service";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createEntityCreateTool } from "../../src/system/entity-create-tool";
import { createMockSystemServices } from "./mock-services";

const context: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "owner" },
  conversationId: "conversation-owned",
  userPermissionLevel: "admin",
};
const startAfter = "BEGIN EXACT CONTENT\n";
const endBefore = "\nEND EXACT CONTENT";
const confirmationSchema = z.record(z.string(), z.unknown());

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
  tool: ReturnType<typeof createEntityCreateTool>;
} {
  const services = createMockSystemServices({
    conversationService: {
      getMessages: async (id) =>
        messages.filter((entry) => entry.conversationId === id),
    },
  });
  services.registerEntityTypes(["note"]);
  return { services, tool: createEntityCreateTool(services) };
}

function input(): Record<string, unknown> {
  return {
    entityType: "note",
    title: "Verbatim source",
    visibility: "restricted",
    source: { kind: "user-message", startAfter, endBefore },
  };
}

describe("system_create user-message source", () => {
  test.each([7_000, 17_000])(
    "preserves all %i characters through a compact, pinned approval",
    async (size) => {
      const block =
        "**Markdown** `C:\\notes\\draft.md` regex `\\d+` math $\\alpha$ literal $& 🌱\r\n";
      const content = " \n" + block.repeat(400).slice(0, size - 4) + "\n ";
      expect(content.length).toBe(size);
      const messages = [
        message(`Save a private note.\n${startAfter}${content}${endBefore}`),
      ];
      const { services, tool } = fixture(messages);
      const pending = await tool.handler(input(), context);
      const args = confirmationSchema.parse(expectConfirmationArgs(pending));
      expect(args).toMatchObject({
        visibility: "restricted",
        source: {
          kind: "user-message",
          messageId: "user-source",
          startAfter,
          endBefore,
          contentHash: computeContentHash(content),
        },
      });
      expect(JSON.stringify(args).length).toBeLessThan(1000);
      expect(services.getEntities().size).toBe(0);

      // An intervening turn must not redirect an approval to the latest text.
      messages.push(message("Yes, save it.", "later-user"));
      const result = await tool.handler(args, context);
      expect(result).toMatchObject({ success: true });
      const stored = services.getEntities().get("verbatim-source");
      expect(stored?.content).toBe(content);
      expect(stored?.visibility).toBe("restricted");
      expect(stored?.metadata["title"]).toBe("Verbatim source");
    },
  );

  test.each(["\n", "\r\n"])(
    "preserves boundary-adjacent whitespace and final newlines with line delimiters (%j)",
    async (newline) => {
      const content = `${newline}  exact \\text $&${newline}Mention END inline.${newline}${newline}`;
      const { services, tool } = fixture([
        message(
          `Save between BEGIN and END.${newline}BEGIN${newline}${content}END`,
        ),
      ]);
      const source = {
        kind: "user-message",
        boundaryMode: "lines",
        startAfter: "BEGIN",
        endBefore: "END",
      };
      const args = expectConfirmationArgs(
        await tool.handler({ ...input(), source }, context),
      );
      expect(args).toMatchObject({
        source: { ...source, contentHash: computeContentHash(content) },
      });
      expect(await tool.handler(args, context)).toMatchObject({
        success: true,
      });
      expect(services.getEntities().get("verbatim-source")?.content).toBe(
        content,
      );
    },
  );

  test.each([
    { label: "partial opening line", text: "prefix BEGIN\nbody\nEND" },
    { label: "partial closing line", text: "BEGIN\nbody\nEND suffix" },
    { label: "duplicate opening line", text: "BEGIN\nBEGIN\nbody\nEND" },
    { label: "duplicate closing line", text: "BEGIN\nbody\nEND\nEND" },
    { label: "reversed lines", text: "END\nbody\nBEGIN" },
    { label: "empty line-delimited source", text: "BEGIN\nEND" },
  ])("rejects $label in line boundary mode", async ({ text }) => {
    const { services, tool } = fixture([message(text)]);
    expect(
      await tool.handler(
        {
          ...input(),
          source: {
            kind: "user-message",
            boundaryMode: "lines",
            startAfter: "BEGIN",
            endBefore: "END",
          },
        },
        context,
      ),
    ).toMatchObject({ success: false });
    expect(services.getEntities().size).toBe(0);
  });

  test("rejects newline characters in line marker arguments rather than consuming source newlines", async () => {
    const { services, tool } = fixture([message("BEGIN\nbody\n\nEND")]);
    for (const source of [
      {
        kind: "user-message",
        boundaryMode: "lines",
        startAfter: "BEGIN\n",
        endBefore: "END",
      },
      {
        kind: "user-message",
        boundaryMode: "lines",
        startAfter: "BEGIN",
        endBefore: "\n\nEND",
      },
    ]) {
      expect(await tool.handler({ ...input(), source }, context)).toMatchObject(
        { success: false },
      );
    }
    expect(services.getEntities().size).toBe(0);
  });

  test("supports an entire user message without trimming it", async () => {
    const content = "  exact user text\r\n\\literal $&\n";
    const { services, tool } = fixture([message(content)]);
    const pending = await tool.handler(
      { ...input(), source: { kind: "user-message" } },
      context,
    );
    const args = expectConfirmationArgs(pending);
    expect(await tool.handler(args, context)).toMatchObject({ success: true });
    expect(services.getEntities().get("verbatim-source")?.content).toBe(
      content,
    );
  });

  test("rejects a stored source changed after approval was proposed", async () => {
    const sourceMessage = message(`${startAfter}original${endBefore}`);
    const { services, tool } = fixture([sourceMessage]);
    const args = expectConfirmationArgs(await tool.handler(input(), context));
    sourceMessage.content = `${startAfter}changed${endBefore}`;
    expect(await tool.handler(args, context)).toMatchObject({
      success: false,
      error: expect.stringContaining("changed"),
    });
    expect(services.getEntities().size).toBe(0);
  });

  test("rejects boundary tampering even when replacement bytes have the same hash", async () => {
    const { services, tool } = fixture([
      message(`${startAfter}body${endBefore}\nOTHER START\nbody\nOTHER END`),
    ]);
    const args = confirmationSchema.parse(
      expectConfirmationArgs(await tool.handler(input(), context)),
    );
    const source = confirmationSchema.parse(args["source"]);
    expect(
      await tool.handler(
        {
          ...args,
          source: {
            ...source,
            startAfter: "OTHER START\n",
            endBefore: "\nOTHER END",
          },
        },
        context,
      ),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("do not match"),
    });
    expect(services.getEntities().size).toBe(0);
  });

  test.each([
    { label: "missing start", text: `body${endBefore}` },
    { label: "missing end", text: `${startAfter}body` },
    {
      label: "repeated start",
      text: `${startAfter}one${startAfter}two${endBefore}`,
    },
    {
      label: "repeated end",
      text: `${startAfter}body${endBefore}${endBefore}`,
    },
    { label: "reversed boundaries", text: `${endBefore}body${startAfter}` },
    { label: "empty range", text: `${startAfter}${endBefore}` },
  ])("rejects $label without proposing or writing", async ({ text }) => {
    const { services, tool } = fixture([message(text)]);
    expect(await tool.handler(input(), context)).toMatchObject({
      success: false,
    });
    expect(services.getEntities().size).toBe(0);
  });

  test("does not resolve assistant content as a user-message source", async () => {
    const entry = message(`${startAfter}assistant-only${endBefore}`);
    entry.role = "assistant";
    const { services, tool } = fixture([entry]);
    expect(await tool.handler(input(), context)).toMatchObject({
      success: false,
    });
    expect(services.getEntities().size).toBe(0);
  });

  test("does not resolve a source from another conversation", async () => {
    const entry = message(`${startAfter}private${endBefore}`);
    entry.conversationId = "another-conversation";
    const { services, tool } = fixture([entry]);
    expect(
      await tool.handler(
        {
          ...input(),
          source: {
            kind: "user-message",
            messageId: entry.id,
            startAfter,
            endBefore,
          },
        },
        context,
      ),
    ).toMatchObject({ success: false });
    expect(services.getEntities().size).toBe(0);
  });

  test.each([
    {
      source: { kind: "user-message", startAfter: "Save this: " },
      text: "Save this: exact\n",
      expected: "exact\n",
    },
    {
      source: { kind: "user-message", endBefore: "\nSave the above." },
      text: " exact\nSave the above.",
      expected: " exact",
    },
  ])(
    "supports one-sided boundaries: $source",
    async ({ source, text, expected }) => {
      const { services, tool } = fixture([message(text)]);
      const args = expectConfirmationArgs(
        await tool.handler({ ...input(), source }, context),
      );
      expect(await tool.handler(args, context)).toMatchObject({
        success: true,
      });
      expect(services.getEntities().get("verbatim-source")?.content).toBe(
        expected,
      );
    },
  );

  test.each(["admin", null, "invalid"])(
    "does not expose %s-provenance messages to a trusted caller",
    async (level) => {
      const entry = message(`${startAfter}secret${endBefore}`);
      entry.metadata =
        level === null ? null : JSON.stringify({ userPermissionLevel: level });
      const { services, tool } = fixture([entry]);
      const result = await tool.handler(
        { ...input(), visibility: "shared" },
        { ...context, userPermissionLevel: "trusted" },
      );
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining("not accessible"),
      });
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(services.getEntities().size).toBe(0);
    },
  );

  test("allows shared creation from an accessible user message for a trusted caller", async () => {
    const entry = message(`${startAfter}team content${endBefore}`);
    entry.metadata = JSON.stringify({ userPermissionLevel: "trusted" });
    const { services, tool } = fixture([entry]);
    const trusted = { ...context, userPermissionLevel: "trusted" as const };
    const args = expectConfirmationArgs(
      await tool.handler({ ...input(), visibility: "shared" }, trusted),
    );
    expect(await tool.handler(args, trusted)).toMatchObject({ success: true });
    expect(services.getEntities().get("verbatim-source")?.content).toBe(
      "team content",
    );
    expect(services.getEntities().get("verbatim-source")?.visibility).toBe(
      "shared",
    );
  });

  test("fails closed if the pinned message expires before approval", async () => {
    const messages = [message(`${startAfter}original${endBefore}`)];
    const { services, tool } = fixture(messages);
    const args = expectConfirmationArgs(await tool.handler(input(), context));
    messages.splice(
      0,
      1,
      message(`${startAfter}replacement${endBefore}`, "replacement"),
    );
    expect(await tool.handler(args, context)).toMatchObject({ success: false });
    expect(services.getEntities().size).toBe(0);
  });

  test("requires a conversation and keeps restricted creation admin-only", async () => {
    const { services, tool } = fixture([
      message(`${startAfter}private${endBefore}`),
    ]);
    const { conversationId: _conversationId, ...withoutConversation } = context;
    expect(await tool.handler(input(), withoutConversation)).toMatchObject({
      success: false,
    });
    expect(
      await tool.handler(input(), {
        ...context,
        userPermissionLevel: "trusted",
      }),
    ).toMatchObject({ success: false });
    expect(services.getEntities().size).toBe(0);
  });
});
