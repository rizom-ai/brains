import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils";
import {
  createMockEntityPluginContext,
  createMockEntityService,
} from "@brains/test-utils";
import type { BaseEntity, EntityMutationResult } from "@brains/entity-service";
import type { GenerationResult } from "@brains/contracts";
import { ProgressReporter } from "@brains/utils";
import type { EntityPluginContext } from "../../src/entity/context";
import {
  BaseGenerationJobHandler,
  type GeneratedContent,
} from "../../src/service/base-generation-job-handler";

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
      entityType: "note",
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

class BodyOnlyGenerationHandler extends BaseGenerationJobHandler<
  TestJobData,
  GenerationResult
> {
  constructor(context: EntityPluginContext) {
    super(context.logger, context, {
      schema: testJobSchema,
      jobTypeName: "body-only-generation",
      entityType: "note",
    });
  }

  protected async generate(): Promise<GeneratedContent> {
    return {
      id: "generated-id",
      content: "Generated body",
      metadata: { title: "Generated Body Only" },
      title: "Generated Body Only",
    };
  }
}

class ConflictGenerationHandler extends BaseGenerationJobHandler<
  TestJobData,
  GenerationResult
> {
  constructor(context: EntityPluginContext) {
    super(context.logger, context, {
      schema: testJobSchema,
      jobTypeName: "conflict-generation",
      entityType: "note",
    });
  }

  protected async generate(): Promise<GeneratedContent> {
    return {
      id: "generated-id",
      content:
        "---\ncategory: generated-category\nstatus: draft\n---\nGenerated body",
      metadata: { title: "Generated", status: "draft" },
      title: "Generated",
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
    entityType: "note",
    content:
      "---\ntitle: Stub\nstatus: generating\ncoverImageId: cover-1\ncustomAttached: custom-1\n---\n",
    contentHash: "stub-hash",
    visibility: "public",
    created: now,
    updated: now,
    metadata: {
      title: "Stub",
      status: "generating",
      customAttached: "custom-1",
    },
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
    expect(updatedEntity?.metadata["customAttached"]).toBe("custom-1");
    expect(updatedEntity?.content).toContain("slug: stub-id");
    expect(updatedEntity?.content).toContain("coverImageId: cover-1");
    expect(updatedEntity?.content).toContain("customAttached: custom-1");
  });

  it("clears failed-stub lifecycle fields after successful generation", async () => {
    const stub = createStub({
      content:
        "---\ntitle: Stub\nstatus: failed\nerror: Previous failure\ncoverImageId: cover-1\n---\n",
      metadata: {
        title: "Stub",
        status: "failed",
        error: "Previous failure",
      },
    });
    const { context, getUpdatedEntity } = createTrackingContext(stub);
    const handler = new TestGenerationHandler(context);

    await handler.process(
      { entityId: "stub-id" },
      "job-1",
      createProgressReporter(),
    );

    const updatedEntity = getUpdatedEntity();
    expect(updatedEntity?.metadata["status"]).toBe("draft");
    expect(updatedEntity?.metadata["error"]).toBeUndefined();
    expect(updatedEntity?.content).toContain("status: draft");
    expect(updatedEntity?.content).not.toContain("error:");
  });

  it("applies metadata to frontmatter when generated content has no frontmatter", async () => {
    const stub = createStub();
    const { context, getUpdatedEntity } = createTrackingContext(stub);
    const handler = new BodyOnlyGenerationHandler(context);

    await handler.process(
      { entityId: "stub-id" },
      "job-1",
      createProgressReporter(),
    );

    const updatedEntity = getUpdatedEntity();
    expect(updatedEntity?.metadata["title"]).toBe("Generated Body Only");
    expect(updatedEntity?.metadata["status"]).toBeUndefined();
    expect(updatedEntity?.content).toContain("title: Generated Body Only");
    expect(updatedEntity?.content).toContain("coverImageId: cover-1");
    expect(updatedEntity?.content).toContain("customAttached: custom-1");
    expect(updatedEntity?.content).not.toContain("status:");
    expect(updatedEntity?.content).toContain("Generated body");
  });

  it("lets generated content frontmatter win over stub frontmatter on conflict", async () => {
    const stub = createStub({
      content:
        "---\ntitle: Stub\nstatus: generating\ncategory: stub-category\n---\n",
      metadata: {
        title: "Stub",
        status: "generating",
        category: "stub-category",
      },
    });
    const { context, getUpdatedEntity } = createTrackingContext(stub);
    const handler = new ConflictGenerationHandler(context);

    await handler.process(
      { entityId: "stub-id" },
      "job-1",
      createProgressReporter(),
    );

    const updatedEntity = getUpdatedEntity();
    expect(updatedEntity?.content).toContain("category: generated-category");
    expect(updatedEntity?.content).not.toContain("category: stub-category");
  });

  it("rejects the merge when a required frontmatter field is missing", async () => {
    const stub = createStub();
    const { context, getUpdatedEntity } = createTrackingContext(stub);
    // Effective schema requires `status`; the body-only generator emits none,
    // and the stub's `status` is stripped as a lifecycle field — so the merge
    // must fail validation rather than silently saving an invalid entity.
    const requiredStatusSchema = z.object({
      title: z.string(),
      status: z.string(),
    });
    context.entities.getEffectiveFrontmatterSchema = mock(
      () => requiredStatusSchema,
    );
    const handler = new BodyOnlyGenerationHandler(context);

    const result = await handler.process(
      { entityId: "stub-id" },
      "job-1",
      createProgressReporter(),
    );

    expect(result.success).toBe(false);
    // The guard fired before the draft save: the stub was marked failed, not
    // flipped to draft.
    const updatedEntity = getUpdatedEntity();
    expect(updatedEntity?.metadata["status"]).toBe("failed");
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
