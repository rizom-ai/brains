import { flatId } from "@brains/action-items";
import {
  internalFullScope,
  type ContentVisibility,
} from "@brains/sdk/internal/service-runtime";
import { decisionSchema } from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import type { MemoryEntityService } from "../memory-context";
import { headingAndText, rewriteOwnDecision } from "./own-decisions";
import {
  personOf,
  type ChannelDecisionExtractor,
  type FoundDecision,
  type OwnDecision,
} from "./decision-extractor";
import {
  chatMessageIdOf,
  sourcePositionOf,
  type PositionedMessage,
} from "./messages";

/** The conversation a batch of messages belongs to, as its memories record it. */
export interface ChannelOrigin {
  conversationId: string;
  interfaceType: string;
  channelId: string;
  channelName?: string;
}

/** One claimed range of a space conversation, as each kind of pickup reads it. */
export interface ChannelBatch {
  origin: ChannelOrigin;
  /** Messages before the new ones, context only. */
  context: PositionedMessage[];
  /** The messages not processed yet. */
  fresh: PositionedMessage[];
  /** What someone took back with Undo; never written again. */
  rejected: ReadonlySet<string>;
  /** The decisions the pickup wrote, by id: the hash of what it wrote. */
  own: Readonly<Record<string, string>>;
}

export interface DecisionPickupDeps {
  extractor: Pick<ChannelDecisionExtractor, "extract">;
  entityService: Pick<
    MemoryEntityService,
    "createEntity" | "getEntity" | "listEntities" | "updateEntity"
  >;
  /** The visibility the brain gives memory it makes. */
  visibility: ContentVisibility;
}

/** A decision a batch's messages settle, as its notice announces it. */
export interface PickedUpDecision {
  id: string;
  title: string;
  /** The chat message it was found in, to pin. */
  sourceMessageId: string | undefined;
  /** The hash of what this run wrote; none for one an earlier run wrote. */
  hash: string | undefined;
}

/** One of its own decisions a batch's new decision replaced. */
export interface SupersededDecision {
  id: string;
  title: string;
  /** The chat message that overturned it, to pin. */
  sourceMessageId: string | undefined;
  /** The hash it has now, still the pickup's own. */
  hash: string;
}

export interface DecisionPickupResult {
  /** Every decision the messages settle, for the batch's notice. */
  decisions: PickedUpDecision[];
  superseded: SupersededDecision[];
}

/** How many of its most recent active decisions the model sees. */
const OWN_DECISIONS_LIMIT = 30;

/** A system actor, for a message whose speaker was not recorded. */
const UNKNOWN_SPEAKER = {
  kind: "service",
  serviceId: "conversation-memory",
} as const;

/**
 * The conversation's active decisions, newest first, picked up or recorded
 * by hand: what the new messages must not record a second time. One picked
 * up from the range being processed is left out: a run that died after
 * writing it left it unannounced, and it is announced only when found again.
 */
async function activeDecisions(
  deps: DecisionPickupDeps,
  conversationId: string,
  from: number,
): Promise<OwnDecision[]> {
  const entities = await deps.entityService.listEntities(
    {
      entityType: DECISION_ENTITY_TYPE,
      options: {
        filter: {
          metadata: { conversationId, status: "active" },
          visibilityScope: deps.visibility,
        },
        sortFields: [{ field: "created", direction: "desc" }],
        limit: OWN_DECISIONS_LIMIT,
      },
    },
    decisionSchema,
  );
  const prefix = `${flatId(conversationId, "decision")}-`;
  return entities
    .filter((entity) => (sourcePositionOf(entity.id, prefix) ?? 0) < from)
    .map((entity) => ({
      id: entity.id,
      ...headingAndText(entity.content),
    }));
}

/** A found decision under the id its message gives it: one, two… per message. */
function named(
  conversationId: string,
  decisions: FoundDecision[],
): { decision: FoundDecision; id: string }[] {
  return decisions.map((decision, index) => ({
    decision,
    id: flatId(
      conversationId,
      "decision",
      String(decision.sourcePosition),
      String(
        decisions
          .slice(0, index)
          .filter(
            (earlier) => earlier.sourcePosition === decision.sourcePosition,
          ).length + 1,
      ),
    ),
  }));
}

/**
 * Turn a batch's new messages into decisions, each written once under an id
 * its source message gives it, so a rerun of the range writes nothing twice.
 * The ones this run wrote carry the hash of what it wrote. A decision that
 * overturns one the pickup wrote and nobody has edited supersedes it.
 */
export async function pickUpDecisions(
  deps: DecisionPickupDeps,
  batch: ChannelBatch,
): Promise<DecisionPickupResult> {
  const { origin } = batch;
  const from = Math.min(...batch.fresh.map(({ position }) => position));
  const { decisions } = await deps.extractor.extract({
    context: batch.context,
    fresh: batch.fresh,
    decisions: await activeDecisions(deps, origin.conversationId, from),
  });
  const stored = (
    id: string,
  ): ReturnType<typeof deps.entityService.getEntity> =>
    deps.entityService.getEntity({
      entityType: DECISION_ENTITY_TYPE,
      id,
      visibilityScope: internalFullScope("decision id collision check"),
    });
  const found = named(origin.conversationId, decisions).filter(
    ({ id }) => !batch.rejected.has(id),
  );
  const picked = await found.reduce<Promise<PickedUpDecision[]>>(
    async (soFar, { decision, id }) => {
      const created = await soFar;
      const sourceMessageId = chatMessageIdOf(decision.source);
      const exists = await stored(id);
      if (exists) {
        // Announced under the title it was stored with.
        return [
          ...created,
          {
            id,
            title: headingAndText(exists.content).title || decision.title,
            sourceMessageId,
            hash: undefined,
          },
        ];
      }
      const speaker = personOf(decision.source);
      const deciders = new Set(
        decision.decidedBy.map((person) => JSON.stringify(person.identity)),
      );
      const said = decision.source.timestamp;
      const text = decision.text.trim();
      await deps.entityService.createEntity({
        entity: {
          id,
          entityType: DECISION_ENTITY_TYPE,
          visibility: deps.visibility,
          content: text
            ? `# ${decision.title}\n\n${text}`
            : `# ${decision.title}`,
          metadata: {
            ...origin,
            timeRange: { start: said, end: said },
            status: "active",
            ...(decision.decidedBy.length > 0 && {
              decidedBy: decision.decidedBy,
            }),
            // Whoever said it, unless they are already named as deciding it.
            ...(speaker &&
              !deciders.has(JSON.stringify(speaker.identity)) && {
                mentionedBy: [speaker],
              }),
          },
        },
        options: {
          eventContext: { actor: speaker?.identity ?? UNKNOWN_SPEAKER },
        },
      });
      return [
        ...created,
        {
          id,
          title: decision.title,
          sourceMessageId,
          hash: (await stored(id))?.contentHash,
        },
      ];
    },
    Promise.resolve([]),
  );
  // Each replaced decision once, by the latest decision that replaces it.
  const replacements = new Map(
    found.flatMap(({ decision, id }) =>
      decision.replaces && decision.replaces !== id
        ? [[decision.replaces, { decision, id }] as const]
        : [],
    ),
  );
  const superseded = await [...replacements].reduce<
    Promise<SupersededDecision[]>
  >(async (soFar, [replaced, { decision, id }]) => {
    const done = await soFar;
    const rewritten = await rewriteOwnDecision(
      deps.entityService,
      batch.own[replaced],
      replaced,
      (metadata) => ({ ...metadata, status: "superseded", supersededBy: id }),
    );
    return rewritten
      ? [
          ...done,
          {
            id: replaced,
            ...rewritten,
            sourceMessageId: chatMessageIdOf(decision.source),
          },
        ]
      : done;
  }, Promise.resolve([]));
  return { decisions: picked, superseded };
}
