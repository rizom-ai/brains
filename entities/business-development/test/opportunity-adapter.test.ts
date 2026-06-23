import { describe, expect, it } from "bun:test";
import {
  opportunityAdapter,
  opportunityFrontmatterSchema,
  opportunitySchema,
  type OpportunityEntity,
  type OpportunityFrontmatter,
} from "../src";

const frontmatter: OpportunityFrontmatter = {
  title: "Foundation grant renewal",
  type: "grant",
  state: "staged",
  incomePotential: 4,
  organizationalBuild: 5,
  brainsDevelopment: 3,
  integrity: 5,
  owner: "Sam",
  hardDeadline: "2026-07-15",
  lastActionAt: "2026-06-20",
  lastActionBy: "Natalie",
};

function createOpportunityEntity(
  overrides: Partial<OpportunityEntity> = {},
): OpportunityEntity {
  const content = opportunityAdapter.createOpportunityContent(
    frontmatter,
    "Renew the foundation grant and use the process to test shared memory.",
  );

  return {
    id: "foundation-grant-renewal",
    entityType: "opportunity",
    content,
    contentHash: "",
    created: "2026-06-23T00:00:00Z",
    updated: "2026-06-23T00:00:00Z",
    visibility: "restricted",
    metadata: {
      ...frontmatter,
      slug: "foundation-grant-renewal",
    },
    ...overrides,
  };
}

describe("opportunity schema", () => {
  it("accepts a valid manually scored opportunity", () => {
    const entity = createOpportunityEntity();

    expect(opportunitySchema.parse(entity)).toEqual(entity);
  });

  it("rejects scores outside the 0-5 rubric", () => {
    const result = opportunityFrontmatterSchema.safeParse({
      ...frontmatter,
      incomePotential: 6,
    });

    expect(result.success).toBe(false);
  });

  it("rejects fractional scores", () => {
    const result = opportunityFrontmatterSchema.safeParse({
      ...frontmatter,
      integrity: 3.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid states", () => {
    const result = opportunityFrontmatterSchema.safeParse({
      ...frontmatter,
      state: "backlog",
    });

    expect(result.success).toBe(false);
  });
});

describe("opportunity adapter", () => {
  it("round-trips markdown frontmatter and description", () => {
    const markdown = opportunityAdapter.createOpportunityContent(
      frontmatter,
      "Renew the foundation grant and use the process to test shared memory.",
    );

    const parsed = opportunityAdapter.parseOpportunityContent(markdown);

    expect(parsed).toEqual({
      frontmatter,
      description:
        "Renew the foundation grant and use the process to test shared memory.",
    });
  });

  it("derives query metadata from markdown", () => {
    const markdown = opportunityAdapter.createOpportunityContent(
      frontmatter,
      "Renew the foundation grant.",
    );

    expect(opportunityAdapter.fromMarkdown(markdown)).toEqual({
      content: markdown,
      entityType: "opportunity",
      metadata: {
        ...frontmatter,
        slug: "foundation-grant-renewal",
      },
    });
  });

  it("serializes entity metadata back to markdown", () => {
    const entity = createOpportunityEntity({
      metadata: {
        ...frontmatter,
        state: "active",
        slug: "foundation-grant-renewal",
      },
    });

    const parsed = opportunityAdapter.parseOpportunityContent(
      opportunityAdapter.toMarkdown(entity),
    );

    expect(parsed.frontmatter.state).toBe("active");
    expect(parsed.description).toBe(
      "Renew the foundation grant and use the process to test shared memory.",
    );
  });
});
