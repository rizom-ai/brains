import { describe, expect, it } from "bun:test";
import {
  chairChallengePrompt,
  chairRejoinderPrompt,
  checkedChallenge,
  modelChair,
  type ChairChallenge,
  type ChairReading,
} from "../src/lib/chair";

const openings: ChairReading[] = [
  { agent: "friedrich.example", name: "Friedrich", text: "Vergessen." },
  { agent: "karl.example", name: "Karl", text: "Inherited conditions." },
  { agent: "sigmund.example", name: "Sigmund", text: "Individual memory." },
];

const GUIDANCE = "Friedrich's brain does not hold his notebooks or letters.";

describe("the chair's prompts", () => {
  it("gives the chair the question, every opening under its participant's id, and what it knows of them", () => {
    const prompt = chairChallengePrompt(
      { question: "What is religion?", language: "Dutch", openings },
      GUIDANCE,
    );

    expect(prompt).toContain("The question: What is religion?");
    for (const { agent, name, text } of openings) {
      expect(prompt).toContain(`### ${name} (id: ${agent})\n\n${text}`);
    }
    expect(prompt).toContain(GUIDANCE);
    expect(prompt).toContain("Write in Dutch");
    expect(prompt).toContain("Never quote a participant's works for him");
  });

  it("says nothing of the participants when the brain states nothing", () => {
    expect(
      chairChallengePrompt({
        question: "What is religion?",
        language: "English",
        openings,
      }),
    ).not.toContain("What you know of the participants");
  });

  it("gives the chair the opening that stood and the challenges made to it", () => {
    const [stands, ...challenges] = openings;
    if (!stands) throw new Error("no opening");
    const prompt = chairRejoinderPrompt(
      {
        question: "What is religion?",
        language: "English",
        stands,
        challenges,
      },
      GUIDANCE,
    );

    expect(prompt).toContain(
      "The opening that stood:\n\n### Friedrich (id: friedrich.example)",
    );
    expect(prompt).toContain("The challenges:\n\n### Karl (id: karl.example)");
    expect(prompt).toContain(GUIDANCE);
  });
});

describe("the chair's turn, checked", () => {
  const challenge: ChairChallenge = {
    stands: "friedrich.example",
    reading: "Friedrich stands.",
    followUps: [
      { agent: "sigmund.example", followUp: "Answer him from Moses." },
      { agent: "karl.example", followUp: "Answer him from the Brumaire." },
    ],
  };

  it("puts the follow-ups in the participants' order", () => {
    expect(
      checkedChallenge(challenge, openings).followUps.map(({ agent }) => agent),
    ).toEqual(["karl.example", "sigmund.example"]);
  });

  it("refuses a follow-up for the one who stands, or for nobody present", () => {
    for (const agent of ["friedrich.example", "ghost.example"]) {
      expect(() =>
        checkedChallenge(
          {
            ...challenge,
            followUps: [
              { agent, followUp: "Answer." },
              { agent: "karl.example", followUp: "Answer." },
            ],
          },
          openings,
        ),
      ).toThrow("do not match");
    }
  });
});

describe("the chair over the brain's model", () => {
  it("asks the model once for each turn and returns what it wrote", async () => {
    const prompts: string[] = [];
    const chair = modelChair(
      {
        // What the model wrote, read through the schema the chair asked with.
        generateObject: async <T>(
          prompt: string,
          schema: { parse(value: unknown): T },
        ): Promise<{ object: T }> => {
          prompts.push(prompt);
          return {
            object: schema.parse(
              prompt.includes("The challenges:")
                ? { followUp: "How do you answer them?" }
                : {
                    stands: "friedrich.example",
                    reading: "Friedrich stands.",
                    followUps: [],
                  },
            ),
          };
        },
      },
      GUIDANCE,
    );
    const [stands, ...challenges] = openings;
    if (!stands) throw new Error("no opening");

    expect(
      await chair.challenge({ question: "Q?", language: "English", openings }),
    ).toMatchObject({ stands: "friedrich.example" });
    expect(
      await chair.rejoinder({
        question: "Q?",
        language: "English",
        stands,
        challenges,
      }),
    ).toBe("How do you answer them?");
    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => prompt.includes(GUIDANCE))).toBe(true);
  });
});
