import { describe, expect, mock, spyOn, test, type Mock } from "bun:test";
import { z } from "@brains/utils/zod";
import { PermissionService, InMemoryTemplateRegistry } from "@brains/templates";
import {
  createMockEntityService,
  createMockDataSourceRegistry,
} from "@brains/entity-service/test";
import { createMockAIService } from "@brains/ai-service/test";
import {
  createSilentLogger,
  createMockProgressReporter,
} from "@brains/test-utils";
import { NonRetryableJobError } from "@brains/job-queue";
import { ContentService } from "../src/content-service";
import { ContentGenerationJobHandler } from "../src/handlers/contentGenerationJobHandler";
import {
  GenerationAuthorizer,
  GenerationAuthorizationError,
  generationAuthoritySchema,
  type GenerationCaller,
  type GenerationPrincipal,
} from "../src/generation-authorization";

const caller: GenerationCaller = {
  actor: { kind: "user", userId: "usr_author" },
  permissionLevel: "admin",
};
const target = {
  templateName: "books:chapter",
  destination: {
    entityType: "book-section",
    idPath: ["chapter"] as const,
    metadata: {},
  },
};

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected rejection");
    },
    (error: unknown) => error,
  );
}

function fixture(): {
  permissions: PermissionService;
  principal: Mock<() => Promise<GenerationPrincipal | null>>;
  authorizer: GenerationAuthorizer;
  entities: ReturnType<typeof createMockEntityService>;
  templates: InMemoryTemplateRegistry;
  service: ContentService;
} {
  const permissions = new PermissionService({
    entityActions: {
      "book-section": {
        create: "trusted",
        update: "trusted",
        publish: "admin",
      },
    },
  });
  const principal = mock(async (): Promise<GenerationPrincipal | null> => ({
    userId: "usr_author",
    permissionLevel: "admin",
  }));
  const authorizer = new GenerationAuthorizer(permissions, principal);
  const logger = createSilentLogger();
  const entities = createMockEntityService({ entityTypes: ["book-section"] });
  const templates = InMemoryTemplateRegistry.createFresh(logger);
  templates.register(target.templateName, {
    name: target.templateName,
    description: "Chapter",
    requiredPermission: "trusted",
    basePrompt: "Write",
    dataSourceId: "shell:ai-content",
    schema: z.string(),
    formatter: {
      format: (value) => z.string().parse(value),
      parse: (value) => value,
    },
  });
  const service = new ContentService({
    logger,
    entityService: entities,
    templateRegistry: templates,
    dataSourceRegistry: createMockDataSourceRegistry(),
    aiService: createMockAIService(),
    generationAuthorizer: authorizer,
  });
  return { permissions, principal, authorizer, entities, templates, service };
}

describe("generation delegation", () => {
  test("requires an account binding and rejects user substitution", () => {
    expect(
      generationAuthoritySchema.safeParse({
        actor: caller.actor,
        permissionCeiling: "admin",
      }).success,
    ).toBe(false);
    expect(
      generationAuthoritySchema.safeParse({
        actor: caller.actor,
        permissionCeiling: "admin",
        principalId: "usr_other",
      }).success,
    ).toBe(false);
  });

  test("permissions cannot grow beyond the admitted ceiling", async () => {
    const { authorizer, principal } = fixture();
    const { authority } = await authorizer.admit({
      ...caller,
      permissionLevel: "trusted",
    });
    expect(await authorizer.resolve(authority)).toEqual({
      permissionLevel: "trusted",
      visibilityScope: "shared",
    });
    principal.mockResolvedValue({
      userId: "usr_author",
      permissionLevel: "public",
    });
    expect(await authorizer.resolve(authority)).toEqual({
      permissionLevel: "public",
      visibilityScope: "public",
    });
  });

  test("a missing/suspended principal and a rebound external identity fail closed", async () => {
    const { authorizer, principal } = fixture();
    const { authority } = await authorizer.admit({
      actor: { kind: "external", externalActorId: "ext_original" },
      permissionLevel: "trusted",
    });
    principal.mockResolvedValue({
      userId: "usr_other",
      permissionLevel: "admin",
    });
    expect(await rejection(authorizer.resolve(authority))).toBeInstanceOf(
      GenerationAuthorizationError,
    );
    principal.mockResolvedValue(null);
    expect(await rejection(authorizer.resolve(authority))).toBeInstanceOf(
      GenerationAuthorizationError,
    );
  });

  test("service authority comes from current configured grants, not an admin ceiling", async () => {
    const permissions = new PermissionService({ trusted: ["service:books"] });
    const principal = mock(async () => null);
    const authorizer = new GenerationAuthorizer(permissions, principal);
    const { authority } = await authorizer.admit({
      actor: { kind: "service", serviceId: "books" },
      permissionLevel: "admin",
    });
    expect(authority.permissionCeiling).toBe("trusted");
    permissions.replaceRuntimePrincipalState({ grants: [], anchors: [] });
    expect((await authorizer.resolve(authority)).permissionLevel).toBe(
      "public",
    );
    expect(principal).not.toHaveBeenCalled();
  });
});

describe("generation policy boundaries", () => {
  test.each([false, true])(
    "denied templates reveal no existence/skip information (dryRun=%s)",
    async (dryRun) => {
      const { service, entities } = fixture();
      const read = spyOn(entities, "getEntityWriteSnapshot");
      expect(
        await rejection(
          service.planGeneration({
            caller: { ...caller, permissionLevel: "public" },
            targets: [target],
            options: { dryRun },
          }),
        ),
      ).toBeInstanceOf(GenerationAuthorizationError);
      expect(read).not.toHaveBeenCalled();
    },
  );

  test("entity create policy is enforced even for a public template", async () => {
    const { service, entities, templates } = fixture();
    const template = templates.get(target.templateName);
    if (!template) throw new Error("Missing template");
    templates.register(target.templateName, {
      ...template,
      requiredPermission: "public",
    });
    const read = spyOn(entities, "getEntityWriteSnapshot");
    const denied = await rejection(
      service.planGeneration({
        caller: { ...caller, permissionLevel: "public" },
        targets: [target],
      }),
    );
    expect(denied).toBeInstanceOf(GenerationAuthorizationError);
    expect(read).not.toHaveBeenCalled();
  });

  test("revocation during planning prevents returning existence decisions", async () => {
    const { service, entities, principal } = fixture();
    spyOn(entities, "getEntityWriteSnapshot").mockImplementation(async () => {
      principal.mockResolvedValue(null);
      return null;
    });
    expect(
      await rejection(service.planGeneration({ caller, targets: [target] })),
    ).toBeInstanceOf(GenerationAuthorizationError);
  });

  test("new output visibility is explicit and reads use the admitted caller scope", async () => {
    const { service, entities } = fixture();
    const read = spyOn(entities, "getEntityWriteSnapshot");
    const result = await service.planGeneration({
      caller: { ...caller, permissionLevel: "trusted" },
      targets: [
        {
          ...target,
          destination: { ...target.destination, visibility: "shared" },
        },
      ],
    });
    expect(read).toHaveBeenCalledWith({
      entityType: "book-section",
      id: "chapter",
      visibilityScope: "shared",
    });
    expect(result.planned[0]?.jobData).toMatchObject({
      authority: { principalId: "usr_author", permissionCeiling: "trusted" },
      destination: { visibility: "shared" },
      expectedRevision: null,
    });
  });

  test("validates authorization for every target before any entity reads", async () => {
    const { service, entities } = fixture();
    const read = spyOn(entities, "getEntityWriteSnapshot");
    const denied = await rejection(
      service.planGeneration({
        caller: { ...caller, permissionLevel: "trusted" },
        targets: [
          target,
          {
            ...target,
            destination: {
              ...target.destination,
              idPath: ["secret"],
              visibility: "restricted",
            },
          },
        ],
      }),
    );
    expect(denied).toBeInstanceOf(GenerationAuthorizationError);
    expect(read).not.toHaveBeenCalled();
  });

  test("scopes forced reads, preserves visibility, and refuses a requested visibility change", async () => {
    const { service, entities } = fixture();
    const read = spyOn(entities, "getEntityWriteSnapshot").mockResolvedValue({
      revision: "observed",
      entity: {
        id: "chapter",
        entityType: "book-section",
        metadata: {},
        content: "Private",
        visibility: "restricted",
        contentHash: "hash",
        created: "2026-01-01",
        updated: "2026-01-01",
      },
    });
    const result = await service.planGeneration({
      caller,
      targets: [target],
      options: { force: true },
    });
    expect(read).toHaveBeenCalledWith({
      entityType: "book-section",
      id: "chapter",
      visibilityScope: "restricted",
    });
    expect(result.planned[0]?.jobData.destination.visibility).toBe(
      "restricted",
    );
    const denied = await rejection(
      service.planGeneration({
        caller,
        targets: [
          {
            ...target,
            destination: { ...target.destination, visibility: "public" },
          },
        ],
        options: { force: true },
      }),
    );
    expect(denied).toBeInstanceOf(GenerationAuthorizationError);
  });

  test("create/update/publish action policy is applied to destination metadata", async () => {
    const { authorizer, entities } = fixture();
    spyOn(entities, "getEntityTypeConfig").mockReturnValue({
      publish: { publishStatuses: ["published"] },
    });
    const access = {
      permissionLevel: "trusted",
      visibilityScope: "shared",
    } as const;
    expect(() =>
      authorizer.assertWrite(
        access,
        {
          entityType: "book-section",
          visibility: "public",
          metadata: { status: "published" },
        },
        false,
        entities,
      ),
    ).toThrow(GenerationAuthorizationError);
    expect(() =>
      authorizer.assertWrite(
        access,
        {
          entityType: "book-section",
          visibility: "public",
          metadata: { status: "published" },
        },
        true,
        entities,
      ),
    ).toThrow(GenerationAuthorizationError);
  });

  test.each(["public", null] as const)(
    "revocation (%s) before execution prevents output reads and AI",
    async (level) => {
      const { service, entities, principal } = fixture();
      const plan = await service.planGeneration({ caller, targets: [target] });
      const data = plan.planned[0]?.jobData;
      if (!data) throw new Error("Missing planned target");
      principal.mockResolvedValue(
        level ? { userId: "usr_author", permissionLevel: level } : null,
      );
      const read = spyOn(entities, "getEntityWriteSnapshot").mockClear();
      const generate = spyOn(service, "generateContent");
      const denied = await rejection(
        ContentGenerationJobHandler.createFresh(service, entities).process(
          data,
          "job",
          createMockProgressReporter(),
        ),
      );
      expect(denied).toBeInstanceOf(NonRetryableJobError);
      expect(read).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    },
  );

  test("revocation during generation prevents persistence", async () => {
    const { service, entities, principal } = fixture();
    const plan = await service.planGeneration({ caller, targets: [target] });
    const data = plan.planned[0]?.jobData;
    if (!data) throw new Error("Missing planned target");
    spyOn(service, "generateContent").mockImplementation(async () => {
      principal.mockResolvedValue(null);
      return "Generated";
    });
    const create = spyOn(entities, "createEntity");
    const denied = await rejection(
      ContentGenerationJobHandler.createFresh(service, entities).process(
        data,
        "job",
        createMockProgressReporter(),
      ),
    );
    expect(denied).toMatchObject({
      name: "NonRetryableJobError",
      cause: { name: "GenerationAuthorizationError" },
    });
    // The guard runs at the write boundary, so the mutation aborts instead of
    // committing; persistence rolls back rather than never being attempted.
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("resolver infrastructure errors retain the queue's retry policy", async () => {
    const { service, entities, principal } = fixture();
    const plan = await service.planGeneration({ caller, targets: [target] });
    const data = plan.planned[0]?.jobData;
    if (!data) throw new Error("Missing planned target");
    const error = new Error("auth database busy");
    principal.mockRejectedValue(error);
    const denied = await rejection(
      ContentGenerationJobHandler.createFresh(service, entities).process(
        data,
        "job",
        createMockProgressReporter(),
      ),
    );
    expect(denied).toBe(error);
  });
});
