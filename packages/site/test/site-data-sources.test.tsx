/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import {
  defineSection,
  defineSite,
  sectionGroup,
  z,
  type SiteDefinition,
} from "../src";

/** A source as `defineDataSource` declares one, built by hand: no brain here. */
function source(
  id: string,
): NonNullable<SiteDefinition["dataSources"]>[number] {
  return Object.freeze({
    kind: "rizom-data-source" as const,
    id,
    name: id,
    description: `The ${id} source`,
    fetch: async (): Promise<unknown> => ({ heading: id }),
  });
}

function shelfSection(dataSource?: string): ReturnType<typeof defineSection> {
  return defineSection(
    z.object({ heading: z.string() }),
    ({ heading }) => <h2>{heading}</h2>,
    {
      title: "Shelf",
      description: "What is on the shelf",
      ...(dataSource ? { dataSource } : {}),
    },
  );
}

function site(
  dataSources: SiteDefinition["dataSources"],
  dataSource = "shelf",
): SiteDefinition {
  return defineSite({
    layouts: { default: ({ sections }) => <main>{sections}</main> },
    routes: [
      {
        id: "home",
        path: "/",
        title: "Home",
        sections: [{ id: "shelf", template: "library:shelf" }],
      },
    ],
    sections: [sectionGroup("library", { shelf: shelfSection(dataSource) })],
    ...(dataSources ? { dataSources } : {}),
    entityDisplay: {},
  });
}

/** The messages a refused definition names. */
function refusals(define: () => unknown): string[] {
  try {
    define();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues.map((issue) => issue.message);
    }
    throw error;
  }
  throw new Error("The definition was accepted");
}

describe("a site's data sources", () => {
  test("are declared beside the sections that read them", () => {
    const shelf = source("shelf");
    const defined = site([shelf]);
    expect(defined.dataSources).toEqual([shelf]);
    const group = Array.isArray(defined.sections)
      ? defined.sections[0]
      : defined.sections;
    expect(group?.sections["shelf"]?.dataSource).toBe("shelf");
  });

  test("refuse two sources with one id", () => {
    expect(refusals(() => site([source("shelf"), source("shelf")]))).toEqual([
      'Data source "shelf" is declared twice',
    ]);
  });

  test("refuse a section that reads a source the site does not declare", () => {
    const undeclared =
      'Section "library:shelf" reads data source "shelf", which the site does not declare';
    expect(refusals(() => site([source("other")]))).toEqual([undeclared]);
    expect(refusals(() => site(undefined))).toEqual([undeclared]);
  });

  test("are only fetching sources declared with defineDataSource", () => {
    // What an untyped package could hand over: the entity form, and a source
    // written by hand.
    const entityForm = { ...source("shelf") };
    Reflect.set(entityForm, "kind", "rizom-entity-data-source");
    expect(() => site([entityForm])).toThrow("defineDataSource");
    const handWritten = { ...source("shelf") };
    Reflect.deleteProperty(handWritten, "kind");
    expect(() => site([handWritten])).toThrow("defineDataSource");
  });
});
