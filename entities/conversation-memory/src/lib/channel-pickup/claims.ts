import { flatId } from "@brains/action-items";
import type { ContentVisibility } from "@brains/sdk/internal/service-runtime";
import {
  decisionSchema,
  insightSchema,
} from "../../schemas/conversation-memory";
import { DECISION_ENTITY_TYPE, INSIGHT_ENTITY_TYPE } from "../constants";
import type { MemoryEntityService } from "../memory-context";
import {
  personOf,
  type ChannelClaimExtractor,
  type ClaimKind,
  type FoundClaim,
  type RecordedClaim,
} from "./claim-extractor";
import {
  chatMessageIdOf,
  sourcePositionOf,
  type PositionedMessage,
} from "./messages";
import {
  claimEntityType,
  headingAndText,
  rewriteOwnClaim,
  storedClaim,
} from "./own-claims";

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
  /** The claims the pickup wrote, by id: the hash of what it wrote. */
  own: Readonly<Record<string, string>>;
}

export interface ClaimPickupDeps {
  extractor: Pick<ChannelClaimExtractor, "extract">;
  /** Whether insights are picked up beside decisions. */
  insights: boolean;
  entityService: Pick<
    MemoryEntityService,
    "createEntity" | "getEntity" | "listEntities" | "updateEntity"
  >;
  /** The visibility the brain gives memory it makes. */
  visibility: ContentVisibility;
}

/** A decision or insight a batch's messages hold, as its notice announces it. */
export interface PickedUpClaim {
  kind: ClaimKind;
  id: string;
  title: string;
  /** The chat message it was found in, to pin. */
  sourceMessageId: string | undefined;
  /** The hash of what this run wrote; none for one an earlier run wrote. */
  hash: string | undefined;
}

/** One of its own claims a batch's new claim replaced. */
export interface SupersededClaim {
  kind: ClaimKind;
  id: string;
  title: string;
  /** The chat message that overturned it, to pin. */
  sourceMessageId: string | undefined;
  /** The hash it has now, still the pickup's own. */
  hash: string;
}

export interface ClaimPickupResult {
  /** Every claim the messages hold, for the batch's notice. */
  claims: PickedUpClaim[];
  superseded: SupersededClaim[];
}

/** How many of its most recent active claims of each kind the model sees. */
const RECORDED_LIMIT = 30;

/** A system actor, for a message whose speaker was not recorded. */
const UNKNOWN_SPEAKER = {
  kind: "service",
  serviceId: "conversation-memory",
} as const;

/**
 * The conversation's active decisions and insights, newest first, picked up
 * or recorded by hand: what the new messages must not record a second time.
 * One picked up from the range being processed is left out: a run that died
 * after writing it left it unannounced, and it is announced only when found
 * again.
 */
async function activeClaims(
  deps: ClaimPickupDeps,
  conversationId: string,
  from: number,
): Promise<RecordedClaim[]> {
  const options = {
    filter: {
      metadata: { conversationId, status: "active" },
      visibilityScope: deps.visibility,
    },
    sortFields: [{ field: "created" as const, direction: "desc" as const }],
    limit: RECORDED_LIMIT,
  };
  const [decisions, insights] = await Promise.all([
    deps.entityService.listEntities(
      { entityType: DECISION_ENTITY_TYPE, options },
      decisionSchema,
    ),
    deps.entityService.listEntities(
      { entityType: INSIGHT_ENTITY_TYPE, options },
      insightSchema,
    ),
  ]);
  const earlier = (kind: ClaimKind, id: string): boolean =>
    (sourcePositionOf(id, `${flatId(conversationId, kind)}-`) ?? 0) < from;
  return [
    ...decisions.map((entity) => ({ kind: "decision" as const, entity })),
    ...insights.map((entity) => ({ kind: "insight" as const, entity })),
  ]
    .filter(({ kind, entity }) => earlier(kind, entity.id))
    .map(({ kind, entity }) => ({
      id: entity.id,
      kind,
      ...headingAndText(entity.content),
    }));
}

/** A found claim under the id its message gives it: one, two… per message and kind. */
function named(
  conversationId: string,
  claims: FoundClaim[],
): { claim: FoundClaim; id: string }[] {
  return claims.map((claim, index) => ({
    claim,
    id: flatId(
      conversationId,
      claim.kind,
      String(claim.sourcePosition),
      String(
        claims
          .slice(0, index)
          .filter(
            (earlier) =>
              earlier.kind === claim.kind &&
              earlier.sourcePosition === claim.sourcePosition,
          ).length + 1,
      ),
    ),
  }));
}

/** Store a found claim under its id: a decision by who decided it, an insight by who stated it. */
async function writeClaim(
  deps: ClaimPickupDeps,
  origin: ChannelOrigin,
  claim: FoundClaim,
  id: string,
): Promise<void> {
  const speaker = personOf(claim.source);
  const named_ = new Set(
    claim.by.map((person) => JSON.stringify(person.identity)),
  );
  const said = claim.source.timestamp;
  const text = claim.text.trim();
  const content = text ? `# ${claim.title}\n\n${text}` : `# ${claim.title}`;
  const source = {
    ...origin,
    timeRange: { start: said, end: said },
    status: "active" as const,
  };
  // Whoever said it, unless they are already named as deciding or stating it.
  const mentionedBy =
    speaker && !named_.has(JSON.stringify(speaker.identity))
      ? { mentionedBy: [speaker] }
      : {};
  const options = {
    eventContext: { actor: speaker?.identity ?? UNKNOWN_SPEAKER },
  };
  await deps.entityService.createEntity(
    claim.kind === "insight"
      ? {
          entity: {
            id,
            entityType: INSIGHT_ENTITY_TYPE,
            visibility: deps.visibility,
            content,
            metadata: {
              ...source,
              ...(claim.by.length > 0 && { statedBy: claim.by }),
              ...mentionedBy,
            },
          },
          options,
        }
      : {
          entity: {
            id,
            entityType: DECISION_ENTITY_TYPE,
            visibility: deps.visibility,
            content,
            metadata: {
              ...source,
              ...(claim.by.length > 0 && { decidedBy: claim.by }),
              ...mentionedBy,
            },
          },
          options,
        },
  );
}

/**
 * Turn a batch's new messages into decisions and, when insights are picked
 * up, insights, each written once under an id its source message gives it,
 * so a rerun of the range writes nothing twice. The ones this run wrote
 * carry the hash of what it wrote. A claim that overturns one the pickup
 * wrote and nobody has edited supersedes it.
 */
export async function pickUpClaims(
  deps: ClaimPickupDeps,
  batch: ChannelBatch,
): Promise<ClaimPickupResult> {
  const { origin } = batch;
  const from = Math.min(...batch.fresh.map(({ position }) => position));
  const { claims } = await deps.extractor.extract({
    context: batch.context,
    fresh: batch.fresh,
    recorded: await activeClaims(deps, origin.conversationId, from),
    insights: deps.insights,
  });
  const found = named(
    origin.conversationId,
    // An insight is never written while insights are not picked up.
    claims.filter((claim) => claim.kind === "decision" || deps.insights),
  ).filter(({ id }) => !batch.rejected.has(id));
  const picked = await found.reduce<Promise<PickedUpClaim[]>>(
    async (soFar, { claim, id }) => {
      const done = await soFar;
      const sourceMessageId = chatMessageIdOf(claim.source);
      const exists = await storedClaim(deps.entityService, claim.kind, id);
      if (exists) {
        // Announced under the title it was stored with.
        return [
          ...done,
          {
            kind: claim.kind,
            id,
            title: headingAndText(exists.content).title || claim.title,
            sourceMessageId,
            hash: undefined,
          },
        ];
      }
      await writeClaim(deps, origin, claim, id);
      return [
        ...done,
        {
          kind: claim.kind,
          id,
          title: claim.title,
          sourceMessageId,
          hash: (await storedClaim(deps.entityService, claim.kind, id))
            ?.contentHash,
        },
      ];
    },
    Promise.resolve([]),
  );
  // Each replaced claim once, by the latest claim that replaces it.
  const replacements = new Map(
    found.flatMap(({ claim, id }) =>
      claim.replaces && claim.replaces.id !== id
        ? [
            [
              claim.replaces.id,
              { claim, id, replaced: claim.replaces },
            ] as const,
          ]
        : [],
    ),
  );
  const superseded = await [...replacements.values()].reduce<
    Promise<SupersededClaim[]>
  >(async (soFar, { claim, id, replaced }) => {
    const done = await soFar;
    const rewritten = await rewriteOwnClaim(
      deps.entityService,
      batch.own[replaced.id],
      replaced,
      { status: "superseded", supersededBy: id },
    );
    return rewritten
      ? [
          ...done,
          {
            kind: replaced.kind,
            id: replaced.id,
            ...rewritten,
            sourceMessageId: chatMessageIdOf(claim.source),
          },
        ]
      : done;
  }, Promise.resolve([]));
  return { claims: picked, superseded };
}

/** The entity type a kind of claim is stored as, for the pickup's readers. */
export { claimEntityType };
