import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import type { ConversationProjectionBackfillState } from "../conversation-projection-backfill";
import type { SystemServices } from "./types";
import { createConfirmationGate, createSystemTool } from "./tool-helpers";

const backfillInputSchema = z.strictObject({
  newRun: z.boolean().optional().default(false),
  confirmed: z.boolean().optional().default(false),
  confirmationToken: z.string().uuid().optional(),
});

function backfillResult(state: ConversationProjectionBackfillState): object {
  return {
    ...state,
    progress: {
      scanned: state.scanned,
      marked: state.marked,
      eligibleDerived: null,
      abstained: null,
      remaining: state.status === "completed" ? 0 : "unknown",
    },
  };
}

export function createConversationProjectionBackfillTools(
  services: SystemServices,
): Tool[] {
  const backfill = services.conversationProjectionBackfill;
  if (!backfill) return [];
  const confirmationGate = createConfirmationGate({
    label: "conversation projection backfill",
    requestNoun: "conversation projection backfill",
  });

  return [
    createSystemTool(
      "backfill_conversation_projections",
      "Start, resume, or inspect the durable historical conversation projection backfill. This can invoke the configured model for historical conversations and requires explicit administrator confirmation before a new run.",
      backfillInputSchema,
      async (input, context) => {
        if (context.userPermissionLevel !== "admin") {
          return {
            success: false,
            error:
              "Conversation projection backfill requires Admin permission.",
          };
        }

        const current = await backfill.getCurrent();
        if (current?.status === "active") {
          await backfill.resumeActiveRun();
          return {
            success: true,
            data: backfillResult((await backfill.getCurrent()) ?? current),
          };
        }
        if (current && !input.newRun) {
          return {
            success: true,
            data: {
              ...backfillResult(current),
              repeatRequiresNewRun: true,
            },
          };
        }

        if (input.confirmed) {
          const gateError = confirmationGate.validateConfirmed(
            input.confirmationToken,
            input,
          );
          if (gateError) return gateError;
          const state = await backfill.startNewRun();
          return { success: true, data: backfillResult(state) };
        }

        const args = confirmationGate.buildArgs((confirmationToken) => ({
          newRun: input.newRun,
          confirmed: true,
          confirmationToken,
        }));
        return {
          needsConfirmation: true,
          toolName: "system_backfill_conversation_projections",
          summary: "Backfill historical conversation projections?",
          preview:
            "This scans historical conversations and may make model calls with associated cost. Live projection progress is kept separate.",
          args,
        };
      },
      { visibility: "admin", sideEffects: "writes" },
    ),
  ];
}
