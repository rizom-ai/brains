import { parseMarkdownWithFrontmatter } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { profileInCurrentShape } from "./anchor-profile-stored-form";
import { characterBody } from "./brain-character-adapter";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

/*
 * The identity singletons' documents in either stored form
 * (docs/plans/one-stored-form.md), as the current form holds them: every
 * field in the header, and a profile's story as its body. For a reader of
 * the stored document that does not go through the singleton's adapter.
 */

const headerRecordSchema = z.record(z.string(), z.unknown());

/** An anchor profile's fields and its story, from a document in either form. */
export function readAnchorProfileDocument(markdown: string): {
  header: Record<string, unknown>;
  story: string;
} {
  const { metadata, content } = parseMarkdownWithFrontmatter(
    markdown,
    headerRecordSchema,
  );
  const current = profileInCurrentShape(metadata, content);
  return { header: current.header, story: current.body };
}

/** A brain character's fields and any text, from a document in either form. */
export function readBrainCharacterDocument(markdown: string): {
  header: Record<string, unknown>;
  body: string;
} {
  const { metadata, content } = parseMarkdownWithFrontmatter(
    markdown,
    headerRecordSchema,
  );
  const read = characterBody.read(metadata, content);
  return { header: read.header, body: read.lead };
}
