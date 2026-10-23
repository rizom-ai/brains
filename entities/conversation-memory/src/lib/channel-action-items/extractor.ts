import {
  conversationMessageMetadataSchema,
  type ConversationMessageActor,
  type EntityPluginContext,
  type Message,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import { CHANNEL_ACTION_ITEMS_TEMPLATE_NAME } from "../constants";
import { channelActionItemExtractionSchema } from "./schema";

/** A message with its 1-based position in its conversation. */
export interface PositionedMessage {
  position: number;
  message: Message;
}

export interface ChannelActionItemExtractionInput {
  /** Messages before the new ones, shown to the model as context only. */
  context: PositionedMessage[];
  /** The messages not processed yet; every item cites one of them. */
  fresh: PositionedMessage[];
}

/** An action item the new messages commit to. */
export interface FoundActionItem {
  title: string;
  text: string;
  /** The position of the message that states it. */
  sourcePosition: number;
  source: Message;
  /** The participant who will do it, when the messages name one. */
  owner?: ConversationMessageActor | undefined;
}

const NOBODY = "nobody";

interface Participant {
  ref: string;
  label: string;
  actor: ConversationMessageActor | undefined;
}

function actorOf(message: Message): ConversationMessageActor | undefined {
  const parsed = conversationMessageMetadataSchema.safeParse(message.metadata);
  return parsed.success ? parsed.data.actor : undefined;
}

function speakerKey(message: Message): string {
  const actor = actorOf(message);
  if (!actor) return `role:${message.role}`;
  const { identity } = actor;
  if (identity.kind === "user") return `user:${identity.userId}`;
  if (identity.kind === "external") return identity.externalActorId;
  return JSON.stringify(identity);
}

function labelOf(message: Message): string {
  const actor = actorOf(message);
  return (
    [actor?.displayName, actor?.username]
      .map((value) => value?.trim())
      .find((value): value is string => !!value) ?? message.role
  );
}

/** Each distinct speaker, numbered p1, p2… in order of first appearance. */
function participantsOf(
  messages: PositionedMessage[],
): Map<string, Participant> {
  return messages.reduce((participants, { message }) => {
    const key = speakerKey(message);
    if (!participants.has(key)) {
      participants.set(key, {
        ref: `p${participants.size + 1}`,
        label: labelOf(message),
        actor: actorOf(message),
      });
    }
    return participants;
  }, new Map<string, Participant>());
}

function formatLines(
  messages: PositionedMessage[],
  participants: Map<string, Participant>,
): string {
  if (messages.length === 0) return "(none)";
  return messages
    .map(({ position, message }) => {
      const participant = participants.get(speakerKey(message));
      return `${position}. ${participant?.label ?? message.role} (${participant?.ref ?? "?"}): ${message.content}`;
    })
    .join("\n");
}

function buildPrompt(
  input: ChannelActionItemExtractionInput,
  participants: Map<string, Participant>,
): string {
  return `Find the action items in the new messages of a team channel.

Earlier messages (context only; never cite them):
${formatLines(input.context, participants)}

New messages:
${formatLines(input.fresh, participants)}

An action item is concrete work someone commits to, is asked to do, or the
group agrees needs doing. Questions, opinions, thanks, chatter, and reports of
work already done are not action items.

For each action item in the new messages return:
- title: a short imperative title, at most 80 characters, in the language of the messages;
- text: one sentence saying what is to be done, by whom when someone takes it on;
- message: the number of the new message that states it;
- owner: the participant (p1, p2, …) who will do it, or "${NOBODY}" when no one takes it on.

Return an empty list when the new messages hold no action items.`;
}

/**
 * Asks the model for the action items a channel's new messages commit to,
 * and keeps only those that cite one of the new messages.
 */
export class ChannelActionItemExtractor {
  private readonly context: Pick<EntityPluginContext, "ai">;
  private readonly logger: Logger;

  constructor(context: Pick<EntityPluginContext, "ai">, logger: Logger) {
    this.context = context;
    this.logger = logger;
  }

  public async extract(
    input: ChannelActionItemExtractionInput,
  ): Promise<FoundActionItem[]> {
    if (input.fresh.length === 0) return [];
    const participants = participantsOf([...input.context, ...input.fresh]);
    const byRef = new Map(
      [...participants.values()].map((participant) => [
        participant.ref,
        participant,
      ]),
    );
    const fresh = new Map(
      input.fresh.map((entry) => [entry.position, entry.message]),
    );

    try {
      const result = await this.context.ai.generate(
        {
          prompt: buildPrompt(input, participants),
          templateName: CHANNEL_ACTION_ITEMS_TEMPLATE_NAME,
          data: { schema: channelActionItemExtractionSchema },
          representedIdentity: "none",
        },
        channelActionItemExtractionSchema,
      );
      return result.items.flatMap((item) => {
        const source = fresh.get(item.message);
        if (!source) return [];
        const owner =
          item.owner === NOBODY ? undefined : byRef.get(item.owner)?.actor;
        return [
          {
            title: item.title,
            text: item.text,
            sourcePosition: item.message,
            source,
            owner,
          },
        ];
      });
    } catch (error) {
      this.logger.error("Channel action item extraction failed", {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
