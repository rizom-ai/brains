import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { faqBodyCodec, faqBodyIn } from "../src/lib/faq-body";

/**
 * An answer whose steps are a numbered list of bold labels, as a chat
 * answer often is, reads back from the next stored form
 * (docs/plans/one-stored-form.md): the list is the answer's text, never a
 * field line.
 */
describe("a FAQ answer of numbered steps", () => {
  const sectioned = `## Answer

Ecosystem architecture has four movements.

## Alternative answers

### Alternative 1

A practical path:

1. **Align:** Establish a shared moral challenge, vision, and values.
2. **Validate:** Test whether people commit resources.
`;

  it("reads back in the next stored form as it reads in the current one", () => {
    const next = faqBodyIn("new", sectioned);
    expect(z.decode(faqBodyCodec, next)).toEqual(
      z.decode(faqBodyCodec, sectioned),
    );
  });
});
