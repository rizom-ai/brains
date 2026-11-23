import { describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import type { ServiceRuntime } from "@brains/sdk/internal/service-runtime";
import {
  RouteDefinitionSchema,
  type RouteDefinition,
} from "@brains/site-composition";
import {
  restateSectionContent,
  savedSectionBody,
  type RestateSectionContentDeps,
} from "../../src/lib/restate-section-content";

/**
 * A section's saved copy is laid out by its template, which writes the
 * compact layout now (docs/external-plugin-authoring.md, The stored format). At boot the site
 * builder brings every saved copy to what its template writes, quietly.
 */
describe("restating the sections' saved copy", () => {
  const route: RouteDefinition = RouteDefinitionSchema.parse({
    id: "home",
    path: "/",
    title: "Home",
    description: "",
    sections: [
      { id: "hero", template: "home:hero" },
      { id: "intro", template: "home:intro" },
      { id: "static", template: "", content: { text: "x" } },
    ],
  });

  function deps(saved: Record<string, string>): {
    restated: Array<{ id: string; body: string }>;
    deps: RestateSectionContentDeps;
  } {
    const restated: Array<{ id: string; body: string }> = [];
    return {
      restated,
      deps: {
        routes: (): RouteDefinition[] => [route],
        savedBody: async (id: string): Promise<string | null> =>
          saved[id] ?? null,
        // The template's own layout: the copy upper-cased stands for it.
        layOut: (_template: string, body: string): string => body.toUpperCase(),
        restate: async (
          id: string,
          body: string,
        ): ReturnType<RestateSectionContentDeps["restate"]> => {
          restated.push({ id, body });
          return {
            entityType: "site-content",
            entityId: id,
            previousHash: "before",
            contentHash: "after",
          };
        },
        warn: (): void => {},
      },
    };
  }

  it("restates a saved copy its template lays out differently, and only that", async () => {
    const { deps: d, restated } = deps({
      "home:hero": "old layout",
      "home:intro": "SAME",
    });
    const result = await restateSectionContent(d);
    expect(restated).toEqual([{ id: "home:hero", body: "OLD LAYOUT" }]);
    expect(result.map(({ entityId }) => entityId)).toEqual(["home:hero"]);
  });

  it("leaves a saved copy its template cannot read, and goes on", async () => {
    const warnings: string[] = [];
    const { deps: d, restated } = deps({
      "home:hero": "unreadable",
      "home:intro": "fine",
    });
    const result = await restateSectionContent({
      ...d,
      layOut: (template, body) => {
        if (template === "home:hero") throw new Error("Unknown section");
        return body.toUpperCase();
      },
      warn: (message) => warnings.push(message),
    });
    expect(restated).toEqual([{ id: "home:intro", body: "FINE" }]);
    expect(result).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  // The resolving lookup inlines every entity://image/<id> as a data URL.
  // Restating what it read wrote the bytes over the stored reference, and a
  // section's photo no longer pointed at the image the build writes.
  it("reads the saved copy as stored, so its image references stay references", async () => {
    const stored = createTestEntity("site-content", {
      id: "home:hero",
      content: "## Photo\n![Becca Chen](entity://image/becca-chen)",
    });
    const reads: Pick<
      ServiceRuntime["entityReads"],
      "getEntity" | "getEntityRaw"
    > = {
      getEntity: async ({ id }) =>
        id === stored.id
          ? {
              ...stored,
              content:
                "## Photo\n![Becca Chen](data:image/webp;base64,UklGRg==)",
            }
          : null,
      getEntityRaw: async ({ id }) => (id === stored.id ? stored : null),
    };
    const { deps: d, restated } = deps({});
    await restateSectionContent({
      ...d,
      savedBody: savedSectionBody(reads),
      // The template's own layout: a blank line after every heading.
      layOut: (_template, body) => body.replace(/^(#+ .*)\n(?!\n)/gm, "$1\n\n"),
    });
    expect(restated).toEqual([
      {
        id: "home:hero",
        body: "## Photo\n\n![Becca Chen](entity://image/becca-chen)",
      },
    ]);
  });
});
