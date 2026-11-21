import { describe, expect, it } from "bun:test";
import { quizResultAdapter } from "../src/entity/adapter";

/**
 * A quiz result in either stored form (docs/plans/one-stored-form.md)
 * reads the same: the target and the persistence check parse it through
 * the adapter, which reads what was answered from the header or the body.
 */
const current = `---
quiz: fit
receivedAt: '2026-04-15T09:00:00.000Z'
status: new
notification: none
results:
  - dimension: d
    title: Fit
    outcome: high
    outcomeTitle: High fit
answers:
  - field: q1
    label: Question one
    value: "- not a list"
  - field: q2
    label: Pick some
    value:
      - A
      - B
visibility: restricted
---
`;

const next = `---
quiz: fit
receivedAt: '2026-04-15T09:00:00.000Z'
status: new
notification: none
visibility: restricted
---
## Results

### Fit

- **Dimension:** d
- **Outcome:** high
- **Outcome title:** High fit

## Answers

### Question one

- **Field:** q1

\\- not a list

### Pick some

- **Field:** q2

- A
- B
`;

describe("a quiz result's document", () => {
  it("reads the same in either stored form, an answer that looks like a list included", () => {
    const read = quizResultAdapter.parseContent(current);
    expect(read.frontmatter.answers[0]?.value).toBe("- not a list");
    expect(quizResultAdapter.parseContent(next)).toEqual(read);
  });
});
