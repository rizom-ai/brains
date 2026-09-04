/* eslint-disable @typescript-eslint/explicit-function-return-type -- fixture callbacks stay structurally checked by the production constructor. */
import { describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { createSilentLogger, expectConfirmationArgs } from "@brains/test-utils";
import { ConversationProjectionBackfill } from "../../src/conversation-projection-backfill";
import { createConversationProjectionBackfillTools } from "../../src/system/conversation-projection-backfill-tool";
import { createMockSystemServices } from "./mock-services";

const adminContext: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "service", serviceId: "test" },
  userPermissionLevel: "admin",
};

function createTool(): Tool {
  const services = createMockSystemServices();
  let state: Awaited<ReturnType<ConversationProjectionBackfill["getCurrent"]>> =
    null;
  const backfill = new ConversationProjectionBackfill({
    conversations: {
      getConversationChangeHead: async () => ({
        updated: "2026-01-01T00:00:00.000Z",
        id: "conversation-1",
      }),
      listConversationsUpdatedSince: async () => [],
    },
    projectionStore: {
      getActiveWave: async () => null,
      listPendingInputs: async () => [],
      markDirty: async () => 1,
    },
    state: {
      get: async () => state,
      set: async (_key, value) => {
        state = value;
      },
    },
    jobs: services.jobs,
    logger: createSilentLogger("backfill-tool-test"),
  });
  const tool = createConversationProjectionBackfillTools({
    ...services,
    conversationProjectionBackfill: backfill,
  })[0];
  if (!tool) throw new Error("Backfill tool was not created");
  return tool;
}

describe("system_backfill_conversation_projections", () => {
  it("requires admin permission before requesting confirmation", async () => {
    const result = await createTool().handler(
      {},
      { ...adminContext, userPermissionLevel: "trusted" },
    );

    expect(result).toEqual({
      success: false,
      error: "Conversation projection backfill requires Admin permission.",
    });
  });

  it("warns about model cost and starts only with its confirmation token", async () => {
    const tool = createTool();
    const pending = await tool.handler({}, adminContext);
    // Read the args before the matcher assertion below: `toMatchObject`
    // substitutes matchers into the received object, so reading a field
    // afterwards yields the matcher rather than what the tool returned.
    const confirmedArgs = expectConfirmationArgs(pending);

    expect(pending).toMatchObject({
      needsConfirmation: true,
      toolName: "system_backfill_conversation_projections",
      preview: expect.stringContaining("model calls"),
    });

    const started = await tool.handler(confirmedArgs, adminContext);
    expect(started).toMatchObject({
      success: true,
      data: {
        status: "active",
        head: { id: "conversation-1" },
        progress: {
          scanned: 0,
          marked: 0,
          eligibleDerived: null,
          abstained: null,
          remaining: "unknown",
        },
      },
    });
  });
});
