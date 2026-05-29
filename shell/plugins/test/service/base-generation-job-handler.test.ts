import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils";
import {
  createMockEntityPluginContext,
  createMockEntityService,
} from "@brains/test-utils";
import type {
  BaseEntity,
  EntityAdapter,
  EntityMutationResult,
} from "@brains/entity-service";
import type { GenerationResult } from "@brains/contracts";
import { ProgressReporter } from "@brains/utils";
import type { EntityPluginContext } from "../../src/entity/context";
import {
  BaseGenerationJobHandler,
  type GeneratedContent,
} from "../../src/service/base-generation-job-handler";

const baseTestSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  metadata: z.record(z.string(), z.unknown()),
  contentHash: z.string(),
});

function createTestAdapter(
  stubPreservedFields: readonly string[],
): EntityAdapter<BaseEntity> {
  return {
    entityType: "base",
    schema: baseTestSchema,
    stubPreservedFields,
    toMarkdown: (entity) => entity.content,
    fromMarkdown: () => ({}),
    extractMetadata: (entity) => entity.metadata,
    parseFrontMatter: (): never => {
      throw new Error("not used in this test");
    },
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}

const testJobSchema = z.object({
  entityId: z.string().optional(),
  shouldFail: z.boolean().optional(),
});

type TestJobData = z.infer<typeof testJobSchema>;
type TestGenerationResult = GenerationResult & { slug?: string };

class TestGenerationHandler extends BaseGenerationJobHandler<
  TestJobData,
  TestGenerationResult
> {
  constructor(context: EntityPluginContext) {
    super(context.logger, context, {
      schema: testJobSchema,
      jobTypeName: "test-generation",
      entityType: "base",
    });
  }

  protected async generate(data: TestJobData): Promise<GeneratedContent> {
    if (data.shouldFail) {
      this.failEarly("planned failure");
    }

    return {
      id: "generated-id",
      content: "---\ntitle: Generated\nslug: generated-id\n---\nGenerated body",
      metadata: { title: "Generated", slug: "generated-id", status: "draft" },
      title: "Generated",
      resultExtras: { slug: "generated-id" },
    };
  }
}

function createProgressReporter(): ProgressReporter {
  const reporter = ProgressReporter.from(mock(() => Promise.resolve()));
  if (!reporter) throw new Error("Expected progress reporter");
  return reporter;
}

function createTrackingContext(stub: BaseEntity): {
  context: EntityPluginContext;
  getCreatedEntity: () => unknown;
  getUpdatedEntity: () => BaseEntity | undefined;
} {
  let createdEntity: unknown;
  let updatedEntity: BaseEntity | undefined;
  const entityService = createMockEntityService({
    returns: { getEntity: stub },
  });
  entityService.createEntity = async (
    request,
  ): Promise<EntityMutationResult> => {
    createdEntity = request.entity;
    return {
      entityId: request.entity.id ?? "created-id",
      jobId: "job-id",
      skipped: false,
    };
  };
  entityService.updateEntity = async (
    request,
  ): Promise<EntityMutationResult> => {
    updatedEntity = request.entity;
    return { entityId: request.entity.id, jobId: "job-id", skipped: false };
  };

  const context = createMockEntityPluginContext({ entityService });
  const adapter = createTestAdapter(["coverImageId"]);
  context.entities.getAdapter = mock(() => adapter);

  return {
    context,
    getCreatedEntity: () => createdEntity,
    getUpdatedEntity: () => updatedEntity,
  };
}

function createStub(overrides: Partial<BaseEntity> = {}): BaseEntity {
  const now = new Date().toISOString();
  return {
    id: "stub-id",
    entityType: "base",
    content:
      "---\ntitle: Stub\nstatus: generating\ncoverImageId: cover-1\n---\n",
    contentHash: "stub-hash",
    visibility: "public",
    created: now,
    updated: now,
    metadata: { title: "Stub", status: "generating" },
    ...overrides,
  };
}

describe("BaseGenerationJobHandler", () => {
  it("updates a pre-allocated generation stub instead of creating a new entity", async () => {
    const stub = createStub();
    const { context, getCreatedEntity, getUpdatedEntity } =
      createTrackingContext(stub);
    const handler = new TestGenerationHandler(context);

    const result = await handler.process(
      { entityId: "stub-id" },
      "job-1",
      createProgressReporter(),
    );

    expect(result).toEqual({
      success: true,
      entityId: "stub-id",
      slug: "stub-id",
    });
    expect(getCreatedEntity()).toBeUndefined();
    const updatedEntity = getUpdatedEntity();
    expect(updatedEntity?.id).toBe("stub-id");
    expect(updatedEntity?.metadata["status"]).toBe("draft");
    expect(updatedEntity?.metadata["slug"]).toBe("stub-id");
    expect(updatedEntity?.content).toContain("slug: stub-id");
    expect(updatedEntity?.content).toContain("coverImageId: cover-1");
  });

  it("marks a pre-allocated stub failed on controlled generation failure", async () => {
    const stub = createStub();
    const { context, getUpdatedEntity } = createTrackingContext(stub);
    const handler = new TestGenerationHandler(context);

    const result = await handler.process(
      { entityId: "stub-id", shouldFail: true },
      "job-1",
      createProgressReporter(),
    );

    expect(result).toEqual({ success: false, error: "planned failure" });
    const updatedEntity = getUpdatedEntity();
    expect(updatedEntity?.metadata["status"]).toBe("failed");
    expect(updatedEntity?.metadata["error"]).toBe("planned failure");
    expect(updatedEntity?.content).toContain("status: failed");
    expect(updatedEntity?.content).toContain("error: planned failure");
  });
});
