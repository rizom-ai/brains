import { afterEach, describe, expect, test } from "bun:test";
import portfolioPackage from "@brains/portfolio";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared portfolio on the brain's own entity store: every project
 * stored as the project adapter wrote it, byte for byte, whether imported,
 * updated, generated, stubbed or written from the writer's text.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

let reply: unknown;

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    portfolioPackage,
    "@brains/portfolio",
    "portfolio",
    { projectionSourceRole: "secondary" },
  );
  opened.shell.generateContent = async (): Promise<unknown> => reply;
  stores.push(opened);
  return opened;
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<string | undefined> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "project", id, markdown },
  });
  return (await opened.stored("project", id))?.content;
}

async function generate(
  opened: DeclaredEntityStore,
  data: unknown,
): Promise<unknown> {
  const handler = opened.shell
    .getJobQueueService()
    .getHandler("project:generation");
  if (!handler) throw new Error("No project generation");
  return handler.process(
    handler.validateAndParse(data),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

const sections =
  "## Context\n\nC\n\n## Problem\n\nP\n\n## Solution\n\nS\n\n## Outcome\n\nO\n";

const caseStudy = {
  title: "Harbour Sensors",
  description: "Sensing the harbour.",
  context: "Ctx.",
  problem: "Prob.",
  solution: "Sol.",
  outcome: "Out.",
};

const generatedBody =
  "# Project\n\n## Context\nCtx.\n\n## Problem\nProb.\n\n## Solution\nSol.\n\n## Outcome\nOut.\n";

describe("the declared projects on the entity store", () => {
  // Each expected document is what ProjectAdapter.toMarkdown stored for it.
  test.each([
    [
      "a full project",
      `---\ntitle: City Pulse\nslug: city-pulse\nstatus: published\npublishedAt: 2025-01-01T00:00:00.000Z\ndescription: Sensing a city.\nyear: 2024\ncoverImageId: pulse-cover\nurl: https://pulse.example\n---\n${sections}`,
      `---\ntitle: City Pulse\nslug: city-pulse\nstatus: published\npublishedAt: '2025-01-01T00:00:00.000Z'\ndescription: Sensing a city.\nyear: 2024\ncoverImageId: pulse-cover\nurl: 'https://pulse.example'\n---\n${sections}`,
    ],
    [
      "a project without a slug, with frontmatter it does not write",
      "---\nyear: 2023\ntitle: No Slug\nstatus: draft\ndescription: Desc\ntags: x\n---\nFree text body\n",
      "---\ntitle: No Slug\nstatus: draft\ndescription: Desc\nyear: 2023\nslug: no-slug\ntags: x\n---\nFree text body\n",
    ],
    [
      "a blank line after the frontmatter",
      "---\ntitle: Blank\nslug: blank\nstatus: draft\ndescription: D\nyear: 2020\n---\n\n## Context\n\nC",
      "---\ntitle: Blank\nslug: blank\nstatus: draft\ndescription: D\nyear: 2020\n---\n## Context\n\nC\n",
    ],
    [
      "a failed generation",
      "---\ntitle: Failed\nslug: failed\nstatus: failed\ndescription: ''\nyear: 2020\nerror: The model refused\n---\n",
      "---\ntitle: Failed\nslug: failed\nstatus: failed\ndescription: ''\nyear: 2020\nerror: The model refused\n---\n\n",
    ],
    [
      "a CRLF document",
      "---\r\ntitle: Crlf\r\nstatus: draft\r\ndescription: D\r\nyear: 2020\r\n---\r\nBody\r\n",
      "---\ntitle: Crlf\nstatus: draft\ndescription: D\nyear: 2020\nslug: crlf\n---\nBody\n",
    ],
  ])(
    "stores %s as the project adapter wrote it",
    async (_, markdown, content) => {
      const opened = await store();
      expect(await imported(opened, "project-1", markdown)).toBe(content);
    },
  );

  test.each([
    [
      `---\ntitle: City Pulse\nslug: city-pulse\nstatus: published\npublishedAt: 2025-01-01T00:00:00.000Z\ndescription: Sensing a city.\nyear: 2024\ncoverImageId: pulse-cover\nurl: https://pulse.example\n---\n${sections}`,
      "\nC\n",
      "\nChanged\n",
      `---\ntitle: City Pulse\nslug: city-pulse\nstatus: published\npublishedAt: '2025-01-01T00:00:00.000Z'\ndescription: Sensing a city.\nyear: 2024\ncoverImageId: pulse-cover\nurl: 'https://pulse.example'\n---\n${sections.replace("\nC\n", "\nChanged\n")}`,
    ],
    [
      "---\nyear: 2023\ntitle: No Slug\nstatus: draft\ndescription: Desc\ntags: x\n---\nFree text body\n",
      "Free text",
      "Changed text",
      // Once stored, the file states its slug.
      "---\ntitle: No Slug\nslug: no-slug\nstatus: draft\ndescription: Desc\nyear: 2023\ntags: x\n---\nChanged text body\n",
    ],
  ])(
    "keeps a project's form through an update of its body: %s",
    async (markdown, from, to, updated) => {
      const opened = await store();
      await imported(opened, "project-1", markdown);
      const read = await opened.service.getEntity({
        entityType: "project",
        id: "project-1",
      });
      if (!read) throw new Error("Missing project");
      await opened.service.updateEntity({
        entity: { ...read, content: read.content.replace(from, to) },
      });
      expect((await opened.stored("project", "project-1"))?.content).toBe(
        updated,
      );
    },
  );
});

describe("the declared project generation on the entity store", () => {
  test("writes a generated case study under its title's slug", async () => {
    const opened = await store();
    reply = caseStudy;
    expect(
      await generate(opened, { prompt: "harbour sensors", year: 2022 }),
    ).toEqual({
      success: true,
      entityId: "harbour-sensors",
      title: "Harbour Sensors",
    });
    expect((await opened.stored("project", "harbour-sensors"))?.content).toBe(
      `---\ntitle: Harbour Sensors\nslug: harbour-sensors\nstatus: draft\ndescription: Sensing the harbour.\nyear: 2022\n---\n${generatedBody}`,
    );
  });

  test("stores system_generate's stub and fills it", async () => {
    const opened = await store();
    const adapter = opened.shell.getEntityRegistry().getAdapter("project");
    const stub = adapter.buildStub?.({ id: "alloc", title: "Alloc" });
    if (!stub) throw new Error("The project builds no stub");
    await opened.service.createEntity({
      entity: { id: "alloc", entityType: "project", ...stub },
    });
    const year = new Date().getUTCFullYear();
    expect((await opened.stored("project", "alloc"))?.content).toBe(
      `---\ntitle: Alloc\nslug: alloc\nstatus: generating\ndescription: ''\nyear: ${year}\n---\n\n`,
    );
    reply = caseStudy;
    expect(
      await generate(opened, {
        prompt: "fill",
        year: 2021,
        title: "Alloc",
        entityId: "alloc",
      }),
    ).toEqual({
      success: true,
      entityId: "alloc",
      title: "Alloc",
      slug: "alloc",
    });
    expect((await opened.stored("project", "alloc"))?.content).toBe(
      `---\ntitle: Alloc\nslug: alloc\nstatus: draft\ndescription: Sensing the harbour.\nyear: 2021\n---\n${generatedBody}`,
    );
  });
});

describe("a project written from the writer's text on the entity store", () => {
  test("hands the ordinary create the document the class handed it", async () => {
    const opened = await store();
    reply = { description: "A pasted project.", year: 2020 };
    const intercept = opened.shell
      .getEntityRegistry()
      .getCreateInterceptor("project");
    if (!intercept) throw new Error("No project create interceptor");
    const caller = {
      interfaceType: "cli",
      actor: { kind: "user", userId: "u" },
      userPermissionLevel: "admin",
      conversationId: "conv-1",
    } as const;
    expect(
      await intercept(
        {
          entityType: "project",
          content: "# Pasted Project\n\nWe built it in 2020.",
          fields: {},
        },
        caller,
      ),
    ).toEqual({
      kind: "continue",
      input: {
        entityType: "project",
        content:
          "---\ntitle: Pasted Project\nstatus: draft\ndescription: A pasted project.\nyear: 2020\n---\nWe built it in 2020.\n",
        title: "Pasted Project",
      },
    });
    expect(
      await intercept(
        { entityType: "project", prompt: "a sensor network" },
        caller,
      ),
    ).toEqual({
      kind: "continue",
      input: { entityType: "project", prompt: "a sensor network" },
    });
  });
});
