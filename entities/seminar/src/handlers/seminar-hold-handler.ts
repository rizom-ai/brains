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
import {
  checkedChallenge,
  checkedClosing,
  type ChairReading,
  type SeminarChair,
} from "../lib/chair";
import {
  challengeMessage,
  openingMessage,
  rejoinderMessage,
} from "../lib/messages";
import { seminarRecord } from "../lib/seminar-body";
import {
  CHAIR,
  type SeminarClosing,
  type SeminarMetadata,
  type SeminarRound,
  type SeminarTurn,
} from "../schemas/seminar";

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
  /** The peers recorded as giving no opening. */
  failed: string[];
}

/** What taking a turn needs: a peer to ask, and the chair. */
export interface SeminarTurnDeps {
  /** One peer's completed answer to a turn; a failure throws its reason. */
  askTurn(agent: string, message: string): Promise<A2APeerAnswer>;
  /** The chair's own turns, written by this brain. */
  chair: SeminarChair;
  /**
   * Why a step of the chair's failed, for the job's log: the seminar itself
   * says only that it did.
   */
  warn?(message: string, error: unknown): void;
}

export interface SeminarHoldDeps extends SeminarTurnDeps {
  /** The approved peers of the directory. */
  peers(): Promise<SeminarPeer[]>;
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

/** One peer's turn, verbatim with its sources, or why there is none. */
async function peerTurn(
  deps: SeminarTurnDeps,
  peer: SeminarPeer,
  round: SeminarRound,
  message: string,
  to?: string[],
): Promise<SeminarTurn> {
  const turn = {
    round,
    speaker: peer.id,
    name: peer.name,
    ...(to && to.length > 0 ? { to } : {}),
  };
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

/** A turn the chair took: what it wrote, and whom it addressed. */
function chairTurn(
  round: SeminarRound,
  to: string[],
  text: string,
): SeminarTurn {
  return { round, speaker: CHAIR, name: CHAIR_NAME, to, text };
}

const CHAIR_NAME = "Chair";

/** What a failed chair's turn says; its diagnostic stays in the job's log. */
export const CHAIR_FAILED = "The chair could not take its turn";

/** What a redo of the closing says when the chair writes none. */
export const CLOSING_FAILED = "The chair could not write the closing";

/** An answered turn as the chair and the later messages read it. */
function reading(turn: SeminarTurn & { text: string }): ChairReading {
  return { agent: turn.speaker, name: turn.name, text: turn.text };
}

function answered(
  turns: readonly SeminarTurn[],
): Array<SeminarTurn & { text: string }> {
  return turns.flatMap((turn) =>
    turn.text === undefined ? [] : [{ ...turn, text: turn.text }],
  );
}

/**
 * The exchange that follows the openings. The chair reads them and decides
 * who stands; every other participant is given that opening and his own
 * follow-up, at once; the one who stood is given their challenges and
 * answers them. A challenger who fails is recorded and left out of the
 * rejoinder, and with no challenge there is none. A chair that cannot take
 * its turn ends the exchange where it stands, recorded.
 */
export async function exchange(
  deps: SeminarTurnDeps,
  data: SeminarHoldJobData,
  peers: readonly SeminarPeer[],
  openings: readonly SeminarTurn[],
): Promise<SeminarTurn[]> {
  const participants = answered(openings);
  if (participants.length < 2) return [];
  const peerOf = (agent: string): SeminarPeer => {
    const peer = peers.find((candidate) => candidate.id === agent);
    if (!peer) throw new Error(`No peer ${agent}`);
    return peer;
  };
  const failedChair = (round: SeminarRound): SeminarTurn => ({
    round,
    speaker: CHAIR,
    name: CHAIR_NAME,
    failed: CHAIR_FAILED,
  });

  const read = participants.map(reading);
  const challenge = await deps.chair
    .challenge({
      question: data.question,
      language: data.language,
      openings: read,
    })
    .then((taken) => checkedChallenge(taken, read))
    .catch((error: unknown) => {
      deps.warn?.(CHAIR_FAILED, error);
      return undefined;
    });
  if (!challenge) return [failedChair("challenge")];

  const stands = read.find(({ agent }) => agent === challenge.stands);
  if (!stands) return [failedChair("challenge")];
  const challengers = challenge.followUps.map(({ agent }) => agent);
  const chairTurns = [
    chairTurn("challenge", challengers, challenge.reading),
    ...challenge.followUps.map(({ agent, followUp }) =>
      chairTurn("challenge", [agent], followUp),
    ),
  ];
  const challenges = await Promise.all(
    challenge.followUps.map(({ agent, followUp }) =>
      peerTurn(
        deps,
        peerOf(agent),
        "challenge",
        challengeMessage({
          question: data.question,
          stands,
          followUp,
          language: data.language,
        }),
        [stands.agent],
      ),
    ),
  );
  const exchanged = [...chairTurns, ...challenges];

  const made = answered(challenges).map(reading);
  if (made.length === 0) return exchanged;
  const followUp = await deps.chair
    .rejoinder({
      question: data.question,
      language: data.language,
      stands,
      challenges: made,
    })
    .catch((error: unknown) => {
      deps.warn?.(CHAIR_FAILED, error);
      return undefined;
    });
  if (followUp === undefined) return [...exchanged, failedChair("rejoinder")];
  const to = made.map(({ agent }) => agent);
  return [
    ...exchanged,
    chairTurn("rejoinder", [stands.agent], followUp),
    await peerTurn(
      deps,
      peerOf(stands.agent),
      "rejoinder",
      rejoinderMessage({
        question: data.question,
        opening: stands.text,
        challenges: made,
        followUp,
        language: data.language,
      }),
      to,
    ),
  ];
}

/**
 * Where they meet: the chair's paragraph over every turn a participant
 * answered, citing only sources those turns carry. With fewer than two
 * openings nobody meets; a chair that cannot write it, or cites what no
 * turn carries, leaves the seminar without one.
 */
export async function closingOf(
  deps: SeminarTurnDeps,
  data: SeminarHoldJobData,
  turns: readonly SeminarTurn[],
): Promise<SeminarClosing | undefined> {
  const spoken = answered(turns).filter(({ speaker }) => speaker !== CHAIR);
  if (spoken.filter(({ round }) => round === "opening").length < 2)
    return undefined;
  const sources = spoken
    .flatMap((turn) => turn.sources ?? [])
    .filter(
      (source, index, all) =>
        all.findIndex(({ id }) => id === source.id) === index,
    );
  return deps.chair
    .closing({
      question: data.question,
      language: data.language,
      turns: spoken.map((turn) => ({ ...reading(turn), round: turn.round })),
      sources,
    })
    .then((written) => checkedClosing(written, sources))
    .catch((error: unknown) => {
      deps.warn?.(CLOSING_FAILED, error);
      return undefined;
    });
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
 * Hold a seminar: put the question to every approved peer at once and store
 * each opening as the peer gave it, then the exchange that follows and
 * where they meet. A peer
 * that fails is recorded with its reason and the seminar goes on without
 * him; with no opening at all there is no seminar. It is stored as a draft.
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
  const openings = await Promise.all(
    peers.map((peer) => peerTurn(deps, peer, "opening", message)),
  );
  const opened = openings.filter((turn) => turn.text !== undefined);
  const failed = openings.filter((turn) => turn.failed !== undefined);
  if (opened.length === 0) {
    throw new Error(
      `No peer answered: ${failed.map((turn) => turn.failed).join("; ")}`,
    );
  }

  const turns = [...openings, ...(await exchange(deps, data, peers, openings))];
  const closing = await closingOf(deps, data, turns);
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
      { turns, ...(closing ? { closing } : {}) },
    ),
  });
  return {
    seminarId,
    answered: opened.map((turn) => turn.speaker),
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
