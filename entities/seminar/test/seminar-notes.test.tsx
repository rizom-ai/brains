/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  noteListPage,
  notePage,
  readNotes,
  type NoteReads,
} from "../src/datasources/seminar-notes-datasource";
import { NoteDetailTemplate } from "../src/templates/note-detail";
import { NoteListTemplate } from "../src/templates/note-list";

const religion = {
  id: "religion",
  content:
    "---\ntitle: Religion\n---\n\nAll three read religion as *an answer* to something else. None stops at calling it false.\n\nFor Marx it answers a world.\n",
  metadata: { title: "Religion" },
};
const morality = {
  id: "morality-as-genealogy",
  content:
    "---\ntitle: Morality as genealogy\n---\n\nThe three ask where it came from.\n",
  metadata: { title: "Morality as genealogy" },
};

describe("a note as its page reads it", () => {
  test("is its title and its body, without the header", () => {
    expect(notePage(religion)).toEqual({
      id: "religion",
      title: "Religion",
      body: "All three read religion as *an answer* to something else. None stops at calling it false.\n\nFor Marx it answers a world.",
    });
  });

  test("goes by its id where it has no title", () => {
    expect(
      notePage({ id: "religion", content: "An answer.", metadata: {} }).title,
    ).toBe("religion");
  });
});

describe("the notes as their list reads them", () => {
  test("is every note by title, each with its opening sentence", () => {
    expect(noteListPage([religion, morality])).toEqual({
      notes: [
        {
          id: "morality-as-genealogy",
          title: "Morality as genealogy",
          opening: "The three ask where it came from.",
        },
        {
          id: "religion",
          title: "Religion",
          opening: "All three read religion as an answer to something else.",
        },
      ],
    });
  });
});

describe("a note that opens on a heading", () => {
  test("is listed by its first paragraph of text", () => {
    expect(
      noteListPage([
        {
          id: "green",
          content:
            "# Green software\n\n## Why\n\nEnergy is a cost. So is carbon.\n",
          metadata: { title: "Green software" },
        },
      ]).notes[0]?.opening,
    ).toBe("Energy is a cost.");
  });
});

describe("the notes' data source", () => {
  const reads: NoteReads = {
    listEntities: async () => [religion, morality],
    getEntity: async ({ id }) => (id === "religion" ? religion : null),
  };

  test("lists the notes for the index page", async () => {
    expect(
      await readNotes(reads, { entityType: "note", query: { limit: 2 } }),
    ).toEqual(noteListPage([religion, morality]));
  });

  test("gives one note for its page", async () => {
    expect(
      await readNotes(reads, { entityType: "note", query: { id: "religion" } }),
    ).toEqual({ note: notePage(religion) });
  });

  test("fails for a note that is not there", async () => {
    expect(
      readNotes(reads, { entityType: "note", query: { id: "absent" } }),
    ).rejects.toThrow("No note absent");
  });
});

describe("the notes' pages", () => {
  test("the list links every note by its title, under its opening", () => {
    const html = render(
      <NoteListTemplate {...noteListPage([religion, morality])} />,
    );

    expect(html).toContain('href="/notes/religion"');
    expect(html).toContain("Morality as genealogy");
    expect(html).toContain(
      "All three read religion as an answer to something else.",
    );
  });

  test("the list says so when the brain keeps no notes", () => {
    expect(render(<NoteListTemplate notes={[]} />)).toContain("No notes yet.");
  });

  test("a note's page shows its title and its text as written", () => {
    const html = render(<NoteDetailTemplate note={notePage(religion)} />);

    expect(html).toContain("Religion</h1>");
    expect(html).toContain("<em>an answer</em>");
    expect(html).toContain('href="/notes"');
  });
});
