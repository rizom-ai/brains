import type {
  ContentVisibility,
  ServicePluginContext,
  Tool,
  ToolContext,
  ToolResponse,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  createActionItem,
  type ActionItemAssigneeMember,
  type CreateActionItemOrigin,
} from "@brains/action-items";

const inputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("What needs doing, as a short card title"),
  details: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .describe("More about it, when the request says more than the title"),
  assignee: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Who should do it: "nobody" unless the request names someone; a member\'s name when it does; "me" only when the caller says they will do it themselves.',
    ),
});

/** A brain member a card can be assigned to; `id` is the member's user id. */
export interface ActionItemCreateMember {
  id: string;
  name: string;
}

export interface ActionItemCreateDeps {
  /** The visibility every card on this board gets. */
  visibility: ContentVisibility;
  members: () => Promise<readonly ActionItemCreateMember[]>;
  now?: () => Date;
}

/** The conversation a call came from, when it carries one. */
function originOf(toolContext: ToolContext): CreateActionItemOrigin {
  const { conversationId, channelId, channelName, interfaceType } = toolContext;
  if (!conversationId || !channelId) return { kind: "board" };
  return {
    kind: "conversation",
    conversationId,
    interfaceType,
    channelId,
    ...(channelName ? { channelName } : {}),
  };
}

/** The value that leaves a card unassigned. */
const NOBODY = "nobody";

/** The member a request names; undefined for nobody, an error for a stranger. */
async function assigneeOf(
  assignee: string,
  toolContext: ToolContext,
  members: () => Promise<readonly ActionItemCreateMember[]>,
): Promise<ActionItemAssigneeMember | undefined | { error: string }> {
  const wanted = assignee.toLowerCase();
  if (wanted === NOBODY) return undefined;
  const all = await members();
  const actor = toolContext.actor;
  const member =
    wanted === "me"
      ? all.find(
          (candidate) => actor.kind === "user" && candidate.id === actor.userId,
        )
      : all.find((candidate) => candidate.name.toLowerCase() === wanted);
  if (member) return { name: member.name, id: `user:${member.id}` };
  const names = all.map((candidate) => candidate.name).join(", ");
  return {
    error:
      wanted === "me"
        ? "You are not a member of this brain, so the card cannot be assigned to you."
        : `${assignee} is not a member of this brain${names ? `; members are ${names}` : ""}.`,
  };
}

/**
 * Adds a card from chat through the board's write path: open, requested by
 * the caller, from the conversation it was asked in, at the board's
 * visibility.
 */
export function createActionItemCreateTool(
  context: Pick<ServicePluginContext, "entityService">,
  deps: ActionItemCreateDeps,
): Tool {
  return {
    name: "action_item_create",
    description:
      "Add an action item (a card on the board) when someone asks for one, recorded as requested by the caller. Use this, not system_create, for action items.",
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
      const { title, details, assignee } = parsed.data;
      const member = await assigneeOf(assignee, toolContext, deps.members);
      if (member && "error" in member) {
        return { success: false, error: member.error };
      }
      const { id } = await createActionItem(
        {
          entityService: context.entityService,
          visibility: deps.visibility,
          ...(deps.now ? { now: deps.now } : {}),
        },
        {
          title,
          text: details ?? "",
          assignee: member,
          actor: toolContext.actor,
          actorName: toolContext.displayName,
          origin: originOf(toolContext),
        },
      );
      return {
        success: true,
        data: { id },
        message: member
          ? `Added "${title}" for ${member.name}.`
          : `Added "${title}".`,
      };
    },
  };
}
