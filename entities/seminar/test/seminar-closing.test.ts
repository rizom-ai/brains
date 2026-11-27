import { describe, expect, it } from "bun:test";
import type { A2APeerAnswer } from "@brains/contracts";
import {
  holdSeminar,
  type SeminarHoldDeps,
} from "../src/handlers/seminar-hold-handler";
import {
  chairClosingPrompt,
  checkedClosing,
  type ChairClosing,
  type ChairClosingInput,
} from "../src/lib/chair";
import {
  readSeminar,
  readSeminarBody,
  seminarBody,
} from "../src/lib/seminar-body";

const QUESTION = "What is religion?";

const SOURCES: Record<string, A2APeerAnswer["sources"]> = {
  "friedrich.example": [
    {
      id: "book-section:jgb/61",
      title: "JGB-III-61",
      source: "book-section",
      url: "https://friedrich.example/books/jgb/61",
    },
  ],
  "karl.example": [
    {
      id: "book-section:einleitung/1",
      title: "Einleitung, 71",
      source: "book-section",
      url: "https://karl.example/books/einleitung/1",
    },
  ],
};

const CLOSING: ChairClosing = {
  text: "Both hold that religion answers a need it did not create; they part on whose need it is.",
  cites: ["book-section:einleitung/1"],
};

interface Held {
  closings: ChairClosingInput[];
  stored: Array<{ content: string; metadata: Record<string, unknown> }>;
}

async function held(
  closing: () => Promise<ChairClosing> = async (): Promise<ChairClosing> =>
    CLOSING,
  peers = ["friedrich.example", "karl.example"],
): Promise<Held> {
  const closings: ChairClosingInput[] = [];
  const stored: Held["stored"] = [];
  const deps: SeminarHoldDeps = {
    peers: async () =>
      peers.map((id) => ({
        id,
        name: id.startsWith("karl") ? "Karl" : "Friedrich",
      })),
    askTurn: async (agent): Promise<A2APeerAnswer> => ({
      state: "completed",
      response: `${agent} speaks.`,
      sources: SOURCES[agent] ?? [],
    }),
    chair: {
      challenge: async () => ({
        stands: "karl.example",
        reading: "Karl stands.",
        followUps: [{ agent: "friedrich.example", followUp: "Answer him." }],
      }),
      rejoinder: async () => "How do you answer him?",
      closing: async (input): Promise<ChairClosing> => {
        closings.push(input);
        return closing();
      },
    },
    exists: async () => false,
    create: async (seminar): Promise<string> => {
      stored.push(seminar);
      return seminar.id;
    },
    today: () => "2026-11-27",
  };
  await holdSeminar(deps, { question: QUESTION, language: "English" });
  return { closings, stored };
}

describe("where they meet", () => {
  it("closes the seminar with the chair's paragraph and the sources it relies on", async () => {
    const { stored } = await held();
    const [seminar] = stored;
    if (!seminar) throw new Error("no seminar written");

    expect(readSeminar(seminar).closing).toEqual({
      text: CLOSING.text,
      sources: [
        {
          id: "book-section:einleitung/1",
          title: "Einleitung, 71",
          url: "https://karl.example/books/einleitung/1",
        },
      ],
    });
    expect(seminar.content).toContain(
      `## Where they meet\n\n${CLOSING.text}\n\n### Sources\n\n- [Einleitung, 71](https://karl.example/books/einleitung/1 "book-section:einleitung/1")`,
    );
  });

  it("gives the chair every answered turn and every source the turns carry", async () => {
    const { closings } = await held();

    expect(closings).toHaveLength(1);
    expect(
      closings[0]?.turns.map(({ agent, round }) => [round, agent]),
    ).toEqual([
      ["opening", "friedrich.example"],
      ["opening", "karl.example"],
      ["challenge", "friedrich.example"],
      ["rejoinder", "karl.example"],
    ]);
    expect(closings[0]?.sources.map(({ id }) => id)).toEqual([
      "book-section:jgb/61",
      "book-section:einleitung/1",
    ]);
  });

  it("keeps the seminar without a closing when the chair cites what no turn carries", async () => {
    const { stored } = await held(async () => ({
      ...CLOSING,
      cites: ["book-section:somewhere/else"],
    }));
    const [seminar] = stored;
    if (!seminar) throw new Error("no seminar written");

    const read = readSeminar(seminar);
    expect(read.closing).toBeUndefined();
    expect(read.turns.at(-1)?.round).toBe("rejoinder");
  });

  it("keeps the seminar without a closing when the chair cannot write one", async () => {
    const { stored } = await held(async () => {
      throw new Error("model unavailable");
    });
    const [seminar] = stored;
    if (!seminar) throw new Error("no seminar written");

    expect(readSeminar(seminar).closing).toBeUndefined();
  });

  it("writes no closing over a single opening", async () => {
    const { closings, stored } = await held(undefined, ["karl.example"]);
    const [seminar] = stored;
    if (!seminar) throw new Error("no seminar written");

    expect(closings).toEqual([]);
    expect(readSeminar(seminar).closing).toBeUndefined();
  });

  it("reads back the bytes it wrote, closing and all", async () => {
    const { stored } = await held();
    const body = stored[0]?.content ?? "";
    expect(seminarBody(readSeminarBody(body))).toBe(body);
  });
});

describe("the chair's closing, checked", () => {
  const sources = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
  ];

  it("keeps the sources it cites, in the turns' order", () => {
    expect(
      checkedClosing({ text: "T", cites: ["b", "a", "a"] }, sources),
    ).toEqual({
      text: "T",
      sources,
    });
  });

  it("states no sources when it cites none", () => {
    expect(checkedClosing({ text: "T", cites: [] }, sources)).toEqual({
      text: "T",
    });
  });

  it("refuses a source no turn carries", () => {
    expect(() => checkedClosing({ text: "T", cites: ["c"] }, sources)).toThrow(
      "cites a source no turn carries: c",
    );
  });

  it("tells the chair to draw only on the turns and lists the sources it may cite", () => {
    const prompt = chairClosingPrompt({
      question: QUESTION,
      language: "Dutch",
      turns: [
        {
          round: "opening",
          agent: "karl.example",
          name: "Karl",
          text: "Opium.",
        },
      ],
      sources,
    });
    expect(prompt).toContain("### Karl, opening (id: karl.example)\n\nOpium.");
    expect(prompt).toContain("- a: A\n- b: B");
    expect(prompt).toContain("Write in Dutch");
    expect(prompt).toContain("cite no other");
  });
});
