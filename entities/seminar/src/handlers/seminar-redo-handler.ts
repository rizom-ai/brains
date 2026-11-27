import {
  firstPartyJobHandler,
  type FirstPartyJobHandler,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { readSeminar, seminarRecord } from "../lib/seminar-body";
import { CHAIR, type SeminarMetadata } from "../schemas/seminar";
import {
  CHAIR_FAILED,
  CLOSING_FAILED,
  closingOf,
  exchange,
  type SeminarTurnDeps,
} from "./seminar-hold-handler";

/** Where a redo starts: the chair's turn after the openings, or the closing. */
export const seminarRedoFromSchema: z.ZodEnum<{
  "chair-turn": "chair-turn";
  closing: "closing";
}> = z.enum(["chair-turn", "closing"]);

export type SeminarRedoFrom = z.output<typeof seminarRedoFromSchema>;

export const seminarRedoJobSchema: z.ZodObject<{
  seminar: z.ZodString;
  from: typeof seminarRedoFromSchema;
}> = z.object({
  seminar: z.string().trim().min(1),
  from: seminarRedoFromSchema,
});

export type SeminarRedoJobData = z.output<typeof seminarRedoJobSchema>;

/** A seminar as stored: its id, its body and its fields. */
export interface StoredSeminar {
  id: string;
  entityType: "seminar";
  content: string;
  metadata: SeminarMetadata;
}

export interface SeminarRedoDeps extends SeminarTurnDeps {
  /** The stored seminar under `id`, if there is one. */
  load(id: string): Promise<StoredSeminar | null>;
  /** Store the seminar over the one it was loaded from. */
  save(seminar: StoredSeminar): Promise<void>;
}

export interface SeminarRedoResult {
  seminarId: string;
  from: SeminarRedoFrom;
}

/**
 * Redo a draft seminar from a step of its own. From the chair's turn, the
 * openings stay as the peers gave them and the exchange and the closing are
 * held again; from the closing, every turn stays and the closing is written
 * again. Openings are never redone: a new seminar asks them again. A redo
 * whose step fails changes nothing, and a published seminar is not redone.
 */
export async function redoSeminar(
  deps: SeminarRedoDeps,
  data: SeminarRedoJobData,
): Promise<SeminarRedoResult> {
  const stored = await deps.load(data.seminar);
  if (!stored) throw new Error(`No seminar ${data.seminar}`);
  const { frontmatter, turns } = readSeminar(stored);
  if (frontmatter.status !== "draft") {
    throw new Error(`Seminar ${data.seminar} is published and is not redone`);
  }
  const asked = {
    question: frontmatter.question,
    language: frontmatter.language,
  };

  const held = async (): Promise<typeof turns> => {
    if (data.from === "closing") return turns;
    const openings = turns.filter(({ round }) => round === "opening");
    const exchanged = await exchange(
      deps,
      asked,
      openings.map(({ speaker, name }) => ({ id: speaker, name })),
      openings,
    );
    if (exchanged.length === 0) {
      throw new Error(
        `Seminar ${data.seminar} has fewer than two openings, so no exchange to redo`,
      );
    }
    const [first] = exchanged;
    if (first?.speaker === CHAIR && first.failed !== undefined)
      throw new Error(CHAIR_FAILED);
    return [...openings, ...exchanged];
  };
  const next = await held();
  const closing = await closingOf(deps, asked, next);
  if (data.from === "closing" && !closing) throw new Error(CLOSING_FAILED);

  await deps.save({
    ...stored,
    ...seminarRecord(frontmatter, {
      turns: next,
      ...(closing ? { closing } : {}),
    }),
  });
  return { seminarId: stored.id, from: data.from };
}

/** The job the hold tool queues to redo a draft, run as the package. */
export function seminarRedoJob(deps: SeminarRedoDeps): FirstPartyJobHandler {
  return firstPartyJobHandler<SeminarRedoJobData>({
    type: "redo",
    input: seminarRedoJobSchema,
    summarize: (data) => ({ seminar: data.seminar, from: data.from }),
    process: ({ input }) => redoSeminar(deps, input),
  });
}
