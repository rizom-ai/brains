import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { CHAT_CHANNELS, JOB_CHANNELS } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { ConversationMemoryPlugin } from "../src";
import { channelBookmarks } from "../src/lib/channel-action-items/pickup";
import { channelPickupJob } from "../src/lib/channel-action-items/trigger";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("ConversationMemoryPlugin", () => {
  let harness: PluginTestHarness<ConversationMemoryPlugin>;
  let plugin: ConversationMemoryPlugin;

  beforeEach(() => {
    harness = createPluginHarness<ConversationMemoryPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    plugin = new ConversationMemoryPlugin();
  });

  it("registers memory entity readers without an automatic producer", async () => {
    const capabilities = await harness.installPlugin(plugin);

    expect(plugin.id).toBe("conversation-memory");
    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("summary");
    expect(harness.getEntityService().getEntityTypes()).toContain("decision");
    expect(harness.getEntityService().getEntityTypes()).toContain(
      "action-item",
    );
    expect(capabilities.projectionRules).toBeUndefined();
    expect("projections" in capabilities).toBe(false);
  });

  it("retires the provenance fields decisions and action items no longer carry", async () => {
    await harness.installPlugin(plugin);
    const registry = harness.getEntityRegistry();
    const dropped = [
      "spaceId",
      "sourceSummaryId",
      "sourceMessageCount",
      "projectionVersion",
    ];

    expect(registry.getEntityTypeConfig("decision").retiredFields).toEqual(
      dropped,
    );
    // timeRange still reaches the parser, which makes its end capturedAt.
    expect(registry.getEntityTypeConfig("action-item")).toMatchObject({
      retiredFields: dropped,
      translatedFields: ["timeRange"],
    });
  });

  it("flattens stored action item and decision ids once startup content settles", async () => {
    await harness.installPlugin(plugin);
    const listSpy = spyOn(harness.getEntityService(), "listEntities");

    await harness.sendMessage(
      SYSTEM_CHANNELS.startupContentSettled,
      {},
      "shell",
      true,
    );

    const listed = listSpy.mock.calls.map((call) => call[0]);
    expect(listed).toContainEqual(
      expect.objectContaining({
        entityType: "action-item",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    );
    expect(listed).toContainEqual(
      expect.objectContaining({
        entityType: "decision",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    );
  });

  it("keeps action items out of system_create, so only a writer that sets their fields adds one", async () => {
    await harness.installPlugin(plugin);

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("action-item")
        .actionPolicy,
    ).toEqual({ create: "never" });
  });

  it("registers the channel pickup job, which a brain with no spaces never queues", async () => {
    const queue = harness.getMockShell().getJobQueueService();
    const registerHandler = mock(queue.registerHandler);
    const enqueue = mock(queue.enqueue);
    harness.getMockShell().getJobQueueService = (): typeof queue => ({
      ...queue,
      registerHandler,
      enqueue,
    });
    await harness.installPlugin(plugin);

    await harness.sendMessage(
      SYSTEM_CHANNELS.startupContentSettled,
      {},
      "shell",
      true,
    );

    expect(registerHandler).toHaveBeenCalledWith(
      "conversation-memory:channel-action-items",
      expect.anything(),
      "conversation-memory",
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  describe("posting channel notices", () => {
    const ROOM = "discord-discord:guild-1:1466";
    // As the conversation service stores it.
    const room = {
      id: ROOM,
      sessionId: ROOM,
      interfaceType: "discord",
      channelId: "discord:guild-1:1466",
      personId: null,
      started: "2026-10-23T09:00:00.000Z",
      lastActive: "2026-10-23T09:00:00.000Z",
      created: "2026-10-23T09:00:00.000Z",
      updated: "2026-10-23T09:00:00.000Z",
      metadata: null,
    };
    const pending = {
      key: "1-5",
      cards: [{ id: "card-1", title: "Book the venue" }],
    };

    async function brainWithPendingNotice(): Promise<ReturnType<typeof mock>> {
      const shell = harness.getMockShell();
      const conversations = shell.getConversationService();
      shell.getConversationService = (): typeof conversations => ({
        ...conversations,
        getConversation: async (id) => (id === ROOM ? room : null),
        listConversations: async () => [room],
      });
      await channelBookmarks(shell.getRuntimeState()).set(ROOM, {
        processedThrough: 5,
        notices: [pending],
      });
      const posted = mock(() => ({
        success: true,
        data: { messageId: "notice-1" },
      }));
      harness.subscribe(CHAT_CHANNELS.spaceNotice, posted);
      await harness.installPlugin(plugin);
      return posted;
    }

    async function notices(): Promise<unknown> {
      const bookmark = await channelBookmarks(
        harness.getMockShell().getRuntimeState(),
      ).get(ROOM);
      return bookmark?.notices;
    }

    it("posts a conversation's notices when its pickup finishes", async () => {
      const posted = await brainWithPendingNotice();

      await harness.sendMessage(
        JOB_CHANNELS.progress,
        {
          id: "job-1",
          type: "job",
          status: "completed",
          metadata: {
            rootJobId: "job-1",
            ...channelPickupJob(ROOM).options.metadata,
          },
          jobDetails: {
            jobType: "conversation-memory:channel-action-items",
            priority: 0,
            retryCount: 0,
          },
        },
        "job-progress-monitor",
        true,
      );

      expect(posted).toHaveBeenCalledTimes(1);
      expect(await notices()).toEqual([
        { ...pending, postedMessageId: "notice-1" },
      ]);
    });

    it("answers an Undo on a notice it posted with the notice as it now reads", async () => {
      await brainWithPendingNotice();
      await harness.sendMessage(
        SYSTEM_CHANNELS.startupContentSettled,
        {},
        "shell",
        true,
      );

      const answer = await harness.sendMessage(
        CHAT_CHANNELS.spaceNoticeAction,
        {
          conversationId: ROOM,
          noticeMessageId: "notice-1",
          value: "card-1",
          by: "Mira",
        },
        "chat",
      );

      expect(answer).toEqual({
        title: "Added to the board",
        lines: ["~~Book the venue~~ · removed by Mira"],
        actions: [],
      });
    });

    it("posts notices a restart left pending", async () => {
      const posted = await brainWithPendingNotice();

      await harness.sendMessage(
        SYSTEM_CHANNELS.startupContentSettled,
        {},
        "shell",
        true,
      );

      expect(posted).toHaveBeenCalledTimes(1);
      expect(await notices()).toEqual([
        { ...pending, postedMessageId: "notice-1" },
      ]);
    });
  });

  it("keeps memory entities immutable through entity CRUD", () => {
    expect(plugin.entityActionPolicy).toEqual({
      summary: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    });
  });

  it("keeps projector configuration for explicit evaluations", async () => {
    await harness.installPlugin(plugin);
    const config = plugin.getConfig();

    expect(config.maxSourceMessages).toBe(1000);
    expect(config.maxMessagesPerChunk).toBe(40);
    expect(config.maxEntries).toBe(50);
    expect(config.projectionVersion).toBe(1);
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("summary"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });

  it("accepts custom evaluation config", async () => {
    const customPlugin = new ConversationMemoryPlugin({ maxEntries: 10 });
    await harness.installPlugin(customPlugin);

    expect(customPlugin.getConfig().maxEntries).toBe(10);
  });

  it("registers no tools, plus templates and datasource", async () => {
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools).toHaveLength(0);
    expect(
      Array.from(harness.getTemplates().keys()).some((name) =>
        name.includes("summary-list"),
      ),
    ).toBe(true);
    expect(
      Array.from(harness.getTemplates().keys()).some((name) =>
        name.includes("summary-detail"),
      ),
    ).toBe(true);
    expect(
      Array.from(harness.getDataSources().keys()).some((id) =>
        id.includes("conversation-memory"),
      ),
    ).toBe(true);
  });
});
