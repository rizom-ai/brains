import {
  permissionToVisibilityScope,
  type ServicePluginContext,
  type Tool,
  type ToolResponse,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ACTION_ITEM_ENTITY_TYPE } from "@brains/action-items";
import { addActionItemNote, moveActionItem } from "@brains/action-items";
import { actionItemSchema, actionItemStatusSchema } from "@brains/action-items";

const inputSchema = z.object({
  id: z.string().min(1).describe("The action item's id"),
  status: actionItemStatusSchema
    .optional()
    .describe(
      "Where the card goes: open (to do), doing, blocked, done, or dropped",
    ),
  note: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .optional()
    .describe("A one-line note to add to the card"),
});

/**
 * Moves and notes from chat, through the board's write path, so a change made
 * in chat is recorded under the same person as one made on the board.
 */
export function createActionItemUpdateTool(
  context: Pick<ServicePluginContext, "entityService">,
  now: () => Date = (): Date => new Date(),
): Tool {
  return {
    name: "action_item_update",
    description:
      "Move an action item to open, doing, blocked, done or dropped, and/or add a note to it. The change is recorded under the caller's name. Use this, not system_update, for an action item's status or notes.",
    inputSchema: inputSchema.shape,
    visibility: "trusted",
    sideEffects: "writes",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
        };
      }
      const { id, status, note } = parsed.data;
      if (status === undefined && note === undefined) {
        return { success: false, error: "Give a status, a note, or both." };
      }
      const deps = {
        entityService: context.entityService,
        visibilityScope: permissionToVisibilityScope(
          toolContext.userPermissionLevel ?? "public",
        ),
        now,
      };
      const writer = {
        actor: toolContext.actor,
        actorName: toolContext.displayName,
      };
      const card = await context.entityService.getEntity(
        {
          entityType: ACTION_ITEM_ENTITY_TYPE,
          id,
          visibilityScope: deps.visibilityScope,
        },
        actionItemSchema,
      );
      if (!card) return { success: false, error: `No action item ${id}.` };

      const changes: string[] = [];
      if (status !== undefined && status !== card.metadata.status) {
        const moved = await moveActionItem(deps, {
          id,
          from: card.metadata.status,
          to: status,
          ...writer,
        });
        if (moved.status !== "moved") {
          return {
            success: false,
            error: `The card changed while moving it; it is now ${moved.status === "conflict" ? moved.current : "gone"}.`,
          };
        }
        changes.push(`moved to ${status}`);
      }
      if (note !== undefined) {
        const noted = await addActionItemNote(deps, {
          id,
          text: note,
          ...writer,
        });
        if (noted.status !== "noted") {
          return { success: false, error: "The note could not be added." };
        }
        changes.push("noted");
      }
      return {
        success: true,
        data: { id, status: status ?? card.metadata.status },
        message:
          changes.length > 0
            ? `Action item ${changes.join(" and ")}.`
            : `Action item is already ${card.metadata.status}.`,
      };
    },
  };
}
