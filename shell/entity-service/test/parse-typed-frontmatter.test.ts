import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { EntityValidationError, parseTypedFrontmatter } from "../src";

const schema = z.strictObject({ title: z.string(), count: z.number() });

/**
 * A type's own frontmatter read from a document, as an entity adapter
 * class's parseFrontMatter read it: the system visibility the exported
 * file carries is set aside before the type's schema sees the header, and
 * a header the schema refuses fails as the type's validation error.
 */
describe("parseTypedFrontmatter", () => {
  it("reads the type's header, setting the system visibility aside", () => {
    expect(
      parseTypedFrontmatter(
        "ticket",
        "---\ntitle: First\ncount: 2\nvisibility: restricted\n---\nBody\n",
        schema,
      ),
    ).toEqual({ title: "First", count: 2 });
  });

  it("fails as the type's validation error when its schema refuses the header", () => {
    const error = ((): unknown => {
      try {
        parseTypedFrontmatter("ticket", "---\ntitle: First\n---\n", schema);
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(EntityValidationError);
    expect(String(error)).toContain("ticket");
  });
});
