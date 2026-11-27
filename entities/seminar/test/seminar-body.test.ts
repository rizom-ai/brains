import { describe, expect, it } from "bun:test";
import {
  readSeminar,
  readSeminarBody,
  seminarBody,
  seminarRecord,
} from "../src/lib/seminar-body";
import type { SeminarTurn } from "../src/schemas/seminar";

/** An answer as a book brain gives it: headings, a quote, a list, a rule. */
const KARL = [
  "## Die Tradition aller todten Geschlechter",
  "",
  "A community does not choose what it remembers:",
  "",
  "> Die Tradition aller todten Geschlechter lastet wie ein Alp auf dem Gehirne der Lebenden.",
  "",
  "### What follows",
  "",
  "- **Borrowed names:** the revolution of 1848 dressed as 1789",
  "- It must *let the dead bury their dead*.",
  "",
  "---",
  "",
  "#### Sources",
  "",
  "Der achtzehnte Brumaire, I.",
].join("\n");

const turns: SeminarTurn[] = [
  {
    round: "opening",
    speaker: "karl.example",
    name: "Karl",
    text: KARL,
    sources: [
      {
        id: "book-section:brumaire/i",
        title: "Der achtzehnte Brumaire des Louis Bonaparte, I",
        url: "https://karl.example/books/brumaire/i",
      },
    ],
  },
  {
    round: "opening",
    speaker: "friedrich.example",
    name: "Friedrich",
    text: "Zu allem Handeln gehört Vergessen.",
  },
  {
    round: "opening",
    speaker: "sigmund.example",
    name: "Sigmund",
    failed: "sigmund.example did not answer within 90000 ms",
  },
];

describe("a seminar's stored body", () => {
  it("keeps every turn as it was given, an answer's own headings among them", () => {
    const read = readSeminar({
      content: seminarBody({ turns }),
      metadata: {
        question: "What should a community remember?",
        asked: "2026-11-26",
        status: "draft",
        language: "English",
      },
    });

    expect(read.turns).toEqual(turns);
    expect(read.frontmatter.question).toBe("What should a community remember?");
  });

  it("writes each turn under its own heading, its sources as a linked list", () => {
    const body = seminarBody({ turns });

    expect(body.startsWith("## Turns\n\n### Turn 1\n\n")).toBe(true);
    expect(body).toContain(
      "- **Round:** opening\n- **Speaker:** karl.example\n- **Name:** Karl",
    );
    // The answer's own headings are escaped, so they never open a section.
    expect(body).toContain("\\## Die Tradition aller todten Geschlechter");
    expect(body).toContain(
      '- [Der achtzehnte Brumaire des Louis Bonaparte, I](https://karl.example/books/brumaire/i "book-section:brumaire/i")',
    );
    expect(body).toContain(
      "- **Failed:** sigmund.example did not answer within 90000 ms",
    );
  });

  it("writes the same bytes again from what it read", () => {
    const body = seminarBody({ turns });
    expect(seminarBody(readSeminarBody(body))).toBe(body);
  });

  it("is a record of its fields as metadata over its body", () => {
    const record = seminarRecord(
      {
        question: "What should a community remember?",
        asked: "2026-11-26",
        status: "draft",
        language: "English",
      },
      { turns },
    );
    expect(record.metadata).toEqual({
      question: "What should a community remember?",
      asked: "2026-11-26",
      status: "draft",
      language: "English",
    });
    expect(record.content).toBe(seminarBody({ turns }));
  });

  it("refuses a turn that neither answers nor says why not", () => {
    expect(() =>
      seminarBody({
        turns: [{ round: "opening", speaker: "karl.example", name: "Karl" }],
      }),
    ).toThrow();
  });
});
