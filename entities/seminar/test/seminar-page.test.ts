import { describe, expect, it } from "bun:test";
import { seminarPageOf } from "../src/datasources/seminar-datasource";
import type { SeminarTurn } from "../src/schemas/seminar";

const frontmatter = {
  question: "What is religion?",
  asked: "2026-11-27",
  status: "published",
  language: "English",
} as const;

/** Stored in the order the job took them: by agent id. */
const turns: SeminarTurn[] = [
  {
    round: "opening",
    speaker: "friedrich.example",
    name: "Nietzsche",
    text: "By rank.",
  },
  { round: "opening", speaker: "karl.example", name: "Marx", text: "Opium." },
  {
    round: "opening",
    speaker: "sigmund.example",
    name: "Freud",
    text: "A wish.",
  },
  {
    round: "challenge",
    speaker: "chair",
    name: "Chair",
    to: ["friedrich.example", "sigmund.example"],
    text: "Karl stands.",
  },
  {
    round: "challenge",
    speaker: "chair",
    name: "Chair",
    to: ["friedrich.example"],
    text: "Answer him.",
  },
  {
    round: "challenge",
    speaker: "friedrich.example",
    name: "Nietzsche",
    to: ["karl.example"],
    text: "Not only that.",
  },
  {
    round: "rejoinder",
    speaker: "karl.example",
    name: "Marx",
    to: ["friedrich.example"],
    text: "Still a product.",
  },
];

const order = ["karl.example", "friedrich.example", "sigmund.example"];

describe("a seminar as its page reads it", () => {
  it("shows each peer under the name the seminar was held with, in the brain's order", () => {
    const page = seminarPageOf(
      "what-is-religion",
      { frontmatter, turns },
      order,
    );

    expect(page.speakers).toEqual([
      { agent: "karl.example", name: "Marx" },
      { agent: "friedrich.example", name: "Nietzsche" },
      { agent: "sigmund.example", name: "Freud" },
    ]);
    expect(
      page.turns
        .filter(({ round, chair }) => round === "opening" && !chair)
        .map(({ name }) => name),
    ).toEqual(["Marx", "Nietzsche", "Freud"]);
    // Whom a turn addresses is named the same way.
    expect(page.turns.at(-1)).toMatchObject({
      name: "Marx",
      to: ["Nietzsche"],
    });
  });

  it("says who stood: the one the challenges answer", () => {
    expect(
      seminarPageOf("what-is-religion", { frontmatter, turns }, order).stands,
    ).toBe("Marx");
    expect(
      seminarPageOf(
        "what-is-religion",
        { frontmatter, turns: turns.slice(0, 3) },
        order,
      ).stands,
    ).toBeNull();
  });

  it("keeps the stored order on a brain that orders no peers", () => {
    const page = seminarPageOf("what-is-religion", { frontmatter, turns }, []);

    expect(page.speakers.map(({ name }) => name)).toEqual([
      "Nietzsche",
      "Marx",
      "Freud",
    ]);
    expect(page.stands).toBe("Marx");
  });

  it("keeps the rounds in order and each round's chair turns before its peers'", () => {
    const page = seminarPageOf(
      "what-is-religion",
      { frontmatter, turns },
      order,
    );

    expect(page.turns.map(({ round, name }) => [round, name])).toEqual([
      ["opening", "Marx"],
      ["opening", "Nietzsche"],
      ["opening", "Freud"],
      ["challenge", "Chair"],
      ["challenge", "Chair"],
      ["challenge", "Nietzsche"],
      ["rejoinder", "Marx"],
    ]);
  });
});
