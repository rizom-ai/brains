/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectDetailTemplate } from "../src/templates/project-detail";
import { projectRenderSchema } from "../src/templates/project-view";

function project(input: {
  body: string;
  structuredContent?: {
    context: string;
    problem: string;
    solution: string;
    outcome: string;
  };
}): ReturnType<typeof projectRenderSchema.parse> {
  return projectRenderSchema.parse({
    id: "river-atlas",
    entityType: "project",
    content: "",
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    visibility: "public",
    contentHash: "hash",
    metadata: {
      title: "River Atlas",
      status: "draft",
      year: 2019,
      slug: "river-atlas",
    },
    frontmatter: {
      title: "River Atlas",
      status: "draft",
      description: "A river mapped by canoe.",
      year: 2019,
    },
    body: input.body,
    ...(input.structuredContent && {
      structuredContent: input.structuredContent,
    }),
    url: "/projects/river-atlas",
    typeLabel: "Project",
  });
}

describe("ProjectDetailTemplate", () => {
  it("shows a project written in the writer's own words as written", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailTemplate
        project={project({
          body: "We mapped the river by canoe.\n\n## What we learned\n\nSlow is fast.",
        })}
        prevProject={null}
        nextProject={null}
      />,
    );
    expect(html).toContain("We mapped the river by canoe.");
    expect(html).toContain("What we learned");
    expect(html).toContain("Slow is fast.");
  });

  it("shows a case study's sections and not its raw body", () => {
    const html = renderToStaticMarkup(
      <ProjectDetailTemplate
        project={project({
          body: "## Context\n\nRaw context",
          structuredContent: {
            context: "The town wanted a map.",
            problem: "No map.",
            solution: "A canoe.",
            outcome: "A map.",
          },
        })}
        prevProject={null}
        nextProject={null}
      />,
    );
    expect(html).toContain("The town wanted a map.");
    expect(html).not.toContain("Raw context");
  });
});
