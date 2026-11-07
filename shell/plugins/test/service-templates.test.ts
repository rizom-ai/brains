import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "../src";

const digest = z.object({
  summary: z.string(),
  wordCount: z.number().int(),
});

async function install(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): Promise<MockShell> {
  const shell = createMockShell();
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reading", version: "0.1.0" },
  );
  await plugins.reduce<Promise<Plugin[]>>(async (done, plugin) => {
    await plugin.register(shell);
    return [...(await done), plugin];
  }, Promise.resolve([]));
  return shell;
}

function templateNamed(shell: MockShell, local: string): unknown {
  const entry = [...shell.getTemplates()].find(([name]) =>
    name.endsWith(`:${local}`),
  );
  if (!entry) throw new Error(`No template ${local}`);
  return entry[1];
}

type Call = (value: unknown) => unknown;
const callable = z.custom<Call>((value) => typeof value === "function");
const templateShape = z.object({
  description: z.string(),
  formatter: z.object({ format: callable }).optional(),
  layout: z.object({ component: callable }).optional(),
});

/** A paragraph element, the shape a component returns. */
const paragraph = (
  text: string,
): { type: "p"; props: { children: string }; key: null } => ({
  type: "p",
  props: { children: text },
  key: null,
});
const drawn = (element: unknown): string =>
  z.object({ props: z.object({ children: z.string() }) }).parse(element).props
    .children;

describe("a service template", () => {
  it("formats, renders, or both, from one declaration", async () => {
    const shell = await install(
      defineServicePlugin(
        { id: "reading", config: z.object({}) },
        {
          templates: {
            digest: {
              schema: digest,
              description: "A compact reading digest",
              format: ({ value }) => `# ${value.summary}`,
              renderers: {
                web: ({ summary, wordCount }) =>
                  paragraph(`${summary} (${wordCount})`),
              },
            },
            card: {
              schema: digest,
              renderers: { web: ({ summary }) => paragraph(summary) },
            },
            text: {
              schema: digest,
              format: ({ value }) => value.summary,
            },
          },
        },
      ),
    );

    const both = templateShape.parse(templateNamed(shell, "digest"));
    expect(both.description).toBe("A compact reading digest");
    expect(both.formatter?.format({ summary: "Soil", wordCount: 2 })).toBe(
      "# Soil",
    );
    // The component is given its props parsed by the template's schema.
    expect(
      drawn(both.layout?.component({ summary: "Soil", wordCount: 2 })),
    ).toBe("Soil (2)");
    expect(() => both.layout?.component({ summary: "Soil" })).toThrow();

    const card = templateShape.parse(templateNamed(shell, "card"));
    expect(card.formatter).toBeUndefined();
    expect(
      drawn(card.layout?.component({ summary: "Water", wordCount: 1 })),
    ).toBe("Water");
    expect(card.description).toBe("reading card");

    const text = templateShape.parse(templateNamed(shell, "text"));
    expect(text.layout).toBeUndefined();
    expect(text.formatter?.format({ summary: "Light", wordCount: 1 })).toBe(
      "Light",
    );
  });

  it("is refused when it neither formats nor renders", () => {
    expect(
      install(
        defineServicePlugin(
          { id: "reading", config: z.object({}) },
          { templates: { empty: { schema: digest } } },
        ),
      ),
    ).rejects.toThrow(
      'Service "reading" template "empty" neither formats nor renders',
    );
  });

  it("is refused when it generates content it cannot format", () => {
    expect(
      install(
        defineServicePlugin(
          { id: "reading", config: z.object({}) },
          {
            templates: {
              drawn: {
                schema: digest,
                generation: { prompt: "Write a digest" },
                renderers: { web: ({ summary }) => paragraph(summary) },
              },
            },
          },
        ),
      ),
    ).rejects.toThrow(
      'Service "reading" generation template "drawn" must format what it generates',
    );
  });

  it("renders only a schema that produces JSON", async () => {
    const shell = await install(
      defineServicePlugin(
        { id: "reading", config: z.object({}) },
        {
          templates: {
            dated: {
              schema: z.object({ at: z.date() }),
              format: ({ value }) => value.at.toISOString(),
              // @ts-expect-error A date does not survive the trip to the browser.
              renderers: { web: ({ at }) => paragraph(String(at)) },
            },
          },
        },
      ),
    );
    // Untyped, the props are still refused where they would be stored.
    const dated = templateShape.parse(templateNamed(shell, "dated"));
    expect(() => dated.layout?.component({ at: new Date(0) })).toThrow();
  });

  it("has no separate views slot", () => {
    expect(() =>
      defineServicePlugin(
        { id: "reading", config: z.object({}) },
        {
          // @ts-expect-error A template declares how it renders.
          views: {},
        },
      ),
    ).toThrow(
      'Service "reading" declares "views", which is not a behavior slot',
    );
  });
});
