import { describe, expect, test } from "bun:test";
import {
  expectConfirmationArgs,
  expectToolError,
} from "@brains/mcp-service/test";
import type { ToolContext } from "@brains/mcp-service";
import type { Message } from "@brains/conversation-service";
import type {
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import { createEntityCreateTool } from "../../src/system/entity-create-tool";
import { createMockSystemServices } from "./mock-services";
import { PendingCreateTexts } from "../../src/system/pending-create-text";

const context: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "owner" },
  conversationId: "conversation-owned",
  userPermissionLevel: "admin",
};

const prefix = "Save this as a project.\n\n";
const pasted =
  '# River Atlas\n\nWe mapped the river by canoe, one bend a week.\n\nThe town\'s map is "ours" now.';

function message(content: string, id: string): Message {
  return {
    id,
    conversationId: "conversation-owned",
    role: "user",
    content,
    timestamp: new Date(0).toISOString(),
    metadata: null,
  };
}

/**
 * A project type that asks for its year once, the way the portfolio plugin
 * does, and records the text it is finally given.
 */
function fixture(question: "fields" | "slide-breaks" = "fields"): {
  messages: Message[];
  saved: string[];
  tool: ReturnType<typeof createEntityCreateTool>;
} {
  const messages = [message(`${prefix}${pasted}`, "pasted")];
  const saved: string[] = [];
  const services = createMockSystemServices({
    conversationService: {
      getMessages: async (id) =>
        messages.filter((entry) => entry.conversationId === id),
    },
  });
  services.registerEntityTypes(["project", "note"]);
  services.entityRegistry.registerCreateInterceptor(
    "project",
    async (input: CreateInput): Promise<CreateInterceptionResult> => {
      if (input.fields?.["year"] === undefined) {
        return {
          kind: "handled",
          result: {
            success: false,
            error: "Which year did this project begin?",
            question,
          },
        };
      }
      saved.push(input.content ?? "");
      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId: "river-atlas", status: "created" },
        },
      };
    },
  );
  return { messages, saved, tool: createEntityCreateTool(services) };
}

async function confirm(
  tool: ReturnType<typeof createEntityCreateTool>,
  input: Record<string, unknown>,
): Promise<unknown> {
  const args = expectConfirmationArgs(await tool.handler(input, context));
  return tool.handler(args, context);
}

/** The first save: confirmed, then refused with the question. */
async function askedOnce(setup: ReturnType<typeof fixture>): Promise<string> {
  const result = await confirm(setup.tool, {
    entityType: "project",
    source: { kind: "user-message", startAfter: prefix },
  });
  setup.messages.push(message("It began in 2019.", "answer"));
  return expectToolError(result).error;
}

describe("system_create after the type asked a question", () => {
  test("tells the model the source to save again with", async () => {
    const setup = fixture();
    const error = await askedOnce(setup);
    expect(error).toContain("Which year did this project begin?");
    expect(error).toContain('"messageId":"pasted"');
  });

  test("saves the original bytes when the model resends the text itself", async () => {
    const setup = fixture();
    await askedOnce(setup);

    const retyped = pasted.replace('"ours"', "“ours”").trimEnd() + "\n";
    const pending = await setup.tool.handler(
      {
        entityType: "project",
        title: "River Atlas",
        source: { kind: "text", content: retyped },
        fields: { year: 2019 },
      },
      context,
    );
    expect(expectConfirmationArgs(pending)).toMatchObject({
      source: { kind: "user-message", messageId: "pasted" },
      fields: { year: 2019 },
    });
    await setup.tool.handler(expectConfirmationArgs(pending), context);
    expect(setup.saved).toEqual([pasted]);
  });

  test("saves the original text when the model points at the latest message, the user's answer", async () => {
    const setup = fixture();
    await askedOnce(setup);

    await confirm(setup.tool, {
      entityType: "project",
      title: "River Atlas",
      source: { kind: "user-message" },
      fields: { year: 2019 },
    });
    expect(setup.saved).toEqual([pasted]);
  });

  test("saves the original text when the model's boundaries only fit the original message", async () => {
    const setup = fixture();
    await askedOnce(setup);

    await confirm(setup.tool, {
      entityType: "project",
      title: "River Atlas",
      source: { kind: "user-message", startAfter: prefix },
      fields: { year: 2019 },
    });
    expect(setup.saved).toEqual([pasted]);
  });

  test("keeps a resend that only adds slide separators after a slide-break question", async () => {
    const setup = fixture("slide-breaks");
    await askedOnce(setup);

    const withSlides = pasted.replace(
      "\n\nThe town's",
      "\n\n---\n\nThe town's",
    );
    await confirm(setup.tool, {
      entityType: "project",
      source: { kind: "text", content: withSlides },
      fields: { year: 2019 },
    });
    expect(setup.saved).toEqual([withSlides]);
  });

  test("saves new text the user pastes in reply as pasted", async () => {
    const setup = fixture();
    await askedOnce(setup);
    const replacement =
      "# River Atlas, second edition\n\nWe mapped the river again in 2021, this time with the whole town and three schools.";
    setup.messages.push(message(replacement, "replacement"));

    await confirm(setup.tool, {
      entityType: "project",
      source: { kind: "user-message" },
      fields: { year: 2021 },
    });
    expect(setup.saved).toEqual([replacement]);
  });

  test("leaves creates of other types alone", async () => {
    const setup = fixture();
    await askedOnce(setup);
    const pending = await setup.tool.handler(
      {
        entityType: "note",
        title: "Aside",
        source: { kind: "text", content: "A note of my own." },
      },
      context,
    );
    expect(expectConfirmationArgs(pending)).toMatchObject({
      source: { kind: "text", content: "A note of my own." },
    });
  });

  test("forgets the original once it is saved", async () => {
    const setup = fixture();
    await askedOnce(setup);
    await confirm(setup.tool, {
      entityType: "project",
      source: { kind: "user-message", messageId: "pasted", startAfter: prefix },
      fields: { year: 2019 },
    });
    const pending = await setup.tool.handler(
      {
        entityType: "project",
        title: "Another",
        source: { kind: "text", content: "# Another\n\nShort." },
        fields: { year: 2020 },
      },
      context,
    );
    expect(expectConfirmationArgs(pending)).toMatchObject({
      source: { kind: "text", content: "# Another\n\nShort." },
    });
  });
});

describe("PendingCreateTexts", () => {
  test("forgets a pinned text after half an hour", () => {
    let now = 0;
    const pending = new PendingCreateTexts(() => now);
    const source = { kind: "text" as const, content: pasted };
    pending.pin("conversation\u0000project", {
      source,
      content: pasted,
      question: "fields",
    });
    const retry = {
      source: { kind: "text" as const, content: "retyped" },
      content: "retyped",
      resolvedMessageId: undefined,
    };
    expect(pending.resolve("conversation\u0000project", retry)).toEqual({
      kind: "pinned",
      source,
      content: pasted,
    });
    now = 31 * 60 * 1000;
    expect(pending.resolve("conversation\u0000project", retry)).toEqual({
      kind: "as-given",
    });
  });
});
