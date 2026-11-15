import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { writerMarkdown } from "./fixtures";
import { installGuides } from "./guide-plugins";

/** A guide file as the registered guide type reads it. */
async function read(
  markdown: string,
): Promise<{ metadata?: unknown; content?: string }> {
  const shell = createMockShell();
  await installGuides(shell);
  return shell.getEntityRegistry().getAdapter("guide").fromMarkdown(markdown);
}

describe("the guide type's markdown", () => {
  it("carries every frontmatter field into metadata, and reads its body", async () => {
    const parsed = await read(writerMarkdown);

    expect(parsed.metadata).toEqual({
      title: "Moving in as a writer",
      slug: "writer",
      order: 10,
      persona: "The writer",
      for: "You have years of essays and a folder of drafts.",
      recipe: "professional",
      brings: null,
      section: null,
      summary: null,
      material: [
        {
          from: "Drafts and fragments",
          where: "Google Docs, Word, a notes app",
          becomes: "note",
          how: "Download as Markdown, bring the files in",
        },
      ],
    });
    expect(parsed.content).toStartWith("## Bring your drafts in");
  });

  it("rejects markdown whose frontmatter is not a guide", async () => {
    expect(read(writerMarkdown.replace("order: 10", ""))).rejects.toThrow();
  });
});
