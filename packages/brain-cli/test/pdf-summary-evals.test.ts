import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { YAMLLoader } from "@brains/ai-evaluation";

const cases = join(import.meta.dir, "../test-cases/personal/multi-turn");
const loader = YAMLLoader.createFresh({ directory: cases });

/** The text lines a PDF content stream shows, in order. */
function pdfTextLines(dataBase64: string): string[] {
  const pdf = Buffer.from(dataBase64, "base64").toString("latin1");
  return [...pdf.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("PDF summary eval coverage", () => {
  it.each([
    "web-chat-pdf-upload-summarize-action",
    "web-chat-pdf-upload-summarize-latest-readonly",
    "web-chat-pdf-summary-save-it-note",
  ])(
    "uploads a PDF with body text to summarize, and checks the summary by it: %s",
    async (file) => {
      const testCase = await loader.loadTestCase(join(cases, `${file}.yaml`));
      if (testCase.type !== "multi_turn")
        throw new Error("Expected multi-turn eval");
      const attachment = testCase.turns[0]?.attachments?.[0];
      if (attachment?.kind !== "file")
        throw new Error("Expected an uploaded PDF");

      // A model that reads extracted text, rather than the file itself,
      // finds nothing to summarize in a title-only page and goes looking.
      const [title, ...body] = pdfTextLines(attachment.dataBase64);
      expect(title).toBe("Distributed Systems Primer");
      expect(body.join(" ").split(/\s+/).length).toBeGreaterThan(40);
      // The summary proves the PDF was read by its body, not by the title a
      // model can guess from the filename.
      expect(body.join(" ")).toContain("Raft");
      expect(testCase.turns[1]?.successCriteria?.responseContains).toEqual([
        "Raft",
      ]);
    },
  );
});
