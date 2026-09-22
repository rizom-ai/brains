import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  createMockContentServices,
  type MockContentServices,
} from "../src/test/mock-content";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";
import {
  PermissionService,
  type NonLayoutTemplate,
  type Template,
} from "@brains/templates";
import type { DataSource } from "@brains/entity-service";

function template(overrides: Partial<NonLayoutTemplate> = {}): Template {
  return {
    name: "summary",
    description: "A summary template.",
    schema: z.object({ text: z.string() }),
    requiredPermission: "public",
    ...overrides,
  };
}

function services(
  templates = new Map<string, Template>(),
): MockContentServices & { templates: Map<string, Template> } {
  const built = createMockContentServices({
    templates,
    entityService: createMockEntityService(createMockEntityStore()),
    getPermissionService: () => new PermissionService({}),
  });
  return { ...built, templates };
}

describe("the content service double", () => {
  it("narrows a template to the fields production exposes", () => {
    // Returning the raw Template would hand tests fields — useKnowledgeContext
    // here, and whatever else Template carries — that production never shows.
    const { contentService, templates } = services();
    templates.set("summary", template({ useKnowledgeContext: true }));

    const found = contentService.getTemplate("summary");

    expect(found).not.toBeNull();
    expect(Object.keys(found ?? {}).sort()).toEqual([
      "description",
      "name",
      "requiredPermission",
      "schema",
    ]);
  });

  it("copies the optional fields only when the template has them", () => {
    const { contentService, templates } = services();
    templates.set("bare", template({ name: "bare" }));
    templates.set(
      "full",
      template({ name: "full", basePrompt: "write", dataSourceId: "source-1" }),
    );

    expect("basePrompt" in (contentService.getTemplate("bare") ?? {})).toBe(
      false,
    );
    expect(contentService.getTemplate("full")?.basePrompt).toBe("write");
    expect(contentService.getTemplate("full")?.dataSourceId).toBe("source-1");
  });

  it("returns null for a template nobody registered", () => {
    const { contentService } = services();
    expect(contentService.getTemplate("absent")).toBeNull();
  });

  it("lists every registered template, narrowed the same way", () => {
    const { contentService, templates } = services();
    templates.set("a", template({ name: "a" }));
    templates.set("b", template({ name: "b" }));

    expect(contentService.listTemplates().map((one) => one.name)).toEqual([
      "a",
      "b",
    ]);
  });

  it("resolves nothing, because no data source is wired in", async () => {
    const { contentService } = services();
    expect(await contentService.resolveContent("summary")).toBeNull();
  });
});

// The registry only asks whether a capability's method exists, so these stubs
// need the real signatures and nothing else.
const fetchStub: NonNullable<DataSource["fetch"]> = async (_query, schema) =>
  schema.parse({});
const generateStub: NonNullable<DataSource["generate"]> = async (
  _request,
  schema,
) => schema.parse({});

describe("the data source registry double", () => {
  function source(overrides: Partial<DataSource> = {}): DataSource {
    return { id: "source-1", name: "Source", ...overrides };
  }

  it("registers and finds a data source by id", () => {
    const { dataSourceRegistry } = services();
    const one = source();
    dataSourceRegistry.register(one);

    expect(dataSourceRegistry.get("source-1")).toBe(one);
    expect(dataSourceRegistry.has("source-1")).toBe(true);
    expect(dataSourceRegistry.getIds()).toEqual(["source-1"]);
  });

  it("silently ignores a data source with no string id", () => {
    // Worth stating: a test registering a malformed source gets no error and
    // an empty registry, which reads as a lookup bug rather than a bad
    // registration.
    const { dataSourceRegistry } = services();
    const nameless = source();
    Reflect.deleteProperty(nameless, "id");

    dataSourceRegistry.register(nameless);

    expect(dataSourceRegistry.list()).toEqual([]);
  });

  it("selects by which capability the source actually implements", () => {
    const { dataSourceRegistry } = services();
    dataSourceRegistry.register(source({ id: "fetcher", fetch: fetchStub }));
    dataSourceRegistry.register(
      source({ id: "generator", generate: generateStub }),
    );

    expect(
      dataSourceRegistry.getByCapability("canFetch").map((one) => one.id),
    ).toEqual(["fetcher"]);
    expect(
      dataSourceRegistry.getByCapability("canGenerate").map((one) => one.id),
    ).toEqual(["generator"]);
    expect(dataSourceRegistry.getByCapability("canTransform")).toEqual([]);
  });

  it("unregisters one source and clears all of them", () => {
    const { dataSourceRegistry } = services();
    dataSourceRegistry.register(source({ id: "a" }));
    dataSourceRegistry.register(source({ id: "b" }));

    dataSourceRegistry.unregister("a");
    expect(dataSourceRegistry.getIds()).toEqual(["b"]);

    dataSourceRegistry.clear();
    expect(dataSourceRegistry.list()).toEqual([]);
  });
});
