import { beforeEach, describe, expect, it } from "bun:test";
import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import {
  seminarDetailPageSchema,
  seminarListPageSchema,
} from "../src/datasources/seminar-datasource";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { seminarRecord } from "../src/lib/seminar-body";
import type { SeminarStatus } from "../src/schemas/seminar";
import { createSeminarPlugins } from "./seminar-plugins";

function seminarEntity(
  id: string,
  question: string,
  asked: string,
  status: SeminarStatus = "published",
): Parameters<MockShell["addEntities"]>[0][number] {
  const { content, metadata } = seminarRecord(
    { question, asked, status, language: "English" },
    {
      turns: [
        {
          round: "opening",
          speaker: "karl.example",
          name: "Karl",
          text: `Karl on: ${question}`,
          sources: [
            {
              id: "book-section:einleitung/1",
              title: "Einleitung, 71",
              url: "https://karl.example/books/einleitung/1",
            },
          ],
        },
        {
          round: "opening",
          speaker: "sigmund.example",
          name: "Sigmund",
          failed: "sigmund.example did not answer within 90000 ms",
        },
      ],
      closing: { text: "Where they meet." },
    },
  );
  return {
    id,
    entityType: "seminar",
    // As stored: the document, its header over its body.
    content: generateMarkdown(metadata, content),
    metadata,
    contentHash: `hash-${id}`,
    visibility: "public",
    created: `${asked}T10:00:00.000Z`,
    updated: `${asked}T10:00:00.000Z`,
  };
}

describe("the seminar pages' data source", () => {
  let shell: MockShell;
  let context: BaseDataSourceContext;
  let fetch: NonNullable<DataSource["fetch"]>;

  beforeEach(async () => {
    shell = createMockShell();
    for (const plugin of createSeminarPlugins()) await plugin.register(shell);
    context = { entityService: shell.getEntityService() };
    const registered = shell.getDataSourceRegistry().get("seminar:entities");
    if (!registered?.fetch) throw new Error("No seminar data source");
    fetch = registered.fetch.bind(registered);
    shell.addEntities([
      seminarEntity("what-is-religion", "What is religion?", "2026-11-25"),
      seminarEntity(
        "on-memory",
        "What should a community remember?",
        "2026-11-27",
      ),
      seminarEntity(
        "on-morality",
        "Where does morality come from?",
        "2026-11-26",
      ),
    ]);
  });

  it("lists the seminars newest first, each with its question, its day and who spoke", async () => {
    const page = await fetch(
      { entityType: "seminar" },
      seminarListPageSchema,
      context,
    );

    expect(
      page.seminars.map(({ id, question, asked, speakers }) => ({
        id,
        question,
        asked,
        speakers,
      })),
    ).toEqual([
      {
        id: "on-memory",
        question: "What should a community remember?",
        asked: "2026-11-27",
        speakers: ["Karl", "Sigmund"],
      },
      {
        id: "on-morality",
        question: "Where does morality come from?",
        asked: "2026-11-26",
        speakers: ["Karl", "Sigmund"],
      },
      {
        id: "what-is-religion",
        question: "What is religion?",
        asked: "2026-11-25",
        speakers: ["Karl", "Sigmund"],
      },
    ]);
  });

  it("gives one seminar with its turns, its closing and its neighbors", async () => {
    const page = await fetch(
      { entityType: "seminar", query: { id: "on-morality" } },
      seminarDetailPageSchema,
      context,
    );

    expect(page.seminar.question).toBe("Where does morality come from?");
    expect(page.seminar.turns).toEqual([
      {
        round: "opening",
        speaker: "karl.example",
        name: "Karl",
        chair: false,
        to: [],
        text: "Karl on: Where does morality come from?",
        failed: null,
        sources: [
          {
            id: "book-section:einleitung/1",
            title: "Einleitung, 71",
            url: "https://karl.example/books/einleitung/1",
          },
        ],
      },
      {
        round: "opening",
        speaker: "sigmund.example",
        name: "Sigmund",
        chair: false,
        to: [],
        text: null,
        failed: "sigmund.example did not answer within 90000 ms",
        sources: [],
      },
    ]);
    expect(page.seminar.closing).toEqual({
      text: "Where they meet.",
      sources: [],
    });
    // Page data is plain JSON: nothing in it is left undefined.
    expect(JSON.parse(JSON.stringify(page))).toStrictEqual(page);
    expect(page.seminar.stands).toBeNull();
    expect(page.prevSeminar?.id).toBe("on-memory");
    expect(page.nextSeminar?.id).toBe("what-is-religion");
  });
});
