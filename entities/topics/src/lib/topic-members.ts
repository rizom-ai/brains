import type { ContentVisibility } from "@brains/sdk/internal/service-runtime";
import { generateIdFromText } from "@brains/utils/string-utils";
import type { z } from "@brains/utils/zod";
import type { collectionMembersContract } from "@brains/contracts";
import { TOPIC_ENTITY_TYPE } from "./constants";
import type { SourceRef } from "./topic-extraction-decisions";

type MembersContract = typeof collectionMembersContract;
type MembersRequest = z.output<MembersContract["schema"]>;
type MembersResponse = z.input<MembersContract["response"]>;
type CountedSource = Pick<SourceRef, "key" | "contentHash">;

/** The most members one topic answers with; the contract bounds it. */
const MEMBER_LIMIT = 1000;

export interface TopicMembersOptions {
  /** The topics visible at this scope, by id and title. */
  listTopics: (
    visibilityScope: ContentVisibility,
  ) => Promise<{ id: string; title: string }[]>;
  /** The sources visible at this scope that extraction reads. */
  readSources: (visibilityScope: ContentVisibility) => Promise<CountedSource[]>;
  /** The sources supporting each topic slug, from extraction's votes. */
  sourcesBySlug: (
    sources: readonly CountedSource[],
  ) => Promise<ReadonlyMap<string, readonly string[]>>;
}

/** A source key is `type:id`; an id may itself hold a colon. */
function memberOf(key: string): { entityType: string; id: string } | null {
  const at = key.indexOf(":");
  return at > 0 && at < key.length - 1
    ? { entityType: key.slice(0, at), id: key.slice(at + 1) }
    : null;
}

/**
 * Which entries belong to the asked topics: the visible sources whose
 * current extraction votes support each one, counted as the topic
 * distribution counts them. A topic the asker cannot see is left out.
 */
export async function answerTopicMembers(
  request: MembersRequest,
  options: TopicMembersOptions,
): Promise<MembersResponse> {
  if (request.entityType !== TOPIC_ENTITY_TYPE) return { collections: [] };
  const asked = new Set(request.ids);
  const topics = (await options.listTopics(request.visibilityScope)).filter(
    (topic) => asked.has(topic.id),
  );
  if (topics.length === 0) return { collections: [] };
  const bySlug = await options.sourcesBySlug(
    await options.readSources(request.visibilityScope),
  );
  return {
    collections: topics.map((topic) => ({
      id: topic.id,
      members: (bySlug.get(generateIdFromText(topic.title)) ?? [])
        .slice(0, MEMBER_LIMIT)
        .flatMap((key) => memberOf(key) ?? []),
    })),
  };
}
