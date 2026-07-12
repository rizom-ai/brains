import { z } from "@brains/utils/zod";
import cardLexiconJson from "./lexicons/ai.rizom.brain.card.json";
import deckLexiconJson from "./lexicons/ai.rizom.brain.deck.json";
import linkLexiconJson from "./lexicons/ai.rizom.brain.link.json";
import noteLexiconJson from "./lexicons/ai.rizom.brain.note.json";
import postLexiconJson from "./lexicons/ai.rizom.brain.post.json";
import projectLexiconJson from "./lexicons/ai.rizom.brain.project.json";
import seriesLexiconJson from "./lexicons/ai.rizom.brain.series.json";
import socialPostLexiconJson from "./lexicons/ai.rizom.brain.socialPost.json";
import topicLexiconJson from "./lexicons/ai.rizom.brain.topic.json";

export interface AtprotoLexiconProperty {
  type: string;
  [key: string]: unknown;
}

export interface AtprotoLexiconRecordDef {
  type: "record";
  key: string;
  record: {
    type: "object";
    required?: string[] | undefined;
    properties: Record<string, AtprotoLexiconProperty>;
  };
}

export interface AtprotoLexicon {
  lexicon: 1;
  id: string;
  defs: {
    main: AtprotoLexiconRecordDef;
  };
}

const atprotoLexiconPropertySchema = z
  .object({ type: z.string() })
  .catchall(z.unknown());

const atprotoLexiconSchema = z.object({
  lexicon: z.literal(1),
  id: z.string(),
  defs: z.object({
    main: z.object({
      type: z.literal("record"),
      key: z.string().min(1),
      record: z.object({
        type: z.literal("object"),
        required: z.array(z.string()).optional(),
        properties: z.record(z.string(), atprotoLexiconPropertySchema),
      }),
    }),
  }),
});

export function parseAtprotoLexicon(input: unknown): AtprotoLexicon {
  return atprotoLexiconSchema.parse(input);
}

export type CanonicalAtprotoLexiconId =
  | "ai.rizom.brain.card"
  | "ai.rizom.brain.deck"
  | "ai.rizom.brain.link"
  | "ai.rizom.brain.note"
  | "ai.rizom.brain.post"
  | "ai.rizom.brain.project"
  | "ai.rizom.brain.series"
  | "ai.rizom.brain.socialPost"
  | "ai.rizom.brain.topic";

export const canonicalAtprotoLexicons: Record<
  CanonicalAtprotoLexiconId,
  AtprotoLexicon
> = {
  "ai.rizom.brain.card": parseAtprotoLexicon(cardLexiconJson),
  "ai.rizom.brain.deck": parseAtprotoLexicon(deckLexiconJson),
  "ai.rizom.brain.link": parseAtprotoLexicon(linkLexiconJson),
  "ai.rizom.brain.note": parseAtprotoLexicon(noteLexiconJson),
  "ai.rizom.brain.post": parseAtprotoLexicon(postLexiconJson),
  "ai.rizom.brain.project": parseAtprotoLexicon(projectLexiconJson),
  "ai.rizom.brain.series": parseAtprotoLexicon(seriesLexiconJson),
  "ai.rizom.brain.socialPost": parseAtprotoLexicon(socialPostLexiconJson),
  "ai.rizom.brain.topic": parseAtprotoLexicon(topicLexiconJson),
};

export type AtprotoLexiconStatus = "draft" | "approved" | "deprecated";

export interface AtprotoLexiconMetadata {
  id: CanonicalAtprotoLexiconId;
  status: AtprotoLexiconStatus;
  version: string;
  revision: number;
  owner: string;
  steward: string;
  projectionPackage: string;
  compatibility: string;
  replacedBy?: CanonicalAtprotoLexiconId | undefined;
  deprecatedBy?: CanonicalAtprotoLexiconId | undefined;
}

const approvedCompatibilityPolicy =
  "Additive optional fields are compatible; required-field, type, or constraint changes require a migration plan or new NSID.";

function approvedLexiconMetadata(
  projectionPackage: string,
): Omit<AtprotoLexiconMetadata, "id"> {
  return {
    status: "approved",
    version: "1.0.0",
    revision: 1,
    owner: "Rizom",
    steward: "Rizom protocol registry",
    projectionPackage,
    compatibility: approvedCompatibilityPolicy,
  };
}

export const canonicalAtprotoLexiconMetadata: Record<
  CanonicalAtprotoLexiconId,
  Omit<AtprotoLexiconMetadata, "id">
> = {
  "ai.rizom.brain.card": approvedLexiconMetadata("@brains/atproto"),
  "ai.rizom.brain.deck": approvedLexiconMetadata("@brains/decks"),
  "ai.rizom.brain.link": approvedLexiconMetadata("@brains/link"),
  "ai.rizom.brain.note": approvedLexiconMetadata("@brains/note"),
  "ai.rizom.brain.post": approvedLexiconMetadata("@brains/blog"),
  "ai.rizom.brain.project": approvedLexiconMetadata("@brains/portfolio"),
  "ai.rizom.brain.series": approvedLexiconMetadata("@brains/series"),
  "ai.rizom.brain.socialPost": approvedLexiconMetadata("@brains/social-media"),
  "ai.rizom.brain.topic": approvedLexiconMetadata("@brains/topics"),
} satisfies Record<
  CanonicalAtprotoLexiconId,
  Omit<AtprotoLexiconMetadata, "id">
>;

export function listCanonicalAtprotoLexicons(): AtprotoLexicon[] {
  return Object.values(canonicalAtprotoLexicons);
}

export function getCanonicalAtprotoLexicon(
  id: string,
): AtprotoLexicon | undefined {
  if (!(id in canonicalAtprotoLexicons)) return undefined;
  return canonicalAtprotoLexicons[id as CanonicalAtprotoLexiconId];
}

export function getCanonicalAtprotoLexiconMetadata(
  id: string,
): AtprotoLexiconMetadata | undefined {
  if (!(id in canonicalAtprotoLexiconMetadata)) return undefined;
  const canonicalId = id as CanonicalAtprotoLexiconId;
  return {
    id: canonicalId,
    ...canonicalAtprotoLexiconMetadata[canonicalId],
  };
}

export function listCanonicalAtprotoLexiconMetadata(): AtprotoLexiconMetadata[] {
  return Object.entries(canonicalAtprotoLexiconMetadata).map(
    ([id, metadata]) => ({
      id: id as CanonicalAtprotoLexiconId,
      ...metadata,
    }),
  );
}
