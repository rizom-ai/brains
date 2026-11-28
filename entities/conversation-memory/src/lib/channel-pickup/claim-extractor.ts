import type { MemoryActorReference } from "@brains/action-items";
import type { Message } from "@brains/sdk/internal/service-runtime";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { CHANNEL_DECISIONS_TEMPLATE_NAME } from "../constants";
import type { MemoryContext } from "../memory-context";
import { channelClaimExtractionSchema } from "./claim-schema";
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

/** What the pickup records beside action items. */
export type ClaimKind = "decision" | "insight";

/** A decision or an insight the channel has already recorded and that still holds. */
export interface RecordedClaim {
  id: string;
  kind: ClaimKind;
  title: string;
  text: string;
}

export interface ChannelClaimExtractionInput {
  /** Messages before the new ones, shown to the model as context only. */
  context: PositionedMessage[];
  /** The messages not processed yet; every claim cites one of them. */
  fresh: PositionedMessage[];
  /** The channel's active decisions and insights, which the new messages may repeat or overturn. */
  recorded: RecordedClaim[];
  /** Whether insights are picked up beside decisions. */
  insights: boolean;
}

/** A decision the new messages settle, or an insight they reach. */
export interface FoundClaim {
  kind: ClaimKind;
  title: string;
  text: string;
  /** The position of the message that settles it. */
  sourcePosition: number;
  source: Message;
  /** Who declared, accepted or stated it, as far as the messages show. */
  by: MemoryActorReference[];
  /** The recorded claim it overturns, when it overturns one. */
  replaces?: Pick<RecordedClaim, "id" | "kind"> | undefined;
}

export interface ChannelClaimExtractionResult {
  claims: FoundClaim[];
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

/** The recorded claims as the model names them: d1, d2…, an insight marked as one. */
function formatRecorded(recorded: RecordedClaim[]): string {
  if (recorded.length === 0) return "(none)";
  return recorded
    .map(
      (claim, index) =>
        `d${index + 1}. ${claim.kind === "insight" ? "[insight] " : ""}${claim.title}: ${claim.text}`,
    )
    .join("\n");
}

/** What the prompt says only when insights are picked up beside decisions. */
function insightWording(insights: boolean): {
  what: string;
  recorded: string;
  candidate: string;
  kind: string;
  recordedKinds: string;
  said: string;
  by: string;
  replaced: string;
  corrects: string;
} {
  return insights
    ? {
        what: "decisions and insights",
        recorded: "Decisions and insights",
        candidate: "a decision or an insight",
        kind: `
  - "insight": something the group found out and now relies on, worth knowing later: a cause found by looking, a fact established, a lesson drawn ("sign-ups dropped because the form asks for a company name"). One finding is one insight: what was seen, its cause and what it means are the same insight, returned once, from the message that states the conclusion. A statement is one kind only: a choice the group makes is a "decision", never an "insight";
  - "guess": a guess, a hypothesis or an opinion nobody checked or confirmed ("maybe the holidays?"), a fact everyone already had, or a report of what happened. Not an insight;`,
        recordedKinds: `"decision" or "insight"`,
        said: "what was decided or learned",
        by: "who declared or accepted it, or stated the insight",
        replaced: "the recorded decision or insight",
        corrects:
          " When the new messages find that a recorded insight was wrong, the insight that corrects it replaces it.",
      }
    : {
        what: "decisions",
        recorded: "Decisions",
        candidate: "a decision",
        kind: "",
        recordedKinds: `"decision"`,
        said: "what was decided",
        by: "who declared or accepted it",
        replaced: "the recorded decision",
        corrects: "",
      };
}

function buildPrompt(
  input: ChannelClaimExtractionInput,
  participants: Map<string, Participant>,
): string {
  const day = singleDay([...input.context, ...input.fresh]);
  const dated = day === undefined;
  const wording = insightWording(input.insights);
  return `Find the ${wording.what} in the new messages of a team channel.${
    day
      ? `

The messages were written on ${day}.`
      : ""
  }

Earlier messages (context only; never cite them):
${formatLines(input.context, participants, dated)}

New messages:
${formatLines(input.fresh, participants, dated)}

${wording.recorded} this channel has already recorded:
${formatRecorded(input.recorded)}

A message marked [with the brain] is a request to the brain or its answer;
never cite one.

First return language: the language the new messages are written in, by its
English name. Judge it from the words of the messages alone; the speakers'
names say nothing about it.

Then return under candidates every statement in the new messages that might
be ${wording.candidate}, each with:
- kind: what it turns out to be:
  - "decision": a choice the group settles about what it will do or how things will be. A participant declares it for the group, or someone proposes it and another clearly accepts ("yes, let's do that");${wording.kind}
  - "action-item": work someone takes on, is asked to do or is put in charge of ("I'll fix the form by Friday", "Alice owns the rewrite");
  - "undecided": a proposal, recommendation or opinion nobody clearly accepts ("interesting", "let's look at it some time" accept nothing);
  - "recorded": a message that repeats, confirms or welcomes a decision the channel has already recorded. A message that overturns or changes a recorded decision is a new "decision", not this;
- title: it in a few words, at most 80 characters;
- text: one or two sentences saying ${wording.said}, and why when the messages say;
- message: the number of the new message that settles it: the declaration, or the acceptance of a proposal;
- decidedBy: the participants (p1, p2, …) ${wording.by}; an empty list when the messages do not show who;
- replaces: ${wording.replaced} (d1, d2, …) it overturns or changes, so that one no longer holds; "none" when it overturns none.${wording.corrects}
Write title and text in that language.
Return each candidate once, however often the messages state it. Questions,
chatter, thanks and reports of what happened are not candidates.

Only candidates of kind ${wording.recordedKinds} are recorded. Most new messages hold
none: return an empty list then.`;
}

/**
 * Asks the model to judge what in a channel's new messages might be a
 * decision, and keeps what it judges one, cites one of the new messages and
 * is not recorded by the channel yet.
 */
export class ChannelClaimExtractor {
  private readonly context: Pick<MemoryContext, "ai">;
  private readonly logger: Logger;

  constructor(context: Pick<MemoryContext, "ai">, logger: Logger) {
    this.context = context;
    this.logger = logger;
  }

  public async extract(
    input: ChannelClaimExtractionInput,
  ): Promise<ChannelClaimExtractionResult> {
    if (input.fresh.length === 0) return { claims: [] };
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
      input.recorded.map(({ id, kind }, index) => [
        `d${index + 1}`,
        { id, kind },
      ]),
    );

    try {
      const result = await this.context.ai.generate(
        {
          prompt: buildPrompt(input, participants),
          templateName: CHANNEL_DECISIONS_TEMPLATE_NAME,
          data: { schema: channelClaimExtractionSchema },
          representedIdentity: "none",
        },
        channelClaimExtractionSchema,
      );
      // A decision is recorded once: not again when the batch repeats it,
      // nor when the channel already has it.
      const known = new Set(
        input.recorded.map((claim) => titleKey(claim.title)),
      );
      const claims = result.candidates.flatMap((found): FoundClaim[] => {
        const source = fresh.get(found.message);
        const key = titleKey(found.title);
        const kind =
          found.kind === "decision" ||
          (found.kind === "insight" && input.insights)
            ? found.kind
            : undefined;
        if (!kind || !source || known.has(key)) return [];
        known.add(key);
        return [
          {
            kind,
            title: found.title,
            text: found.text,
            sourcePosition: found.message,
            source,
            by: [...new Set(found.decidedBy)].flatMap((ref) => {
              const person = people.get(ref);
              return person ? [person] : [];
            }),
            replaces: recorded.get(found.replaces),
          },
        ];
      });
      return { claims };
    } catch (error) {
      this.logger.error("Channel decision and insight extraction failed", {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}
