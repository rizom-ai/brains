import { describe, expect, it } from "bun:test";
import { SdkError, type A2APeerAnswer } from "@brains/contracts";
import {
  holdSeminar,
  type SeminarHoldDeps,
  type SeminarPeer,
} from "../src/handlers/seminar-hold-handler";
import type { ChairChallenge } from "../src/lib/chair";
import { closingLines } from "../src/lib/messages";
import { readSeminar } from "../src/lib/seminar-body";

const QUESTION = "What should a community remember, and what should it forget?";

const peers: SeminarPeer[] = [
  { id: "friedrich.example", name: "Friedrich" },
  { id: "karl.example", name: "Karl" },
  { id: "sigmund.example", name: "Sigmund" },
];

const OPENINGS: Record<string, string> = {
  "friedrich.example": "Zu allem Handeln gehört Vergessen.",
  "karl.example": "History is each generation working on what it inherits.",
  "sigmund.example": "My passages concern only individual memory.",
};

const challenge: ChairChallenge = {
  stands: "friedrich.example",
  reading:
    "Only Friedrich answered the question as asked, so he stands and the other two answer him.",
  followUps: [
    {
      agent: "karl.example",
      followUp:
        "Friedrich says a people must know when to forget. How does your Achtzehnte Brumaire answer him?",
    },
    {
      agent: "sigmund.example",
      followUp:
        "Der Mann Moses writes of the tradition of a whole people. Can a people forget at all?",
    },
  ],
};

const REJOINDER_FOLLOW_UP =
  "Karl says the dead must be buried; Sigmund says a people cannot forget. How do you answer them from Vom Nutzen und Nachtheil der Historie?";

interface Room {
  deps: SeminarHoldDeps;
  asked: Array<{ agent: string; message: string }>;
  chaired: string[];
  stored: Array<{ content: string; metadata: Record<string, unknown> }>;
  /** The titles of the notes the chair was given. */
  read: string[];
}

function room(
  options: {
    answer?: (agent: string, message: string) => A2APeerAnswer;
    challenge?: () => Promise<ChairChallenge>;
    notes?: SeminarHoldDeps["notes"];
  } = {},
): Room {
  const asked: Room["asked"] = [];
  const chaired: string[] = [];
  const stored: Room["stored"] = [];
  const read: string[] = [];
  const reply = (response: string): A2APeerAnswer => ({
    state: "completed",
    response,
    sources: [],
  });
  return {
    asked,
    chaired,
    stored,
    read,
    deps: {
      peers: async (): Promise<SeminarPeer[]> => peers,
      askTurn: async (agent, message): Promise<A2APeerAnswer> => {
        asked.push({ agent, message });
        if (options.answer) return options.answer(agent, message);
        // An opening is the question alone; later turns carry more.
        if (message.startsWith(QUESTION))
          return reply(OPENINGS[agent] ?? "No opening");
        return reply(`${agent} answers in turn.`);
      },
      chair: {
        challenge: async (input): Promise<ChairChallenge> => {
          chaired.push(
            `challenge:${input.openings.map(({ agent }) => agent).join(",")}`,
          );
          read.push(...(input.notes ?? []).map(({ title }) => title));
          return (
            options.challenge ??
            (async (): Promise<ChairChallenge> => challenge)
          )();
        },
        rejoinder: async (input): Promise<string> => {
          chaired.push(
            `rejoinder:${input.stands.agent}<-${input.challenges
              .map(({ agent }) => agent)
              .join(",")}`,
          );
          return REJOINDER_FOLLOW_UP;
        },
        closing: async (): Promise<never> => {
          throw new Error("no closing in this test");
        },
      },
      ...(options.notes ? { notes: options.notes } : {}),
      exists: async () => false,
      create: async (seminar): Promise<string> => {
        stored.push(seminar);
        return seminar.id;
      },
      today: () => "2026-11-27",
    },
  };
}

const held = async (
  options: Parameters<typeof room>[0] = {},
): Promise<Room & { turns: ReturnType<typeof readSeminar>["turns"] }> => {
  const built = room(options);
  await holdSeminar(built.deps, { question: QUESTION, language: "English" });
  const [seminar] = built.stored;
  if (!seminar) throw new Error("no seminar written");
  return { ...built, turns: readSeminar(seminar).turns };
};

describe("a seminar as an exchange", () => {
  it("runs openings, the chair's turn, the challenges and the rejoinder, in order", async () => {
    const { turns, chaired } = await held();

    expect(
      turns.map(({ round, speaker, to }) => [round, speaker, to ?? []]),
    ).toEqual([
      ["opening", "friedrich.example", []],
      ["opening", "karl.example", []],
      ["opening", "sigmund.example", []],
      ["challenge", "chair", ["karl.example", "sigmund.example"]],
      ["challenge", "chair", ["karl.example"]],
      ["challenge", "chair", ["sigmund.example"]],
      ["challenge", "karl.example", ["friedrich.example"]],
      ["challenge", "sigmund.example", ["friedrich.example"]],
      ["rejoinder", "chair", ["friedrich.example"]],
      ["rejoinder", "friedrich.example", ["karl.example", "sigmund.example"]],
    ]);
    expect(chaired).toEqual([
      "challenge:friedrich.example,karl.example,sigmund.example",
      "rejoinder:friedrich.example<-karl.example,sigmund.example",
    ]);
  });

  it("gives the chair the brain's notes on the question before it decides who stands", async () => {
    const asked: string[] = [];
    const { read } = await held({
      notes: async (question) => {
        asked.push(question);
        return [{ title: "Religion", text: "An answer to something else." }];
      },
    });

    expect(asked).toEqual([QUESTION]);
    expect(read).toEqual(["Religion"]);
  });

  it("holds the exchange without notes when the brain's notes cannot be read", async () => {
    const { turns, read } = await held({
      notes: async () => {
        throw new Error("search is down");
      },
    });

    expect(read).toEqual([]);
    expect(turns).toHaveLength(10);
  });

  it("keeps the chair's reading and every follow-up as the chair wrote them", async () => {
    const { turns } = await held();

    expect(turns.filter(({ speaker }) => speaker === "chair")).toEqual([
      {
        round: "challenge",
        speaker: "chair",
        name: "Chair",
        to: ["karl.example", "sigmund.example"],
        text: challenge.reading,
      },
      {
        round: "challenge",
        speaker: "chair",
        name: "Chair",
        to: ["karl.example"],
        text: challenge.followUps[0]?.followUp,
      },
      {
        round: "challenge",
        speaker: "chair",
        name: "Chair",
        to: ["sigmund.example"],
        text: challenge.followUps[1]?.followUp,
      },
      {
        round: "rejoinder",
        speaker: "chair",
        name: "Chair",
        to: ["friedrich.example"],
        text: REJOINDER_FOLLOW_UP,
      },
    ]);
  });

  it("gives each challenger the opening he answers and his follow-up, ending on the closing lines", async () => {
    const { asked } = await held();

    const toKarl = asked.filter(({ agent }) => agent === "karl.example")[1];
    expect(toKarl?.message).toBe(
      [
        `The question before the seminar: ${QUESTION}`,
        "",
        "Friedrich answered:",
        "",
        OPENINGS["friedrich.example"],
        "",
        challenge.followUps[0]?.followUp,
        "",
        closingLines("English"),
      ].join("\n"),
    );
  });

  it("gives the one who stands his own opening, the challenges and the chair's follow-up", async () => {
    const { asked } = await held();

    const rejoinder = asked.filter(
      ({ agent }) => agent === "friedrich.example",
    )[1];
    expect(rejoinder?.message).toBe(
      [
        `The question before the seminar: ${QUESTION}`,
        "",
        "You answered:",
        "",
        OPENINGS["friedrich.example"],
        "",
        "Karl answers you:",
        "",
        "karl.example answers in turn.",
        "",
        "Sigmund answers you:",
        "",
        "sigmund.example answers in turn.",
        "",
        REJOINDER_FOLLOW_UP,
        "",
        closingLines("English"),
      ].join("\n"),
    );
  });

  it("records a challenger who fails and gives the rejoinder the challenge that came", async () => {
    const { turns, chaired } = await held({
      answer: (agent, message) => {
        if (agent === "sigmund.example" && !message.startsWith(QUESTION))
          throw new SdkError("deadline_exceeded", {
            publicMessage: "sigmund.example did not answer within 90000 ms",
          });
        return {
          state: "completed",
          response: message.startsWith(QUESTION)
            ? (OPENINGS[agent] ?? "")
            : `${agent} answers in turn.`,
          sources: [],
        };
      },
    });

    expect(
      turns.find(
        ({ round, speaker }) =>
          round === "challenge" && speaker === "sigmund.example",
      ),
    ).toEqual({
      round: "challenge",
      speaker: "sigmund.example",
      name: "Sigmund",
      to: ["friedrich.example"],
      failed: "sigmund.example did not answer within 90000 ms",
    });
    expect(chaired.at(-1)).toBe("rejoinder:friedrich.example<-karl.example");
    expect(turns.at(-1)).toMatchObject({
      round: "rejoinder",
      speaker: "friedrich.example",
      to: ["karl.example"],
    });
  });

  it("ends after the challenges when no challenger answers", async () => {
    const { turns, chaired } = await held({
      answer: (agent, message) => {
        if (!message.startsWith(QUESTION))
          throw new SdkError("handler_failed", { publicMessage: "Not today." });
        return {
          state: "completed",
          response: OPENINGS[agent] ?? "",
          sources: [],
        };
      },
    });

    expect(turns.some(({ round }) => round === "rejoinder")).toBe(false);
    expect(chaired).toHaveLength(1);
  });

  it("keeps the openings and records why, when the chair's turn fails", async () => {
    const { turns, asked } = await held({
      challenge: async () => {
        throw new Error("model unavailable at 10.0.0.4");
      },
    });

    expect(turns).toHaveLength(4);
    expect(turns.at(-1)).toEqual({
      round: "challenge",
      speaker: "chair",
      name: "Chair",
      failed: "The chair could not take its turn",
    });
    expect(asked).toHaveLength(3);
  });

  it("refuses a chair that lets someone stand who gave no opening", async () => {
    const { turns } = await held({
      challenge: async () => ({ ...challenge, stands: "nobody.example" }),
    });

    expect(turns.at(-1)).toMatchObject({
      speaker: "chair",
      failed: "The chair could not take its turn",
    });
  });

  it("refuses a chair that leaves a participant without a follow-up", async () => {
    const { turns } = await held({
      challenge: async () => ({
        ...challenge,
        followUps: challenge.followUps.slice(0, 1),
      }),
    });

    expect(turns.at(-1)).toMatchObject({
      speaker: "chair",
      failed: "The chair could not take its turn",
    });
  });

  it("holds no exchange when only one peer gave an opening", async () => {
    const { turns, chaired } = await held({
      answer: (agent) => {
        if (agent !== "friedrich.example")
          throw new SdkError("handler_failed", { publicMessage: "Not today." });
        return {
          state: "completed",
          response: OPENINGS[agent] ?? "",
          sources: [],
        };
      },
    });

    expect(turns.map(({ round }) => round)).toEqual([
      "opening",
      "opening",
      "opening",
    ]);
    expect(chaired).toEqual([]);
  });
});
