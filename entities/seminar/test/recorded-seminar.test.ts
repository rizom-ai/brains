import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { readSeminarBody, seminarBody } from "../src/lib/seminar-body";
import { seminarFrontmatterSchema } from "../src/schemas/seminar";

/**
 * The seminar a brain held on 27 November 2026 with karl., friedrich. and
 * sigmund.rizom.ai on "What is religion?", as its job stored it: three
 * openings, the chair's turn, two challenges, and the rejoinder.
 */
const stored = await readFile(
  join(import.meta.dir, "fixtures", "seminar-what-is-religion.md"),
  "utf8",
);

describe("a seminar as a brain stored it", () => {
  const { frontmatter, content } = parseMarkdown(stored);
  const body = content.replace(/^\n+/u, "");

  it("reads as the exchange it was", () => {
    expect(seminarFrontmatterSchema.parse(frontmatter)).toEqual({
      question: "What is religion?",
      asked: "2026-11-27",
      status: "draft",
      language: "English",
    });
    expect(
      readSeminarBody(body).turns.map(({ round, speaker, to }) => [
        round,
        speaker,
        to ?? [],
      ]),
    ).toEqual([
      ["opening", "friedrich.rizom.ai", []],
      ["opening", "karl.rizom.ai", []],
      ["opening", "sigmund.rizom.ai", []],
      ["challenge", "chair", ["friedrich.rizom.ai", "sigmund.rizom.ai"]],
      ["challenge", "chair", ["friedrich.rizom.ai"]],
      ["challenge", "chair", ["sigmund.rizom.ai"]],
      ["challenge", "friedrich.rizom.ai", ["karl.rizom.ai"]],
      ["challenge", "sigmund.rizom.ai", ["karl.rizom.ai"]],
      ["rejoinder", "chair", ["karl.rizom.ai"]],
      [
        "rejoinder",
        "karl.rizom.ai",
        ["friedrich.rizom.ai", "sigmund.rizom.ai"],
      ],
    ]);
  });

  it("is written back as it was stored from what was read", () => {
    // The file's last newline is the document's, not the body's.
    expect(seminarBody(readSeminarBody(body)).trimEnd()).toBe(body.trimEnd());
  });

  it("keeps every peer's turn with the sources it returned", () => {
    for (const turn of readSeminarBody(body).turns) {
      if (turn.speaker === "chair") continue;
      expect(turn.text?.length).toBeGreaterThan(200);
      expect(turn.sources?.length).toBeGreaterThan(0);
    }
  });
});
