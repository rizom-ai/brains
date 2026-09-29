import { createMockAIService } from "@brains/ai-service/test";
import { AIOutputValidationError } from "@brains/ai-service";
import {
  createMockDataSourceRegistry,
  createMockEntityService,
} from "@brains/entity-service/test";
import {
  EntityWriteConflictError,
  EntityValidationError,
  type BaseEntity,
} from "@brains/entity-service";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import {
  InMemoryTemplateRegistry,
  PermissionService,
  type Template,
} from "@brains/templates";
import {
  GenerationAuthorizer,
  type GenerationCaller,
} from "../src/generation-authorization";

const caller: GenerationCaller = {
  actor: { kind: "service", serviceId: "books" },
  permissionLevel: "trusted",
};
import { describe, expect, mock, spyOn, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { ContentService } from "../src/content-service";
import {
  assertGenerationRequestLimits,
  GenerationLimitError,
  MAX_GENERATION_REQUEST_BYTES,
} from "../src/generation-limits";
import type { ContentGenerationJobData } from "../src/generation-contracts";
import { ContentGenerationJobHandler } from "../src/handlers/contentGenerationJobHandler";

function generationTemplate(): Template {
  return {
    name: "books:chapter",
    description: "Generate a book chapter",
    basePrompt: "Write the requested chapter",
    dataSourceId: "shell:ai-content",
    schema: z.object({ title: z.string(), body: z.string() }),
    formatter: {
      format: (value: unknown): string => {
        const parsed = z
          .object({ title: z.string(), body: z.string() })
          .parse(value);
        return `# ${parsed.title}\n\n${parsed.body}`;
      },
      parse: () => ({ title: "", body: "" }),
    },
    requiredPermission: "trusted",
  };
}

function createFixture(): {
  service: ContentService;
  entityService: ReturnType<typeof createMockEntityService>;
  templateRegistry: InMemoryTemplateRegistry;
  dataSourceRegistry: ReturnType<typeof createMockDataSourceRegistry>;
} {
  const logger = createSilentLogger();
  const entityService = createMockEntityService({
    entityTypes: ["book-section"],
  });
  const templateRegistry = InMemoryTemplateRegistry.createFresh(logger);
  const dataSourceRegistry = createMockDataSourceRegistry();
  const service = new ContentService({
    logger,
    entityService,
    aiService: createMockAIService(),
    templateRegistry,
    dataSourceRegistry,
    generationAuthorizer: new GenerationAuthorizer(
      new PermissionService({ trusted: ["service:books"] }),
      async () => null,
    ),
  });
  templateRegistry.register("books:chapter", generationTemplate());
  return { service, entityService, templateRegistry, dataSourceRegistry };
}

const chapterTarget = {
  templateName: "books:chapter",
  context: { data: { chapterTitle: "Arrival" } },
  destination: {
    entityType: "book-section",
    idPath: ["book-1", "part-1", "chapter-2"] as const,
    metadata: { bookId: "book-1", sectionId: "chapter-2", order: 2 },
  },
};
const existingEntity: BaseEntity = {
  id: "book-1:part-1:chapter-2",
  entityType: "book-section",
  content: "Existing",
  metadata: chapterTarget.destination.metadata,
  contentHash: "hash",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
  visibility: "public",
};
const jobData: ContentGenerationJobData = {
  authority: { actor: caller.actor, permissionCeiling: "trusted" },
  templateName: chapterTarget.templateName,
  context: chapterTarget.context,
  destination: {
    entityType: "book-section",
    entityId: existingEntity.id,
    metadata: chapterTarget.destination.metadata,
    visibility: "public",
  },
  expectedRevision: null,
};

describe("ContentService.planGeneration", () => {
  test("plans a structured destination, private ID and absent precondition", async () => {
    const { service } = createFixture();
    const plan = await service.planGeneration({
      caller,
      targets: [chapterTarget],
    });
    expect(plan).toMatchObject({ totalTargets: 1, skipped: [] });
    expect(plan.planned[0]).toMatchObject({
      entityId: existingEntity.id,
      jobData: {
        expectedRevision: null,
        destination: jobData.destination,
      },
    });
  });

  test.each([false, true])(
    "rejects a payload that only exceeds the limit once authority and the precondition are added (dryRun=%s)",
    async (dryRun) => {
      const { service, entityService } = createFixture();
      // Fill the request to just under the limit, leaving less headroom than
      // planning adds for authority, operation ID, entity ID and precondition.
      const options = { dryRun, force: false };
      const headroom = 64;
      // Admission measures only targets and options, so size against those.
      const padding =
        MAX_GENERATION_REQUEST_BYTES -
        Buffer.byteLength(
          JSON.stringify({
            targets: [{ ...chapterTarget, context: { prompt: "" } }],
            options,
          }),
          "utf8",
        ) -
        headroom;
      const target = {
        ...chapterTarget,
        context: { prompt: "x".repeat(padding) },
      };
      const outcome = await service
        .planGeneration({ caller, targets: [target], options })
        .catch((error: unknown) => error);
      // The request itself is admissible; only the durable payload is not.
      expect(() =>
        assertGenerationRequestLimits({ targets: [target], options }),
      ).not.toThrow();
      expect(outcome).toBeInstanceOf(GenerationLimitError);
      // Preview and submission reject it the same way, after the same reads.
      expect(entityService.getEntityWriteSnapshot).toHaveBeenCalledTimes(1);
    },
  );

  test("dry runs perform the same existing-content check", async () => {
    const { service, entityService } = createFixture();
    spyOn(entityService, "getEntityWriteSnapshot").mockResolvedValue({
      entity: existingEntity,
      revision: "observed",
    });
    const plan = await service.planGeneration({
      caller,
      targets: [chapterTarget],
      options: { dryRun: true },
    });
    expect(plan.planned).toEqual([]);
    expect(plan.skipped[0]?.reason).toBe("content-exists");
  });

  test.each([false, true])(
    "force records the observed revision (dryRun=%s)",
    async (dryRun) => {
      const { service, entityService } = createFixture();
      const read = spyOn(
        entityService,
        "getEntityWriteSnapshot",
      ).mockResolvedValue({ entity: existingEntity, revision: "observed" });
      const plan = await service.planGeneration({
        caller,
        targets: [chapterTarget],
        options: { force: true, dryRun },
      });
      expect(read).toHaveBeenCalledTimes(1);
      expect(plan.planned[0]?.jobData.expectedRevision).toBe("observed");
    },
  );

  test("force on missing output still requires absence", async () => {
    const { service } = createFixture();
    const plan = await service.planGeneration({
      caller,
      targets: [chapterTarget],
      options: { force: true },
    });
    expect(plan.planned[0]?.jobData.expectedRevision).toBeNull();
  });

  test("reports missing and non-generatable templates", async () => {
    const { service, templateRegistry } = createFixture();
    templateRegistry.register("books:static", {
      name: "books:static",
      description: "Static",
      schema: z.string(),
      requiredPermission: "public",
    });
    const plan = await service.planGeneration({
      caller,
      targets: [
        { ...chapterTarget, templateName: "books:missing" },
        {
          ...chapterTarget,
          templateName: "books:static",
          destination: { ...chapterTarget.destination, idPath: ["different"] },
        },
      ],
    });
    expect(plan.skipped.map((item) => item.reason)).toEqual([
      "template-not-found",
      "template-cannot-generate",
    ]);
  });

  test.each([
    "duplicate",
    "unknown-type",
    "unsafe-path",
    "missing-formatter",
  ] as const)("rejects %s before any entity reads", async (invalid) => {
    const { service, entityService, templateRegistry } = createFixture();
    const read = spyOn(entityService, "getEntityWriteSnapshot");
    if (invalid === "missing-formatter") {
      const template = generationTemplate();
      delete template.formatter;
      templateRegistry.register("books:chapter", template);
    }
    const target = {
      ...chapterTarget,
      destination: {
        ...chapterTarget.destination,
        ...(invalid === "unknown-type" && { entityType: "unknown" }),
        ...(invalid === "unsafe-path" && { idPath: ["../chapter"] as const }),
      },
    };
    expect(
      service.planGeneration({
        caller,
        targets: invalid === "duplicate" ? [target, target] : [target],
      }),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});

describe("ContentGenerationJobHandler", () => {
  test("oversized durable payloads fail terminally before entity reads or AI", async () => {
    const { service, entityService } = createFixture();
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    const data = {
      ...jobData,
      context: { prompt: "x".repeat(MAX_GENERATION_REQUEST_BYTES) },
    };
    const read = spyOn(entityService, "getEntityWriteSnapshot");
    const generate = spyOn(service, "generateContent");
    // The payload schema owns the limit; the worker never processes invalid data.
    expect(handler.validateAndParse(data)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  test("already aborted work performs no entity reads, AI calls or mutations", async () => {
    const { service, entityService } = createFixture();
    const read = spyOn(entityService, "getEntityWriteSnapshot");
    const generate = spyOn(service, "generateContent");
    const create = spyOn(entityService, "createEntity");
    const reason = new Error("worker cancelled");
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    expect(
      handler.process(
        jobData,
        "cancelled",
        createMockProgressReporter(),
        AbortSignal.abort(reason),
      ),
    ).rejects.toBe(reason);
    expect(read).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test.each(["generation", "formatting"] as const)(
    "cancellation during %s prevents persistence",
    async (stage) => {
      const { service, entityService } = createFixture();
      const controller = new AbortController();
      const reason = new Error("worker cancelled");
      const generate = spyOn(service, "generateContent").mockImplementation(
        async (_template, _context, options) => {
          expect(options?.signal).toBe(controller.signal);
          if (stage === "generation") controller.abort(reason);
          return "late output";
        },
      );
      const format = spyOn(service, "formatContent").mockImplementation(() => {
        controller.abort(reason);
        return "formatted";
      });
      const create = spyOn(entityService, "createEntity");
      const handler = ContentGenerationJobHandler.createFresh(
        service,
        entityService,
      );
      expect(
        handler.process(
          jobData,
          "cancelled",
          createMockProgressReporter(),
          controller.signal,
        ),
      ).rejects.toBe(reason);
      expect(generate).toHaveBeenCalledTimes(1);
      if (stage === "generation") expect(format).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  test.each(["sdk-output", "schema-output", "entity-validation"] as const)(
    "treats %s as terminal",
    async (kind) => {
      const { service, entityService } = createFixture();
      const invalid = z.string().safeParse(42);
      if (invalid.success) throw new Error("Expected schema rejection");
      const error =
        kind === "sdk-output"
          ? new AIOutputValidationError(new Error("invalid JSON"))
          : kind === "entity-validation"
            ? new EntityValidationError("book-section", invalid.error)
            : invalid.error;
      const generate = spyOn(service, "generateContent").mockResolvedValue(
        "body",
      );
      spyOn(service, "formatContent").mockReturnValue("body");
      if (kind === "entity-validation")
        spyOn(entityService, "createEntity").mockRejectedValue(error);
      else generate.mockRejectedValue(error);
      const handler = ContentGenerationJobHandler.createFresh(
        service,
        entityService,
      );
      expect(
        handler.process(jobData, "invalid", createMockProgressReporter()),
      ).rejects.toBe(error);
    },
  );

  test("a removed generation template is denied before any provider call", async () => {
    const { service, entityService } = createFixture();
    const generate = spyOn(service, "generateContent");
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    expect(
      handler.process(
        { ...jobData, templateName: "books:removed" },
        "invalid",
        createMockProgressReporter(),
      ),
      // Authorization resolves the template first, so a missing template is a
      // denial: the job carries no authority for a template that no longer exists.
    ).rejects.toThrow("Content generation is not permitted");
    expect(generate).not.toHaveBeenCalled();
  });

  test.each(["generation", "formatting", "persistence"] as const)(
    "propagates %s failures to the queue",
    async (stage) => {
      const { service, entityService } = createFixture();
      const error = new Error(`${stage} failed`);
      const generate = spyOn(service, "generateContent").mockResolvedValue({
        body: "body",
      });
      const format = spyOn(service, "formatContent").mockReturnValue("body");
      const create = spyOn(entityService, "createEntity");
      if (stage === "generation") generate.mockRejectedValue(error);
      if (stage === "formatting")
        format.mockImplementation(() => {
          throw error;
        });
      if (stage === "persistence") create.mockRejectedValue(error);
      const handler = ContentGenerationJobHandler.createFresh(
        service,
        entityService,
      );
      const result = handler.process(
        jobData,
        "job-failure",
        createMockProgressReporter(),
      );
      if (stage === "formatting") {
        expect(result).rejects.toMatchObject({ cause: error });
      } else {
        expect(result).rejects.toBe(error);
      }
      if (stage !== "persistence") expect(create).not.toHaveBeenCalled();
    },
  );

  test("rejects a datasource without scoped generation rather than falling back", async () => {
    const { service, entityService, dataSourceRegistry } = createFixture();
    const generate = mock(async () => "Unscoped output");
    spyOn(dataSourceRegistry, "get").mockReturnValue({
      id: "shell:ai-content",
      name: "Unscoped",
      generate: async (_request, schema) => schema.parse(await generate()),
    });
    const create = spyOn(entityService, "createEntity");
    const outcome = await ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    )
      .process(jobData, "unsupported", createMockProgressReporter())
      .catch((error: unknown) => error);
    // A configuration gap is terminal, but it is not an authorization failure.
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).toMatchObject({
      message: expect.stringContaining("visibility-scoped generation"),
    });
    expect(generate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test("forwards complete context and persists no-layout output with a condition", async () => {
    const { service, entityService, dataSourceRegistry } = createFixture();
    spyOn(dataSourceRegistry, "get").mockReturnValue({
      id: "shell:ai-content",
      name: "AI content",
      generateScoped: async (_request, schema) =>
        schema.parse({ title: "Arrival", body: "The opening chapter." }),
    });
    const generate = spyOn(service, "generateContent");
    const create = spyOn(entityService, "createEntity");
    const context = {
      ...chapterTarget.context,
      representedIdentity: "anchor" as const,
      styleGuide: { voice: "Warm", visual: "Minimal" },
      conversationHistory: "Discussion",
      prompt: "Introduce the subject",
    };
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    expect(
      await handler.process(
        { ...jobData, context },
        "job",
        createMockProgressReporter(),
      ),
    ).toEqual({ entityType: "book-section", entityId: existingEntity.id });
    expect(generate).toHaveBeenCalledWith("books:chapter", context, {
      visibilityScope: "public",
    });
    expect(create).toHaveBeenCalledWith({
      entity: {
        id: existingEntity.id,
        entityType: "book-section",
        content: "# Arrival\n\nThe opening chapter.",
        metadata: chapterTarget.destination.metadata,
        visibility: "public",
      },
      options: {
        beforeWrite: expect.any(Function),
        conditionalWrite: { expectedRevision: null },
      },
    });
  });

  test("replaces only the planned revision", async () => {
    const { service, entityService } = createFixture();
    spyOn(service, "generateContent").mockResolvedValue("New chapter");
    spyOn(service, "formatContent").mockReturnValue("New chapter");
    spyOn(entityService, "getEntityWriteSnapshot").mockResolvedValue({
      entity: existingEntity,
      revision: "observed",
    });
    const update = spyOn(entityService, "updateEntity");
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    await handler.process(
      { ...jobData, expectedRevision: "observed" },
      "job",
      createMockProgressReporter(),
    );
    expect(update).toHaveBeenCalledWith({
      entity: { ...existingEntity, content: "New chapter" },
      options: {
        beforeWrite: expect.any(Function),
        conditionalWrite: { expectedRevision: "observed" },
      },
    });
  });

  test("a progress failure after the commit does not fail the job", async () => {
    const { service, entityService } = createFixture();
    spyOn(service, "generateContent").mockResolvedValue("body");
    spyOn(service, "formatContent").mockReturnValue("body");
    const create = spyOn(entityService, "createEntity");
    const progress = createMockProgressReporter();
    spyOn(progress, "report").mockImplementation(
      async ({ progress: value }) => {
        if (value === 3) throw new Error("notification failed");
      },
    );
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    // Jobs run at most once: after the commit nothing may turn success into
    // a failure the queue would report as "nothing written".
    expect(await handler.process(jobData, "job", progress)).toEqual({
      entityType: "book-section",
      entityId: existingEntity.id,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("rejects an already stale plan before calling AI", async () => {
    const { service, entityService } = createFixture();
    spyOn(entityService, "getEntityWriteSnapshot").mockResolvedValue({
      entity: existingEntity,
      revision: "newer",
    });
    const generate = spyOn(service, "generateContent");
    const handler = ContentGenerationJobHandler.createFresh(
      service,
      entityService,
    );
    expect(
      handler.process(
        { ...jobData, expectedRevision: "observed" },
        "job",
        createMockProgressReporter(),
      ),
    ).rejects.toBeInstanceOf(EntityWriteConflictError);
    expect(generate).not.toHaveBeenCalled();
  });
});
