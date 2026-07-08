import type { JSX } from "preact";
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { z } from "@brains/utils/zod";
import {
  CONTENT_NAMESPACE,
  defineSection,
  toRouteSections,
  toTemplates,
} from "../src/section-def";
import { homeSections } from "../src/home";
import { workSections } from "../src/work";
import { foundationSections } from "../src/foundation";

const allSections = [...homeSections, ...workSections, ...foundationSections];

describe("defineSection", () => {
  const schema = z.object({ title: z.string() });
  const Component = ({ title }: { title: string }): JSX.Element => (
    <h1>{title}</h1>
  );

  it("validates the fallback against the schema at definition time", () => {
    expect(() =>
      defineSection({
        name: "bad",
        description: "broken fallback",
        schema,
        component: Component,
        fallback: { title: 42 } as unknown as { title: string },
      }),
    ).toThrow();
  });

  it("derives the template registry and route sections from one list", () => {
    const def = defineSection({
      name: "good",
      description: "works",
      schema,
      component: Component,
      fallback: { title: "hi" },
    });

    expect(toTemplates([def])["good"]).toBe(def.template);
    expect(toRouteSections([def])).toEqual([
      {
        id: "good",
        template: `${CONTENT_NAMESPACE}:good`,
        content: { title: "hi" },
      },
    ]);
  });
});

describe("page sections", () => {
  it("section names are unique across all pages", () => {
    const names = allSections.map((def) => def.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every section renders from its fallback copy", () => {
    for (const def of allSections) {
      const Component = def.component as (props: unknown) => JSX.Element;
      const html = render(<Component {...(def.fallback as object)} />);
      expect(html.length).toBeGreaterThan(0);
    }
  });
});

describe("key section copy", () => {
  function renderSection(name: string): string {
    const def = allSections.find((d) => d.name === name);
    if (!def) throw new Error(`no section named ${name}`);
    const Component = def.component as (props: unknown) => JSX.Element;
    return render(<Component {...(def.fallback as object)} />);
  }

  it("home tells the full platform story", () => {
    expect(renderSection("home-hero")).toContain("Build the agent that");
    expect(renderSection("home-growth")).toContain("Network");
    expect(renderSection("home-problem")).toContain(
      "Your best thinking never ships",
    );
    expect(renderSection("home-your-data")).toContain(
      "Markdown, not databases",
    );
    expect(renderSection("home-quickstart")).toContain("brain init mybrain");
    expect(renderSection("home-mission")).toContain(
      "The future of work is play",
    );
    expect(renderSection("home-faces")).toContain("The tools");
    expect(renderSection("home-alive")).toContain("This site is a brain");
  });

  it("work tells the practice story with the TMS diagnostic", () => {
    const hero = renderSection("work-hero");
    expect(hero).toContain("Your team has a knowledge problem");
    expect(hero).toContain("Distributed specialists");
    expect(hero).toContain("Specialization");
    expect(renderSection("work-workshop")).toContain("Playbook");
    expect(renderSection("work-personas")).toContain("The scaling founder");
    expect(renderSection("work-quotes")).toContain("Taipei");
    expect(renderSection("work-roster")).toContain("Jan Hein Hoogstad");
    expect(renderSection("work-closer")).toContain("type of team");
  });

  it("foundation reads as the journal", () => {
    expect(renderSection("foundation-hero")).toContain("Vol. 01");
    expect(renderSection("foundation-research")).toContain(
      "The future of work is play",
    );
    expect(renderSection("foundation-pullquote")).toContain("pattern");
    expect(renderSection("foundation-chapters")).toContain("Amsterdam");
    expect(renderSection("foundation-support")).toContain("€1,000");
    expect(renderSection("foundation-follow")).toContain("Follow the research");
  });
});
