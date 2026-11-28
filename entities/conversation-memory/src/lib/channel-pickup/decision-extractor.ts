import type { MemoryActorReference } from "@brains/action-items";
import type { Message } from "@brains/sdk/internal/service-runtime";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { CHANNEL_DECISIONS_TEMPLATE_NAME } from "../constants";
import type { MemoryContext } from "../memory-context";
import { channelDecisionExtractionSchema } from "./decision-schema";
import {
  actorOf,
  formatLines,
  labelOf,
  singleDay,
  speakerKey,
  titleKey,
  type PositionedMessage,
  type Speaker,
} from "./messages";

/** A decision the channel has already recorded and that still holds. */
export interface OwnDecision {
  id: string;
  title: string;
  text: string;
}

export interface ChannelDecisionExtractionInput {
  /** Messages before the new ones, shown to the model as context only. */
  context: PositionedMessage[];
  /** The messages not processed yet; every decision cites one of them. */
  fresh: PositionedMessage[];
  /** The channel's active decisions, which the new messages may repeat. */
  decisions: OwnDecision[];
}

/** A decision the new messages settle. */
export interface FoundDecision {
  title: string;
  text: string;
  /** The position of the message that settles it. */
  sourcePosition: number;
  source: Message;
  /** Who declared or accepted it, as far as the messages show. */
  decidedBy: MemoryActorReference[];
  /** The id of the recorded decision it overturns, when it overturns one. */
  replaces?: string | undefined;
}

export interface ChannelDecisionExtractionResult {
  decisions: FoundDecision[];
}

/** A speaker the model can name, and who they are when the message says. */
interface Participant extends Speaker {
  person: MemoryActorReference | undefined;
}

/** Who said a message, when it records its speaker. */
export function personOf(message: Message): MemoryActorReference | undefined {
  const actor = actorOf(message);
  return actor
    ? { identity: actor.identity, displayName: labelOf(message) }
    : undefined;
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
        person: personOf(message),
      });
    }
    return participants;
  }, new Map<string, Participant>());
}

function formatDecisions(decisions: OwnDecision[]): string {
  if (decisions.length === 0) return "(none)";
  return decisions
    .map(
      (decision, index) => `d${index + 1}. ${decision.title}: ${decision.text}`,
    )
    .join("\n");
}

function buildPrompt(
  input: ChannelDecisionExtractionInput,
  participants: Map<string, Participant>,
): string {
  const day = singleDay([...input.context, ...input.fresh]);
  const dated = day === undefined;
  return `Find the decisions in the new messages of a team channel.${
    day
      ? `

The messages were written on ${day}.`
      : ""
  }

Earlier messages (context only; never cite them):
${formatLines(input.context, participants, dated)}

New messages:
${formatLines(input.fresh, participants, dated)}

Decisions this channel has already recorded:
${formatDecisions(input.decisions)}

A message marked [with the brain] is a request to the brain or its answer;
never cite one.

First return language: the language the new messages are written in, by its
English name. Judge it from the words of the messages alone; the speakers'
names say nothing about it.

Then return under candidates every statement in the new messages that might
be a decision, each with:
- kind: what it turns out to be:
  - "decision": a choice the group settles about what it will do or how things will be. A participant declares it for the group, or someone proposes it and another clearly accepts ("yes, let's do that");
  - "action-item": work someone takes on, is asked to do or is put in charge of ("I'll fix the form by Friday", "Alice owns the rewrite");
  - "undecided": a proposal, recommendation or opinion nobody clearly accepts ("interesting", "let's look at it some time" accept nothing);
  - "recorded": a message that repeats, confirms or welcomes a decision the channel has already recorded. A message that overturns or changes a recorded decision is a new "decision", not this;
- title: it in a few words, at most 80 characters;
- text: one or two sentences saying what was decided, and why when the messages say;
- message: the number of the new message that settles it: the declaration, or the acceptance of a proposal;
- decidedBy: the participants (p1, p2, …) who declared or accepted it; an empty list when the messages do not show who;
- replaces: the recorded decision (d1, d2, …) it overturns or changes, so that one no longer holds; "none" when it overturns none.
Write title and text in that language.
Return each candidate once, however often the messages state it. Questions,
chatter, thanks and reports of what happened are not candidates.

Only candidates of kind "decision" are recorded. Most new messages hold
none: return an empty list then.`;
}

/**
 * Asks the model to judge what in a channel's new messages might be a
 * decision, and keeps what it judges one, cites one of the new messages and
 * is not recorded by the channel yet.
 */
export class ChannelDecisionExtractor {
  private readonly context: Pick<MemoryContext, "ai">;
  private readonly logger: Logger;

  constructor(context: Pick<MemoryContext, "ai">, logger: Logger) {
    this.context = context;
    this.logger = logger;
  }

  public async extract(
    input: ChannelDecisionExtractionInput,
  ): Promise<ChannelDecisionExtractionResult> {
    if (input.fresh.length === 0) return { decisions: [] };
    const participants = participantsOf([...input.context, ...input.fresh]);
    const people = new Map(
      [...participants.values()].flatMap(({ ref, person }) =>
        person ? [[ref, person] as const] : [],
      ),
    );
    // Only the new messages the brain was not part of can be cited.
    const fresh = new Map(
      input.fresh
        .filter((entry) => !entry.withBrain)
        .map((entry) => [entry.position, entry.message]),
    );

    const recorded = new Map(
      input.decisions.map((decision, index) => [`d${index + 1}`, decision.id]),
    );

    try {
      const result = await this.context.ai.generate(
        {
          prompt: buildPrompt(input, participants),
          templateName: CHANNEL_DECISIONS_TEMPLATE_NAME,
          data: { schema: channelDecisionExtractionSchema },
          representedIdentity: "none",
        },
        channelDecisionExtractionSchema,
      );
      // A decision is recorded once: not again when the batch repeats it,
      // nor when the channel already has it.
      const known = new Set(
        input.decisions.map((decision) => titleKey(decision.title)),
      );
      const decisions = result.candidates.flatMap((found): FoundDecision[] => {
        const source = fresh.get(found.message);
        const key = titleKey(found.title);
        if (found.kind !== "decision" || !source || known.has(key)) return [];
        known.add(key);
        return [
          {
            title: found.title,
            text: found.text,
            sourcePosition: found.message,
            source,
            decidedBy: [...new Set(found.decidedBy)].flatMap((ref) => {
              const person = people.get(ref);
              return person ? [person] : [];
            }),
            replaces: recorded.get(found.replaces),
          },
        ];
      });
      return { decisions };
    } catch (error) {
      this.logger.error("Channel decision extraction failed", {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
