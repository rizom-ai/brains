import { describe, expect, it } from "bun:test";
import { parseSwotContent } from "../src/lib/swot-content";

/**
 * A SWOT in either stored form (docs/plans/one-stored-form.md) reads the
 * same quadrants: every reader, the widget among them, parses its
 * document through parseSwotContent.
 */
const current = `---
strengths:
  - title: Approved peer directory
    detail: An approved agent fixture for safe routing.
threats:
  - title: Publishing drift
derivedAt: '2026-05-06T10:30:00.000Z'
---
`;

const next = `---
derivedAt: '2026-05-06T10:30:00.000Z'
---
## Strengths

### Approved peer directory

An approved agent fixture for safe routing.

## Threats

### Publishing drift
`;

describe("a SWOT's document", () => {
  it("reads the same quadrants in either stored form", () => {
    const read = parseSwotContent(current);
    expect(read.frontmatter.strengths).toHaveLength(1);
    expect(parseSwotContent(next)).toEqual(read);
  });
});
