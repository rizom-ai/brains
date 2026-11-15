import {
  defineChannel,
  ToolResultDataSchema,
  type Channel,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";

/**
 * Turn Events - what a finished agent turn did, for in-process observers.
 * Interfaces reply with the turn's answer; an observer that needs the
 * turn's tool results, such as an evaluation, follows this event instead.
 */

type AgentTurnCompletedEventSchema = z.ZodObject<{
  conversationId: z.ZodString;
  toolResults: z.ZodArray<typeof ToolResultDataSchema>;
}>;

/** A turn finished: its conversation and the tool results its response carries. */
export const agentTurnCompletedEventSchema: AgentTurnCompletedEventSchema =
  z.object({
    conversationId: z.string().min(1),
    toolResults: z.array(ToolResultDataSchema),
  });

export type AgentTurnCompletedEvent = z.output<
  typeof agentTurnCompletedEventSchema
>;

export const agentTurnCompletedChannel: Channel<
  AgentTurnCompletedEvent,
  unknown,
  "agent:turn-completed"
> = defineChannel("agent:turn-completed", agentTurnCompletedEventSchema);
