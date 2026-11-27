import { describe, expect, it } from "bun:test";
import type { A2APeerAnswer } from "@brains/contracts";
import {
  redoSeminar,
  type SeminarRedoDeps,
  type StoredSeminar,
} from "../src/handlers/seminar-redo-handler";
import type { ChairChallenge, ChairClosing } from "../src/lib/chair";
import { readSeminar, seminarRecord } from "../src/lib/seminar-body";
import type { SeminarStatus, SeminarTurn } from "../src/schemas/seminar";

const ID = "what-is-religion";

const openings: SeminarTurn[] = [
  {
    round: "opening",
    speaker: "friedrich.example",
    name: "Friedrich",
    text: "Religion differs by rank.",
  },
  {
    round: "opening",
    speaker: "karl.example",
    name: "Karl",
    text: "Religion is a social product.",
    sources: [
      {
        id: "book-section:einleitung/1",
        title: "Einleitung, 71",
        url: "https://karl.example/books/einleitung/1",
      },
    ],
  },
];

const firstExchange: SeminarTurn[] = [
  {
    round: "challenge",
    speaker: "chair",
    name: "Chair",
    to: ["friedrich.example"],
    text: "Karl stands (first reading).",
  },
  {
    round: "challenge",
    speaker: "chair",
    name: "Chair",
    to: ["friedrich.example"],
    text: "Answer him (first).",
  },
  {
    round: "challenge",
    speaker: "friedrich.example",
    name: "Friedrich",
    to: ["karl.example"],
    text: "My first challenge.",
  },
];

function seminarOf(status: SeminarStatus = "draft"): StoredSeminar {
  return {
    id: ID,
    entityType: "seminar",
    ...seminarRecord(
      {
        question: "What is religion?",
        asked: "2026-11-27",
        status,
        language: "English",
      },
      {
        turns: [...openings, ...firstExchange],
        closing: { text: "The first closing." },
      },
    ),
  };
}

interface Redone {
  deps: SeminarRedoDeps;
  asked: string[];
  saved: StoredSeminar[];
}

function redoing(
  options: {
    stored?: StoredSeminar | null;
    challenge?: () => Promise<ChairChallenge>;
    closing?: () => Promise<ChairClosing>;
  } = {},
): Redone {
  const asked: string[] = [];
  const saved: StoredSeminar[] = [];
  return {
    asked,
    saved,
    deps: {
      load: async () =>
        options.stored === undefined ? seminarOf() : options.stored,
      save: async (seminar): Promise<void> => {
        saved.push(seminar);
      },
      askTurn: async (agent): Promise<A2APeerAnswer> => {
        asked.push(agent);
        return {
          state: "completed",
          response: `${agent} answers again.`,
          sources: [],
        };
      },
      chair: {
        challenge:
          options.challenge ??
          (async (): Promise<ChairChallenge> => ({
            stands: "friedrich.example",
            reading: "Friedrich stands (second reading).",
            followUps: [{ agent: "karl.example", followUp: "Answer him." }],
          })),
        rejoinder: async (): Promise<string> => "How do you answer him?",
        closing:
          options.closing ??
          (async (): Promise<ChairClosing> => ({
            text: "The second closing.",
            cites: [1],
          })),
      },
    },
  };
}

describe("redoing a draft seminar", () => {
  it("from the closing: keeps every turn and writes the closing again", async () => {
    const { deps, saved, asked } = redoing();

    const result = await redoSeminar(deps, { seminar: ID, from: "closing" });

    expect(result).toEqual({ seminarId: ID, from: "closing" });
    expect(asked).toEqual([]);
    const [seminar] = saved;
    if (!seminar) throw new Error("nothing saved");
    const read = readSeminar(seminar);
    expect(read.turns).toEqual([...openings, ...firstExchange]);
    expect(read.closing).toEqual({
      text: "The second closing.",
      sources: openings[1]?.sources,
    });
    expect(seminar.metadata).toEqual(seminarOf().metadata);
  });

  it("from the chair's turn: keeps the openings as they were and holds the exchange again", async () => {
    const { deps, saved, asked } = redoing();

    await redoSeminar(deps, { seminar: ID, from: "chair-turn" });

    const [seminar] = saved;
    if (!seminar) throw new Error("nothing saved");
    const read = readSeminar(seminar);
    expect(read.turns.slice(0, 2)).toEqual(openings);
    expect(
      read.turns.slice(2).map(({ round, speaker }) => [round, speaker]),
    ).toEqual([
      ["challenge", "chair"],
      ["challenge", "chair"],
      ["challenge", "karl.example"],
      ["rejoinder", "chair"],
      ["rejoinder", "friedrich.example"],
    ]);
    // No opening is asked again: only the challenger and the one who stands.
    expect(asked).toEqual(["karl.example", "friedrich.example"]);
    expect(read.closing?.text).toBe("The second closing.");
  });

  it("changes nothing when the chair cannot take its turn", async () => {
    const { deps, saved } = redoing({
      challenge: async () => {
        throw new Error("model unavailable");
      },
    });

    expect(
      redoSeminar(deps, { seminar: ID, from: "chair-turn" }),
    ).rejects.toThrow("The chair could not take its turn");
    expect(saved).toEqual([]);
  });

  it("changes nothing when the chair cannot write the closing", async () => {
    const { deps, saved } = redoing({
      closing: async () => ({ text: "T", cites: [7] }),
    });

    expect(redoSeminar(deps, { seminar: ID, from: "closing" })).rejects.toThrow(
      "The chair could not write the closing",
    );
    expect(saved).toEqual([]);
  });

  it("refuses a published seminar", async () => {
    const { deps, saved } = redoing({ stored: seminarOf("published") });

    expect(redoSeminar(deps, { seminar: ID, from: "closing" })).rejects.toThrow(
      "is published and is not redone",
    );
    expect(saved).toEqual([]);
  });

  it("refuses a seminar that is not there", async () => {
    const { deps } = redoing({ stored: null });

    expect(
      redoSeminar(deps, { seminar: "nowhere", from: "closing" }),
    ).rejects.toThrow("No seminar nowhere");
  });
});
