import {
  toSdkError,
  type A2APeerAnswer,
  type SourceCitation,
} from "@brains/contracts";
import type { StoredSource } from "@brains/content-formatters";
import {
  firstPartyJobHandler,
  type FirstPartyJobHandler,
} from "@brains/sdk/internal/service-runtime";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { openingMessage } from "../lib/messages";
import { seminarRecord } from "../lib/seminar-body";
import type { SeminarMetadata, SeminarTurn } from "../schemas/seminar";

export const seminarHoldJobSchema: z.ZodObject<{
  question: z.ZodString;
  language: z.ZodString;
}> = z.object({
  question: z.string().trim().min(1),
  language: z.string().trim().min(1),
});

export type SeminarHoldJobData = z.output<typeof seminarHoldJobSchema>;

/** A peer a seminar is held with: an approved agent of the directory. */
export interface SeminarPeer {
  /** The agent's id: its domain. */
  id: string;
  name: string;
}

export interface SeminarHoldResult {
  seminarId: string;
  /** The peers whose openings the seminar keeps. */
  answered: string[];
  /** The peers recorded as not answering. */
  failed: string[];
}

export interface SeminarHoldDeps {
  /** The approved peers of the directory. */
  peers(): Promise<SeminarPeer[]>;
  /** One peer's completed answer to a turn; a failure throws its reason. */
  askTurn(agent: string, message: string): Promise<A2APeerAnswer>;
  /** Whether a seminar is stored under `id`. */
  exists(id: string): Promise<boolean>;
  /** Store a new seminar; its id. */
  create(seminar: {
    id: string;
    entityType: "seminar";
    content: string;
    metadata: SeminarMetadata;
  }): Promise<string>;
  /** Today's date, as `asked` states it. */
  today(): string;
}

/** A source as a turn lists it: its reference, its title and its address. */
function turnSource(source: SourceCitation): StoredSource {
  const url = z.url().safeParse(source.url);
  return {
    id: source.id,
    title: source.title ?? source.id,
    ...(url.success ? { url: url.data } : {}),
  };
}

/** One peer's opening, verbatim with its sources, or why there is none. */
async function opening(
  deps: SeminarHoldDeps,
  peer: SeminarPeer,
  message: string,
): Promise<SeminarTurn> {
  const turn = { round: "opening", speaker: peer.id, name: peer.name } as const;
  try {
    const answer = await deps.askTurn(peer.id, message);
    const sources = answer.sources.map(turnSource);
    return {
      ...turn,
      text: answer.response.trim(),
      ...(sources.length > 0 ? { sources } : {}),
    };
  } catch (error) {
    // The seminar is read by others: the failure's public form only.
    return { ...turn, failed: toSdkError(error).toJSON().message };
  }
}

/** The first of `slug`, `slug-2`, `slug-3`… that no seminar holds. */
async function freeId(
  deps: SeminarHoldDeps,
  slug: string,
  attempt = 1,
): Promise<string> {
  const id = attempt === 1 ? slug : `${slug}-${attempt}`;
  return (await deps.exists(id)) ? freeId(deps, slug, attempt + 1) : id;
}

/**
 * Hold a seminar of openings: put the question to every approved peer at
 * once, and store each opening as the peer gave it. A peer that fails is
 * recorded with its reason and the seminar goes on without him; with no
 * opening at all there is no seminar. It is stored as a draft.
 */
export async function holdSeminar(
  deps: SeminarHoldDeps,
  data: SeminarHoldJobData,
): Promise<SeminarHoldResult> {
  const peers = [...(await deps.peers())].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (peers.length === 0)
    throw new Error("A seminar needs peers, and no approved peer is saved");

  const message = openingMessage(data.question, data.language);
  const turns = await Promise.all(
    peers.map((peer) => opening(deps, peer, message)),
  );
  const answered = turns.filter((turn) => turn.text !== undefined);
  const failed = turns.filter((turn) => turn.failed !== undefined);
  if (answered.length === 0) {
    throw new Error(
      `No peer answered: ${failed.map((turn) => turn.failed).join("; ")}`,
    );
  }

  const id = await freeId(deps, slugify(data.question));
  const seminarId = await deps.create({
    id,
    entityType: "seminar",
    ...seminarRecord(
      {
        question: data.question,
        asked: deps.today(),
        status: "draft",
        language: data.language,
      },
      { turns },
    ),
  });
  return {
    seminarId,
    answered: answered.map((turn) => turn.speaker),
    failed: failed.map((turn) => turn.speaker),
  };
}

/**
 * The job the hold tool queues, run as the package: nobody is attributed
 * and no action policy is checked, so the seminar it writes is one nobody
 * may create or edit by hand.
 */
export function seminarHoldJob(deps: SeminarHoldDeps): FirstPartyJobHandler {
  return firstPartyJobHandler<SeminarHoldJobData>({
    type: "hold",
    input: seminarHoldJobSchema,
    summarize: (data) => ({ question: data.question }),
    process: ({ input }) => holdSeminar(deps, input),
  });
}
