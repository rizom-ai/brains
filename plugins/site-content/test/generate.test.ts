import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createElement } from "react";
import type { ReactElement } from "react";
import type { PluginCapabilities, ToolContext } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import type { SiteContentDefinition } from "../src/definitions";
import { installSiteContent } from "./helpers/install";

const TestLayout = (): ReactElement => createElement("section");

const operator: ToolContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "operator" },
};

const definition: SiteContentDefinition = {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Hero section",
      title: "Hero Section",
      layout: TestLayout,
      fields: { headline: { label: "Headline", type: "string" } },
    },
  },
};

/**
 * A tool answers success, a refusal, or a confirmation request. These tests
 * only ever see the first two, and reading either means saying which.
 */
const toolAnswerSchema = z.union([
  z.looseObject({ success: z.literal(true), data: z.unknown() }),
  z.looseObject({ success: z.literal(false), error: z.string() }),
]);

/** What the generate tool answers, parsed rather than asserted piecemeal. */
const generateResultSchema = z.looseObject({
  queued: z.array(
    z.looseObject({
      jobId: z.string(),
      routeId: z.string(),
      sectionId: z.string(),
    }),
  ),
  totalSections: z.number(),
  queuedSections: z.number(),
  dryRun: z.boolean(),
});

/**
 * Filling in the site's sections: the site builder says which sections
 * exist, the registry says which of them can be generated at all, and one
 * piece of work is queued for each that can and has no content yet.
 */
describe("generating the site's sections", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-content-gen" });
    ({ capabilities } = await installSiteContent(harness, {
      definitions: [definition],
    }));
  });

  afterEach(async () => {
    await harness.reset();
  });

  /** The site builder, as far as this package can tell. */
  function siteRoutes(
    routes: Array<{
      id: string;
      title?: string;
      sections: Array<{ id: string; template?: string; content?: string }>;
    }>,
  ): void {
    harness.subscribe(SITE_BUILDER_CHANNELS.routesList, async () => ({
      success: true,
      data: routes,
    }));
  }

  /** A page section registered the way a composed brain registers one. */
  function registerSection(name: string, canGenerate: boolean): void {
    harness.getMockShell().registerTemplates(
      {
        [name]: {
          name,
          description: `The ${name} section`,
          schema: z.object({ headline: z.string() }),
          requiredPermission: "public",
          ...(canGenerate
            ? {
                basePrompt: "Write a headline",
                dataSourceId: "shell:ai-content",
              }
            : {}),
        },
      },
      "landing-page",
    );
  }

  /** The tool's answer, as a caller reads it. */
  async function run(
    input: Record<string, unknown> = {},
  ): Promise<z.output<typeof toolAnswerSchema>> {
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "sections_generate",
    );
    if (!tool) throw new Error("The generate tool was not registered");
    return toolAnswerSchema.parse(await tool.handler(input, operator));
  }

  async function generate(
    input: Record<string, unknown> = {},
  ): Promise<z.output<typeof generateResultSchema>> {
    const result = await run(input);
    if (!result.success) throw new Error(result.error);
    return generateResultSchema.parse(result.data);
  }

  /** The refusal, for a test that expects one. */
  async function refusal(input: Record<string, unknown> = {}): Promise<string> {
    const result = await run(input);
    if (result.success) throw new Error("The tool did not refuse");
    return result.error;
  }

  it("queues one piece of work per section that can be generated", async () => {
    registerSection("hero", true);
    siteRoutes([
      {
        id: "home",
        title: "Home",
        sections: [{ id: "hero", template: "landing-page:hero" }],
      },
    ]);

    const result = await generate();

    expect(result.queued).toHaveLength(1);
    expect(result.queued[0]).toMatchObject({
      routeId: "home",
      sectionId: "hero",
    });
  });

  it("leaves alone a section whose template cannot be generated", async () => {
    registerSection("hero", false);
    siteRoutes([
      {
        id: "home",
        sections: [{ id: "hero", template: "landing-page:hero" }],
      },
    ]);

    expect(await generate()).toMatchObject({
      queued: [],
      totalSections: 0,
    });
  });

  it("leaves alone a section the route already wrote out", async () => {
    registerSection("hero", true);
    siteRoutes([
      {
        id: "home",
        sections: [
          { id: "hero", template: "landing-page:hero", content: "Written" },
        ],
      },
    ]);

    expect(await generate()).toMatchObject({ totalSections: 0 });
  });

  it("counts without queueing when asked for a dry run", async () => {
    registerSection("hero", true);
    siteRoutes([
      {
        id: "home",
        sections: [{ id: "hero", template: "landing-page:hero" }],
      },
    ]);

    expect(await generate({ dryRun: true })).toMatchObject({
      queued: [],
      totalSections: 1,
      dryRun: true,
    });
  });

  it("refuses a section named without its route", async () => {
    siteRoutes([]);

    expect(await refusal({ sectionId: "hero" })).toContain(
      "sectionId requires routeId",
    );
  });

  it("says so when the site builder is not answering", async () => {
    expect(await refusal()).toContain("did not answer with its routes");
  });
});
