import { expect, test } from "bun:test";
import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { askedDataSource } from "../src/asked-datasource";
import { askedSchema } from "../src/asked";
import site from "../src/site";

for (const publishedOnly of [false, true])
  test(`composes registered FAQ output without changing the build's publication floor (${publishedOnly})`, async () => {
    const context: BaseDataSourceContext = {
      publishedOnly,
      entityService: createMockShell().getEntityService(),
    };
    const calls: unknown[] = [];
    const faqs = [
      {
        id: "kept",
        question: "Why?",
        answer: "Kept answer.",
        asked: 3,
        sources: [
          {
            id: "post:one",
            title: "Source",
            url: "https://example.com/one",
            excerpt: null,
            brain: null,
          },
        ],
      },
    ];
    const faq: DataSource = {
      id: "@brains/faq:entities",
      name: "FAQ",
      description: "Canonical source stand-in",
      async fetch(query, schema, received) {
        calls.push(query);
        expect(received).toBe(context);
        return schema.parse({ faqs });
      },
    };
    const source = askedDataSource({ faq: () => faq, map: () => undefined });
    if (!source.fetch) throw new Error("Missing Asked fetch");
    const result = await source.fetch({}, askedSchema, context);
    expect(result.faqs).toEqual(faqs);
    expect(result.nodes).toEqual([]);
    expect(calls).toEqual([{ query: { limit: 12 } }]);
  });

test("the installed site resolves package-scoped datasource IDs, not template IDs", async () => {
  const shell = createMockShell();
  const registry = shell.getDataSourceRegistry();
  const calls: string[] = [];
  for (const id of [
    "@brains/faq:entities",
    "@brains/agent-discovery:proximity-map",
  ]) {
    registry.register({
      id,
      name: id,
      description: "Registered declarative source",
      async fetch(_query, schema) {
        calls.push(id);
        return schema.parse(
          id === "@brains/faq:entities"
            ? { faqs: [] }
            : {
                center: { kind: "identity" },
                nodes: [],
                clusters: [],
                sightings: [],
                distanceRange: { min: 0, max: 1 },
                pendingCount: 0,
              },
        );
      },
    });
  }
  const plugin = site.plugin?.();
  if (!plugin?.register) throw new Error("Missing site runtime registration");
  await plugin.register(shell);
  const asked = registry.get("rizom:asked");
  if (!asked?.fetch) throw new Error("Missing installed Asked datasource");
  await asked.fetch({}, askedSchema, {
    publishedOnly: true,
    entityService: shell.getEntityService(),
  });
  expect(calls.sort()).toEqual([
    "@brains/agent-discovery:proximity-map",
    "@brains/faq:entities",
  ]);
});

test("has an empty chapter when the declarative sources are not installed", async () => {
  const source = askedDataSource({
    faq: () => undefined,
    map: () => undefined,
  });
  if (!source.fetch) throw new Error("Missing Asked fetch");
  const result = await source.fetch({}, askedSchema, {
    publishedOnly: true,
    entityService: createMockShell().getEntityService(),
  });
  expect(result.faqs).toEqual([]);
  expect(result.nodes).toEqual([]);
});
