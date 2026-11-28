import { flatId } from "@brains/action-items";
import {
  internalFullScope,
  type ContentVisibility,
} from "@brains/sdk/internal/service-runtime";
import { decisionSchema } from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE } from "../constants";
import type { MemoryEntityService } from "../memory-context";
import {
  personOf,
  type ChannelDecisionExtractor,
  type FoundDecision,
  type OwnDecision,
} from "./decision-extractor";
import type { PositionedMessage } from "./messages";

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
}

export interface DecisionPickupDeps {
  extractor: Pick<ChannelDecisionExtractor, "extract">;
  entityService: Pick<
    MemoryEntityService,
    "createEntity" | "getEntity" | "listEntities"
  >;
  /** The visibility the brain gives memory it makes. */
  visibility: ContentVisibility;
}

/** How many of its most recent active decisions the model sees. */
const OWN_DECISIONS_LIMIT = 30;

/** A system actor, for a message whose speaker was not recorded. */
const UNKNOWN_SPEAKER = {
  kind: "service",
  serviceId: "conversation-memory",
} as const;

/** A decision's heading and the text under it, up to its first section. */
function headingAndText(content: string): { title: string; text: string } {
  const lines = content.split("\n");
  const at = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (at < 0) return { title: "", text: content.trim() };
  const rest = lines.slice(at + 1);
  const section = rest.findIndex((line) => /^##\s/.test(line));
  return {
    title: (lines[at] ?? "").replace(/^#\s+/, "").trim(),
    text: (section < 0 ? rest : rest.slice(0, section)).join("\n").trim(),
  };
}

/**
 * The conversation's active decisions, newest first, picked up or recorded
 * by hand: what the new messages must not record a second time.
 */
async function activeDecisions(
  deps: DecisionPickupDeps,
  conversationId: string,
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
  return entities.map((entity) => ({
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
 * Returns the ids it created.
 */
export async function pickUpDecisions(
  deps: DecisionPickupDeps,
  batch: ChannelBatch,
): Promise<string[]> {
  const { origin } = batch;
  const { decisions } = await deps.extractor.extract({
    context: batch.context,
    fresh: batch.fresh,
    decisions: await activeDecisions(deps, origin.conversationId),
  });
  return named(origin.conversationId, decisions)
    .filter(({ id }) => !batch.rejected.has(id))
    .reduce<Promise<string[]>>(async (createdSoFar, { decision, id }) => {
      const created = await createdSoFar;
      const exists = await deps.entityService.getEntity({
        entityType: DECISION_ENTITY_TYPE,
        id,
        visibilityScope: internalFullScope("decision id collision check"),
      });
      if (exists) return created;
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
      return [...created, id];
    }, Promise.resolve([]));
}
