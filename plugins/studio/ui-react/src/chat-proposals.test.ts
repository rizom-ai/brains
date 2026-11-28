import { describe, expect, it } from "bun:test";
import { splitProposals } from "./chat-proposals";

// An answer beside an open entry can propose text for one of its fields.
describe("proposals in an answer", () => {
  const fields = [
    { name: "excerpt", label: "Excerpt" },
    { name: "body", label: "Body" },
  ];

  it("takes each proposal out of the prose, for its own field", () => {
    expect(
      splitProposals(
        "Here is one.\n\n```proposal excerpt\nA commons starts with provenance.\n```\n\nThe argument holds.",
        fields,
      ),
    ).toEqual({
      prose: "Here is one.\n\nThe argument holds.",
      proposals: [
        {
          field: "excerpt",
          label: "Excerpt",
          text: "A commons starts with provenance.",
        },
      ],
    });
  });

  it("leaves other code and proposals for fields the entry lacks as written", () => {
    const content = "```ts\nconst x = 1;\n```\n\n```proposal cover\nnope\n```";
    expect(splitProposals(content, fields)).toEqual({
      prose: content,
      proposals: [],
    });
  });

  it("keeps a proposal that is still streaming in the prose until it closes", () => {
    const content = "Draft:\n\n```proposal body\nHalf a para";
    expect(splitProposals(content, fields)).toEqual({
      prose: content,
      proposals: [],
    });
  });
});
