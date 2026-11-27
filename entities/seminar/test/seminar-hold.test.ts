import { describe, expect, it } from "bun:test";
import { SdkError, type A2APeerAnswer } from "@brains/contracts";
import {
  holdSeminar,
  type SeminarHoldDeps,
  type SeminarPeer,
} from "../src/handlers/seminar-hold-handler";
import { readSeminar } from "../src/lib/seminar-body";
import type { SeminarTurn } from "../src/schemas/seminar";

/** The openings a stored seminar holds. */
function openingsOf(seminar: {
  content: string;
  metadata: Record<string, unknown>;
}): SeminarTurn[] {
  return readSeminar(seminar).turns.filter(({ round }) => round === "opening");
}
import { closingLines } from "../src/lib/messages";

const QUESTION = "What should a community remember, and what should it forget?";

const peers: SeminarPeer[] = [
  { id: "sigmund.example", name: "Sigmund" },
  { id: "karl.example", name: "Karl" },
  { id: "friedrich.example", name: "Friedrich" },
];

/** The peers' openings, as recorded: text with its own headings, and sources. */
const recorded: Record<string, A2APeerAnswer> = {
  "karl.example": {
    state: "completed",
    response:
      "## Der achtzehnte Brumaire\n\n> Die Tradition aller todten Geschlechter lastet wie ein Alp auf dem Gehirne der Lebenden.",
    sources: [
      {
        id: "book-section:brumaire/i",
        title: "Der achtzehnte Brumaire des Louis Bonaparte, I",
        source: "book-section",
        url: "https://karl.example/books/brumaire/i",
        excerpt: "Die Tradition aller todten Geschlechter",
      },
      // A source with no title is listed by its reference.
      { id: "book-section:brumaire/ii", source: "book-section" },
    ],
  },
  "friedrich.example": {
    state: "completed",
    response: "Zu allem Handeln gehört Vergessen.",
    sources: [],
  },
  "sigmund.example": {
    state: "completed",
    response: "Was ein Volk vergessen hat, kehrt wieder.",
    sources: [],
  },
};

interface Held {
  deps: SeminarHoldDeps;
  asked: Array<{ agent: string; message: string }>;
  created: Array<{
    id: string;
    entityType: string;
    content: string;
    metadata: Record<string, unknown>;
  }>;
}

function seminarRoom(
  options: {
    peers?: SeminarPeer[];
    answer?: (agent: string) => Promise<A2APeerAnswer>;
    taken?: string[];
  } = {},
): Held {
  const asked: Held["asked"] = [];
  const created: Held["created"] = [];
  const taken = new Set(options.taken ?? []);
  return {
    asked,
    created,
    deps: {
      peers: async () => options.peers ?? peers,
      askTurn: async (agent, message): Promise<A2APeerAnswer> => {
        asked.push({ agent, message });
        const reply = await (options.answer?.(agent) ??
          Promise.resolve(recorded[agent]));
        if (!reply) throw new Error(`no recorded reply for ${agent}`);
        return reply;
      },
      chair: {
        challenge: async (): Promise<never> => {
          throw new Error("no exchange in this test");
        },
        rejoinder: async (): Promise<never> => {
          throw new Error("no exchange in this test");
        },
      },
      exists: async (id) => taken.has(id),
      create: async (seminar): Promise<string> => {
        created.push(seminar);
        return seminar.id;
      },
      today: () => "2026-11-26",
    },
  };
}

describe("holding a seminar of openings", () => {
  it("puts the question to every approved peer and keeps each opening verbatim with its sources", async () => {
    const room = seminarRoom();

    const result = await holdSeminar(room.deps, {
      question: QUESTION,
      language: "English",
    });

    expect(room.asked.map(({ agent }) => agent).sort()).toEqual([
      "friedrich.example",
      "karl.example",
      "sigmund.example",
    ]);
    const [seminar] = room.created;
    if (!seminar) throw new Error("no seminar written");
    expect(result).toEqual({
      seminarId: seminar.id,
      answered: ["friedrich.example", "karl.example", "sigmund.example"],
      failed: [],
    });
    expect(seminar.id).toBe(
      "what-should-a-community-remember-and-what-should-it-forget",
    );
    expect(seminar.entityType).toBe("seminar");
    expect(seminar.metadata).toEqual({
      question: QUESTION,
      asked: "2026-11-26",
      status: "draft",
      language: "English",
    });
    // The peers in a stable order, whatever order the directory lists them in.
    expect(openingsOf(seminar)).toEqual([
      {
        round: "opening",
        speaker: "friedrich.example",
        name: "Friedrich",
        text: "Zu allem Handeln gehört Vergessen.",
      },
      {
        round: "opening",
        speaker: "karl.example",
        name: "Karl",
        text: recorded["karl.example"]?.response,
        sources: [
          {
            id: "book-section:brumaire/i",
            title: "Der achtzehnte Brumaire des Louis Bonaparte, I",
            url: "https://karl.example/books/brumaire/i",
          },
          { id: "book-section:brumaire/ii", title: "book-section:brumaire/ii" },
        ],
      },
      {
        round: "opening",
        speaker: "sigmund.example",
        name: "Sigmund",
        text: "Was ein Volk vergessen hat, kehrt wieder.",
      },
    ]);
  });

  it("ends every message to a peer with the two closing lines, in the reader's language", async () => {
    const room = seminarRoom();

    await holdSeminar(room.deps, { question: QUESTION, language: "Dutch" });

    const closing = closingLines("Dutch");
    expect(closing).toBe(
      "Answer from your own works and cite each section you draw on.\nAnswer in Dutch; keep quotes in the language of their text.",
    );
    for (const { message } of room.asked) {
      expect(message).toBe(`${QUESTION}\n\n${closing}`);
    }
  });

  it("records a peer that fails with its reason and goes on without him", async () => {
    const room = seminarRoom({
      answer: async (agent) => {
        if (agent === "sigmund.example")
          throw new SdkError("deadline_exceeded", {
            publicMessage: "sigmund.example did not answer within 90000 ms",
          });
        const reply = recorded[agent];
        if (!reply) throw new Error("unrecorded");
        return reply;
      },
    });

    const result = await holdSeminar(room.deps, {
      question: QUESTION,
      language: "English",
    });

    expect(result.answered).toEqual(["friedrich.example", "karl.example"]);
    expect(result.failed).toEqual(["sigmund.example"]);
    const [seminar] = room.created;
    if (!seminar) throw new Error("no seminar written");
    expect(openingsOf(seminar).at(-1)).toEqual({
      round: "opening",
      speaker: "sigmund.example",
      name: "Sigmund",
      failed: "sigmund.example did not answer within 90000 ms",
    });
  });

  it("keeps a failure's diagnostic out of the seminar", async () => {
    const room = seminarRoom({
      answer: async (agent) => {
        if (agent === "karl.example")
          throw new Error("ECONNRESET at 10.0.0.4:443");
        const reply = recorded[agent];
        if (!reply) throw new Error("unrecorded");
        return reply;
      },
    });

    await holdSeminar(room.deps, { question: QUESTION, language: "English" });

    const [seminar] = room.created;
    if (!seminar) throw new Error("no seminar written");
    expect(seminar.content).not.toContain("ECONNRESET");
  });

  it("writes nothing when no peer answers", async () => {
    const room = seminarRoom({
      answer: async () => {
        throw new SdkError("handler_failed", { publicMessage: "Not today." });
      },
    });

    expect(
      holdSeminar(room.deps, { question: QUESTION, language: "English" }),
    ).rejects.toThrow("No peer answered");
    expect(room.created).toEqual([]);
  });

  it("refuses to hold a seminar with no approved peer", async () => {
    const room = seminarRoom({ peers: [] });

    expect(
      holdSeminar(room.deps, { question: QUESTION, language: "English" }),
    ).rejects.toThrow("no approved peer");
    expect(room.asked).toEqual([]);
  });

  it("gives a second seminar on the same question its own id", async () => {
    const room = seminarRoom({
      taken: [
        "what-should-a-community-remember-and-what-should-it-forget",
        "what-should-a-community-remember-and-what-should-it-forget-2",
      ],
    });

    const result = await holdSeminar(room.deps, {
      question: QUESTION,
      language: "English",
    });

    expect(result.seminarId).toBe(
      "what-should-a-community-remember-and-what-should-it-forget-3",
    );
  });
});
