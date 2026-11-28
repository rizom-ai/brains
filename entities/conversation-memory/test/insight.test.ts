import { beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/plugins";
import { insightSchema, type InsightEntity } from "../src";
import { installConversationMemory } from "./conversation-memory-plugins";

const inChannel: CreateExecutionContext = {
  interfaceType: "discord",
  actor: { kind: "user", userId: "usr_mira" },
  userPermissionLevel: "trusted",
  conversationId: "discord-guild-general",
  channelId: "discord:guild:general",
  channelName: "general",
};

// What a conversation learned or concluded: a claim with its source, as a
// decision is, and neither a task nor a decision.
describe("an insight", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  async function insights(): Promise<InsightEntity[]> {
    return harness.getEntityService().listEntities(
      {
        entityType: "insight",
        options: { filter: { visibilityScope: "restricted" } },
      },
      insightSchema,
    );
  }

  async function create(
    input: Omit<CreateInput, "entityType">,
  ): Promise<CreateInterceptionResult | undefined> {
    return harness.getEntityRegistry().getCreateInterceptor("insight")?.(
      { entityType: "insight", ...input },
      inChannel,
    );
  }

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-insight" });
    await installConversationMemory(harness);
  });

  it("is stored with its conversation, who stated it and whether it still holds", async () => {
    const metadata = {
      conversationId: "discord-1466",
      channelId: "1466",
      channelName: "executive-room",
      interfaceType: "discord",
      timeRange: {
        start: "2026-10-23T09:03:00.000Z",
        end: "2026-10-23T09:03:00.000Z",
      },
      status: "superseded" as const,
      supersededBy: "discord-1466-insight-9-1",
      statedBy: [
        {
          identity: { kind: "user" as const, userId: "usr_jo" },
          displayName: "Jo",
        },
      ],
      mentionedBy: [
        {
          identity: { kind: "user" as const, userId: "usr_niels" },
          displayName: "Niels",
        },
      ],
    };
    await harness.getEntityService().createEntity({
      entity: {
        id: "discord-1466-insight-3-1",
        entityType: "insight",
        visibility: "shared",
        content:
          "# Freelancers abandon the form at the company field\n\nIt asks for a company name they do not have.",
        metadata,
      },
    });

    const [stored] = await insights();
    expect(stored?.metadata).toEqual(metadata);
    expect(stored?.content).toContain(
      "# Freelancers abandon the form at the company field",
    );
  });

  it("recorded by hand is active, from the conversation it was said in, at the visibility asked for", async () => {
    const result = await create({
      title: "Freelancers abandon the form at the company field",
      content: "It asks for a company name they do not have.",
      visibility: "shared",
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "created" } },
    });
    const [stored] = await insights();
    expect(stored?.visibility).toBe("shared");
    expect(stored?.metadata).toEqual({
      conversationId: "discord-guild-general",
      channelId: "discord:guild:general",
      channelName: "general",
      interfaceType: "discord",
      status: "active",
    });
  });

  it.each([undefined, "public"] as const)(
    "recorded by hand is refused at %p visibility",
    async (visibility) => {
      const result = await create({
        title: "Freelancers abandon the form at the company field",
        content: "It asks for a company name they do not have.",
        ...(visibility && { visibility }),
      });

      expect(result).toMatchObject({
        kind: "handled",
        result: { success: false, error: expect.stringContaining("insight") },
      });
      expect(await insights()).toHaveLength(0);
    },
  );
});
