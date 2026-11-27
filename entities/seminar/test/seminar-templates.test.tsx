/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  seminarPageOf,
  type SeminarPage,
} from "../src/datasources/seminar-datasource";
import type { SeminarTurn } from "../src/schemas/seminar";
import { firstSentence, linkedSources } from "../src/templates/seminar-design";
import { SeminarDetailTemplate } from "../src/templates/seminar-detail";
import { SeminarListTemplate } from "../src/templates/seminar-list";

const peers = [
  { agent: "karl.example", name: "Marx" },
  { agent: "friedrich.example", name: "Nietzsche" },
  { agent: "sigmund.example", name: "Freud" },
];

const brumaire = {
  id: "book-section:brumaire/i",
  title: "Brumaire, 3",
  url: "https://karl.example/books/brumaire/3",
};

const turns: SeminarTurn[] = [
  {
    round: "opening",
    speaker: "friedrich.example",
    name: "Friedrich",
    text: "A people must know when to forget.",
  },
  {
    round: "opening",
    speaker: "karl.example",
    name: "Karl",
    text: "History is inherited conditions.",
  },
  {
    round: "opening",
    speaker: "sigmund.example",
    name: "Sigmund",
    failed: "sigmund.example did not answer within 90000 ms",
  },
  {
    round: "challenge",
    speaker: "chair",
    name: "Chair",
    to: ["karl.example"],
    text: "Only Nietzsche answered the question as asked.",
  },
  {
    round: "challenge",
    speaker: "chair",
    name: "Chair",
    to: ["karl.example"],
    text: "How does your *Achtzehnte Brumaire* answer him?",
  },
  {
    round: "challenge",
    speaker: "karl.example",
    name: "Karl",
    to: ["friedrich.example"],
    text: "The dead must be buried (**Brumaire, 3**).",
    sources: [brumaire],
  },
  {
    round: "rejoinder",
    speaker: "chair",
    name: "Chair",
    to: ["friedrich.example"],
    text: "Marx says the dead must be buried. How do you answer him?",
  },
  {
    round: "rejoinder",
    speaker: "friedrich.example",
    name: "Friedrich",
    to: ["karl.example"],
    text: "Critical history breaks a past in order to live.",
  },
];

function seminar(
  id: string,
  question: string,
  asked: string,
  withExchange = true,
): SeminarPage {
  return seminarPageOf(
    id,
    {
      frontmatter: {
        question,
        asked,
        status: "published",
        language: "English",
      },
      turns: withExchange ? turns : turns.slice(0, 3),
      ...(withExchange
        ? {
            closing: {
              text: "Neither lets a community choose its memory. They part on who forgets.",
              sources: [brumaire],
            },
          }
        : {}),
    },
    peers,
  );
}

const memory = seminar(
  "on-memory",
  "What should a community remember?",
  "2026-11-26",
);

describe("the seminar page", () => {
  const html = render(
    <SeminarDetailTemplate
      seminar={memory}
      prevSeminar={seminar("on-religion", "What is religion?", "2026-11-27")}
      nextSeminar={null}
    />,
  );

  test("opens on the question, its day and the peers it was put to", () => {
    expect(html).toContain("What should a community remember?");
    expect(html).toContain("26 November 2026");
    expect(html).toContain('href="https://karl.example"');
    expect(html).toContain('href="https://sigmund.example"');
  });

  test("sets the openings side by side in the brain's order, each under his name", () => {
    const [marx, nietzsche, freud] = ["Marx", "Nietzsche", "Freud"].map(
      (name) => html.indexOf(`>${name}<`),
    );
    expect(marx).toBeGreaterThan(-1);
    expect(marx).toBeLessThan(nietzsche ?? -1);
    expect(nietzsche).toBeLessThan(freud ?? -1);
    expect(html).toContain("History is inherited conditions.");
  });

  test("says so where a peer's brain did not answer", () => {
    expect(html).toContain("Freud did not answer.");
    expect(html).not.toContain("90000 ms");
  });

  test("marks the chair's turns and whom each follow-up is put to", () => {
    expect(html).toContain("The chair");
    expect(html).toContain("Only Nietzsche answered the question as asked.");
    expect(html).toContain("To Marx");
    expect(html).toContain("To Nietzsche");
    // A title the chair set in italics is set so, not shown with its asterisks.
    expect(html).toContain("<em>Achtzehnte Brumaire</em>");
  });

  test("names each round by who answers whom", () => {
    expect(html).toContain("Marx answers Nietzsche");
    expect(html).toContain("Nietzsche answers Marx");
  });

  test("links every source a turn returned to its section on its author's brain", () => {
    expect(html).toContain('<a href="https://karl.example/books/brumaire/3"');
  });

  test("closes with where they meet", () => {
    expect(html).toContain("Where they meet");
    expect(html).toContain("They part on who forgets.");
  });

  test("leads on to the seminars held after and before it", () => {
    expect(html).toContain('href="/seminars/on-religion"');
    expect(html).toContain("What is religion?");
  });

  test("shows a seminar of openings alone without rounds that never happened", () => {
    const openings = render(
      <SeminarDetailTemplate
        seminar={seminar("o", "What is religion?", "2026-11-27", false)}
        prevSeminar={null}
        nextSeminar={null}
      />,
    );
    expect(openings).not.toContain("The chair");
    expect(openings).not.toContain("Where they meet");
  });
});

describe("the seminar list", () => {
  const html = render(
    <SeminarListTemplate
      seminars={[
        seminar("on-religion", "What is religion?", "2026-11-27", false),
        memory,
      ]}
    />,
  );

  test("lists the seminars as given, each linked to its page with its day", () => {
    expect(html.indexOf("What is religion?")).toBeLessThan(
      html.indexOf("What should a community remember?"),
    );
    expect(html).toContain('href="/seminars/on-memory"');
    expect(html).toContain("26 November 2026");
  });

  test("numbers them in the order they were held, the oldest first", () => {
    expect(html.indexOf(">ii<")).toBeLessThan(html.indexOf(">i<"));
  });

  test("says who stood and who answered him, and the first of where they meet", () => {
    expect(html).toContain("Nietzsche stands");
    expect(html).toContain("Marx answers him");
    expect(html).toContain("Neither lets a community choose its memory.");
    expect(html).not.toContain("They part on who forgets.");
  });

  test("names a peer whose brain was silent", () => {
    expect(html).toContain("Freud was silent");
  });

  test("says how a seminar goes, naming the brain's peers", () => {
    expect(html).toContain("Marx");
    expect(html).toContain("one question");
  });

  test("says so when no seminar has been held", () => {
    expect(render(<SeminarListTemplate seminars={[]} />)).toContain(
      "No seminar has been held yet.",
    );
  });
});

describe("a turn's text, with its sources linked", () => {
  test("links a source where the text names it, once it has an address", () => {
    expect(
      linkedSources("The dead must be buried (**Brumaire, 3**).", [
        { ...brumaire },
        { title: "Nowhere", url: null },
      ]),
    ).toBe(
      "The dead must be buried (**[Brumaire, 3](https://karl.example/books/brumaire/3)**).",
    );
  });

  test("leaves a name that is already a link, and text that names no source", () => {
    const linked = "See [Brumaire, 3](https://elsewhere.example).";
    expect(linkedSources(linked, [brumaire])).toBe(linked);
    expect(linkedSources("No citation here.", [brumaire])).toBe(
      "No citation here.",
    );
  });
});

describe("the first sentence of a paragraph", () => {
  test("ends at its first full stop, question mark or exclamation mark", () => {
    expect(firstSentence("They meet here. They part there.")).toBe(
      "They meet here.",
    );
    expect(firstSentence("One sentence only")).toBe("One sentence only");
  });
});
