import type { ActionItemAssigneeMember } from "@brains/action-items";
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
  /**
   * Part of a conversation with the brain: a request to it or its answer.
   * The brain acts on those itself, so nothing is picked up from them.
   */
  withBrain?: boolean | undefined;
}

/** A member of the brain, by account id and name. */
export interface BrainMember {
  id: string;
  name: string;
}

export interface ChannelActionItemExtractionInput {
  /** Messages before the new ones, shown to the model as context only. */
  context: PositionedMessage[];
  /** The messages not processed yet; every item cites one of them. */
  fresh: PositionedMessage[];
  /** Open cards the channel's pickup made, which the new messages may change. */
  cards: OwnCard[];
  /** The brain's members, who can own a card the messages name them for. */
  members: BrainMember[];
}

/** Who will do the work: a name, and the member assigned when there is one. */
export interface FoundOwner {
  name: string;
  assignee?: ActionItemAssigneeMember | undefined;
}

/** An open card the pickup made and the board has not touched. */
export interface OwnCard {
  id: string;
  title: string;
  text: string;
  /** Its owner's name, when it has one. */
  owner?: string | undefined;
}

/** An action item the new messages commit to. */
export interface FoundActionItem {
  title: string;
  text: string;
  /** The position of the message that states it. */
  sourcePosition: number;
  source: Message;
  /** Who will do it, when the messages name someone. */
  owner?: FoundOwner | undefined;
}

/** A change the new messages make to one of the channel's own cards. */
export interface FoundUpdate {
  cardId: string;
  title: string;
  text: string;
  /** The owner now: a participant, nobody, or the card's owner as it was. */
  owner: FoundOwner | typeof NOBODY | typeof UNCHANGED;
  sourcePosition: number;
  source: Message;
}

/** One of the channel's own cards the new messages call off or report done. */
export interface FoundWithdrawal {
  cardId: string;
  sourcePosition: number;
  source: Message;
}

export interface ChannelExtractionResult {
  items: FoundActionItem[];
  updates: FoundUpdate[];
  withdrawals: FoundWithdrawal[];
}

const NOBODY = "nobody";
const UNCHANGED = "unchanged";

interface Participant {
  ref: string;
  label: string;
  owner: FoundOwner;
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

function memberOwner(member: BrainMember): FoundOwner {
  return {
    name: member.name,
    assignee: { name: member.name, id: `user:${member.id}` },
  };
}

/**
 * Who a speaker is as an owner: a member under the member's name, someone
 * else with an account under their own, anyone else by name alone.
 */
function speakerOwner(message: Message, members: BrainMember[]): FoundOwner {
  const identity = actorOf(message)?.identity;
  const label = labelOf(message);
  if (identity?.kind !== "user") return { name: label };
  const member = members.find((candidate) => candidate.id === identity.userId);
  return member
    ? memberOwner(member)
    : { name: label, assignee: { name: label, id: `user:${identity.userId}` } };
}

/** Each distinct speaker, numbered p1, p2… in order of first appearance. */
function participantsOf(
  messages: PositionedMessage[],
  members: BrainMember[],
): Map<string, Participant> {
  return messages.reduce((participants, { message }) => {
    const key = speakerKey(message);
    if (!participants.has(key)) {
      const owner = speakerOwner(message, members);
      participants.set(key, {
        ref: `p${participants.size + 1}`,
        label: owner.name,
        owner,
      });
    }
    return participants;
  }, new Map<string, Participant>());
}

/** A title as a key, so the same task worded the same way is found twice. */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function formatLines(
  messages: PositionedMessage[],
  participants: Map<string, Participant>,
): string {
  if (messages.length === 0) return "(none)";
  return messages
    .map(({ position, message, withBrain }) => {
      const participant = participants.get(speakerKey(message));
      return `${position}. ${participant?.label ?? message.role} (${participant?.ref ?? "?"})${withBrain ? " [with the brain]" : ""}: ${message.content}`;
    })
    .join("\n");
}

function formatCards(cards: OwnCard[]): string {
  if (cards.length === 0) return "(none)";
  return cards
    .map(
      (card, index) =>
        `c${index + 1}. ${card.title}: ${card.text}${card.owner ? ` (owner: ${card.owner})` : ""}`,
    )
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

Open cards this channel already has:
${formatCards(input.cards)}

Members of the brain: ${input.members.map((member) => member.name).join(", ") || "(none)"}

A message marked [with the brain] is a request to the brain or its answer;
the brain acts on those itself, so never cite one.

An action item is concrete work someone commits to, is asked to do, or the
group agrees needs doing. Questions, opinions, thanks, chatter, and reports of
work already done are not action items.

For each action item in the new messages return:
- title: a short imperative title, at most 80 characters, in the language of the messages;
- text: one sentence saying what is to be done, by whom when someone takes it on;
- message: the number of the new message that states it;
- owner: who will do it: a participant (p1, p2, …), a member of the brain by name when the messages name them, or "${NOBODY}" when no one takes it on.
Return each task once, however often the messages state it.

When a new message changes one of the open cards (someone else takes it over,
a new date or scope), return it under updates:
- card: the card (c1, c2, …);
- title and text: the whole card as it now reads;
- owner: who will do it now (a participant or a member by name), "${NOBODY}", or "${UNCHANGED}" to keep its owner;
- message: the number of the new message that changes it.
A change of owner is only an update: the work goes on, so never withdraw the
card for it and never add its work again as a new action item.

An update is for work that goes on. When a new message says the work of an
open card is no longer needed or already done, return it under withdrawals
with the card and the message, never as an update.

Never return the work of an open card as a new action item.

Return empty lists when the new messages hold none of these.`;
}

/**
 * Asks the model for the action items a channel's new messages commit to and
 * the changes they make to the channel's own cards, and keeps only those that
 * cite one of the new messages and, for a change, a card it was shown.
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
  ): Promise<ChannelExtractionResult> {
    if (input.fresh.length === 0) {
      return { items: [], updates: [], withdrawals: [] };
    }
    const participants = participantsOf(
      [...input.context, ...input.fresh],
      input.members,
    );
    const byRef = new Map(
      [...participants.values()].map((participant) => [
        participant.ref,
        participant,
      ]),
    );
    const ownerOf = (owner: string): FoundOwner | undefined => {
      const participant = byRef.get(owner);
      if (participant) return participant.owner;
      const member = input.members.find(
        (candidate) => candidate.name.toLowerCase() === owner.toLowerCase(),
      );
      return member ? memberOwner(member) : undefined;
    };
    // Only the new messages the brain was not part of can be cited.
    const fresh = new Map(
      input.fresh
        .filter((entry) => !entry.withBrain)
        .map((entry) => [entry.position, entry.message]),
    );
    const cards = new Map(
      input.cards.map((card, index) => [`c${index + 1}`, card]),
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
      // A task is added once: not again when the batch repeats it, nor when
      // the channel already has an open card for it.
      const known = new Set(input.cards.map((card) => titleKey(card.title)));
      const items = result.items.flatMap((item): FoundActionItem[] => {
        const source = fresh.get(item.message);
        const key = titleKey(item.title);
        if (!source || known.has(key)) return [];
        known.add(key);
        return [
          {
            title: item.title,
            text: item.text,
            sourcePosition: item.message,
            source,
            owner: item.owner === NOBODY ? undefined : ownerOf(item.owner),
          },
        ];
      });
      const updates = result.updates.flatMap((update): FoundUpdate[] => {
        const source = fresh.get(update.message);
        const card = cards.get(update.card);
        if (!source || !card) return [];
        const owner =
          update.owner === NOBODY
            ? NOBODY
            : (ownerOf(update.owner) ?? UNCHANGED);
        return [
          {
            cardId: card.id,
            title: update.title,
            text: update.text,
            owner,
            sourcePosition: update.message,
            source,
          },
        ];
      });
      // A card the same messages change goes on with its new owner or
      // scope, so a withdrawal of it alongside the change is dropped.
      const changed = new Set(updates.map((update) => update.cardId));
      const withdrawals = result.withdrawals.flatMap((withdrawal) => {
        const source = fresh.get(withdrawal.message);
        const card = cards.get(withdrawal.card);
        if (!source || !card || changed.has(card.id)) return [];
        return [
          { cardId: card.id, sourcePosition: withdrawal.message, source },
        ];
      });
      return { items, updates, withdrawals };
    } catch (error) {
      this.logger.error("Channel action item extraction failed", {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
