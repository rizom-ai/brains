import { beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
import { decisionSchema } from "../src";
import { installConversationMemory } from "./conversation-memory-plugins";

const inChannel: CreateExecutionContext = {
  interfaceType: "discord",
  actor: { kind: "user", userId: "usr_mira" },
  userPermissionLevel: "trusted",
  conversationId: "discord-guild-general",
  channelId: "discord:guild:general",
  channelName: "general",
};

const outsideChat: CreateExecutionContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_mira" },
  userPermissionLevel: "admin",
};

// A decision recorded by hand arrives through system_create, which nothing
// but the decision's own create route can make whole.
describe("a decision recorded by hand", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  async function create(
    input: Omit<CreateInput, "entityType">,
    caller: CreateExecutionContext = inChannel,
  ): Promise<CreateInterceptionResult | undefined> {
    return harness.getEntityRegistry().getCreateInterceptor("decision")?.(
      { entityType: "decision", ...input },
      caller,
    );
  }

  async function decisions(): Promise<
    Array<ReturnType<typeof decisionSchema.parse>>
  > {
    const stored = await harness.getEntityService().listEntities({
      entityType: "decision",
      options: { filter: { visibilityScope: "restricted" } },
    });
    return stored.map((entity) => decisionSchema.parse(entity));
  }

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-decision-create" });
    await installConversationMemory(harness);
  });

  it("is stored active, under its title, at the visibility asked for", async () => {
    const result = await create({
      title: "Drop the company field",
      content: "The sign-up form no longer asks for a company name.",
      visibility: "shared",
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "created" } },
    });
    const [stored, ...rest] = await decisions();
    expect(rest).toHaveLength(0);
    expect(stored?.id).toBe("drop-the-company-field");
    expect(stored?.visibility).toBe("shared");
    expect(stored?.metadata.status).toBe("active");
    expect(stored?.content).toContain("# Drop the company field");
    expect(stored?.content).toContain(
      "The sign-up form no longer asks for a company name.",
    );
  });

  it("records the conversation and channel it was said in", async () => {
    await create({
      title: "Drop the company field",
      content: "The sign-up form no longer asks for a company name.",
      visibility: "shared",
    });

    expect((await decisions())[0]?.metadata).toMatchObject({
      conversationId: "discord-guild-general",
      interfaceType: "discord",
      channelId: "discord:guild:general",
      channelName: "general",
    });
  });

  it("has no source when it was not said in a channel", async () => {
    await create(
      {
        title: "Drop the company field",
        content: "The sign-up form no longer asks for a company name.",
        visibility: "restricted",
      },
      outsideChat,
    );

    const metadata = (await decisions())[0]?.metadata;
    expect(metadata?.status).toBe("active");
    expect(metadata?.channelId).toBeUndefined();
    expect(metadata?.interfaceType).toBeUndefined();
    expect(metadata?.conversationId).toBeUndefined();
  });

  it("takes its title from what was said when none is given", async () => {
    await create({
      prompt: "We are dropping the company field from the sign-up form",
      visibility: "shared",
    });

    const [stored] = await decisions();
    expect(stored?.content).toContain(
      "# We are dropping the company field from the sign-up form",
    );
  });

  it.each([undefined, "public"] as const)(
    "is refused at %p visibility",
    async (visibility) => {
      const result = await create({
        title: "Drop the company field",
        content: "The sign-up form no longer asks for a company name.",
        ...(visibility && { visibility }),
      });

      expect(result).toMatchObject({
        kind: "handled",
        result: { success: false },
      });
      expect(await decisions()).toHaveLength(0);
    },
  );

  it("is refused when what was said names nothing", async () => {
    const result = await create({ content: "…", visibility: "shared" });

    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
  });
});

describe("a decision's stored metadata", () => {
  it("reads without a conversation, as a decision recorded by hand has none", () => {
    expect(
      decisionSchema.shape.metadata.safeParse({ status: "active" }).success,
    ).toBe(true);
  });

  it("still reads a decision picked up from a conversation", () => {
    const metadata = {
      conversationId: "conv-1",
      channelId: "cli-terminal",
      channelName: "CLI Terminal",
      interfaceType: "cli",
      timeRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:01:00.000Z",
      },
      status: "active" as const,
    };
    expect(decisionSchema.shape.metadata.parse(metadata)).toEqual(metadata);
  });
});
