import { describe, expect, spyOn, test } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import {
  contentGenerationJobDataSchema,
  MAX_GENERATION_TARGETS,
  GenerationLimitError,
  type ContentGenerationItemResult,
  type ContentGenerationTargetInput,
} from "@brains/content-service";

const jobIdOf = (
  item: ContentGenerationItemResult | undefined,
): string | undefined => (item?.status === "queued" ? item.jobId : undefined);
import { z } from "@brains/utils/zod";
import { PermissionService } from "@brains/templates";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";

function fixture(): {
  shell: ReturnType<typeof createMockShell>;
  context: ReturnType<typeof createServicePluginContext>;
  target: (id: string, templateName?: string) => ContentGenerationTargetInput;
} {
  const entityService = createMockEntityService({
    entityTypes: ["book-section"],
  });
  const shell = createMockShell({ entityService });
  const permissions = new PermissionService({ trusted: ["service:books"] });
  shell.getPermissionService = (): PermissionService => permissions;
  const context = createServicePluginContext(shell, "books");
  context.templates.register({
    chapter: {
      name: "chapter",
      description: "A chapter",
      requiredPermission: "trusted",
      schema: z.string(),
      basePrompt: "Write a chapter",
      dataSourceId: "shell:ai-content",
      formatter: {
        format: (value) => z.string().parse(value),
        parse: (value) => value,
      },
    },
  });
  const target = (
    id: string,
    templateName = "chapter",
  ): ContentGenerationTargetInput => ({
    templateName,
    destination: {
      entityType: "book-section",
      idPath: [id],
      metadata: { title: id },
    },
  });
  return { shell, context, target };
}

describe("service content admission", () => {
  test.each([false, true])(
    "oversized requests never plan or enqueue (dryRun=%s)",
    async (dryRun) => {
      const { shell, context, target } = fixture();
      const plan = spyOn(shell.getContentService(), "planGeneration");
      const enqueue = spyOn(shell.getJobQueueService(), "enqueue");
      const outcome = await context.content
        .generate({
          targets: Array.from(
            { length: MAX_GENERATION_TARGETS + 1 },
            (_, index) => target(String(index)),
          ),
          dryRun,
        })
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(GenerationLimitError);
      // Planning owns the single limit check and rejects before any read.
      expect(plan).toHaveBeenCalledTimes(1);
      expect(
        shell.getEntityService().getEntityWriteSnapshot,
      ).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
  test("pre-aborted requests do not plan or enqueue", async () => {
    const { shell, context, target } = fixture();
    const plan = spyOn(shell.getContentService(), "planGeneration");
    const enqueue = spyOn(shell.getJobQueueService(), "enqueue");
    const reason = new Error("cancelled admission");
    const outcome = await context.content
      .generate({
        targets: [target("chapter")],
        signal: AbortSignal.abort(reason),
      })
      .catch((error: unknown) => error);
    expect(outcome).toBe(reason);
    expect(plan).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
  test("cancellation during planning stops reads and prevents admission", async () => {
    const { shell, context, target } = fixture();
    const controller = new AbortController();
    const reason = new Error("cancelled during read");
    const read = spyOn(
      shell.getEntityService(),
      "getEntityWriteSnapshot",
    ).mockImplementation(async () => {
      controller.abort(reason);
      return null;
    });
    const enqueue = spyOn(shell.getJobQueueService(), "enqueue");
    const outcome = await context.content
      .generate({
        targets: [target("one"), target("two")],
        signal: controller.signal,
      })
      .catch((error: unknown) => error);
    expect(outcome).toBe(reason);
    // Existence reads run together; cancellation is honoured before admission.
    expect(read).toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
  test("caller disconnect after enqueue does not cancel durable work or serialize its signal", async () => {
    const { shell, context, target } = fixture();
    const controller = new AbortController();
    const queue = shell.getJobQueueService();
    const enqueue = queue.enqueue.bind(queue);
    spyOn(queue, "enqueue").mockImplementation(async (request) => {
      const jobId = await enqueue(request);
      controller.abort(new Error("caller disconnected"));
      return jobId;
    });
    const result = await context.content.generate({
      targets: [target("chapter")],
      signal: controller.signal,
    });
    expect(controller.signal.aborted).toBe(true);
    expect(result.queuedTargets).toBe(1);
    if (!result.batchId) throw new Error("Expected admitted batch");
    // The shared root job ID is the durable batch correlation.
    const children = await queue.getJobsByRootJobId(result.batchId);
    expect(children).toHaveLength(1);
    const job = await queue.getStatus(jobIdOf(result.items[0]) ?? "");
    expect(job?.data).not.toContain("signal");
    expect(job?.status).toBe("pending");
  });
  test("dry runs preserve input order and enqueue nothing", async () => {
    const { shell, context, target } = fixture();
    const enqueue = spyOn(shell.getJobQueueService(), "enqueue");
    const result = await context.content.generate({
      targets: [target("skipped", "missing"), target("planned")],
      dryRun: true,
    });
    expect(result.items.map((item) => item.status)).toEqual([
      "skipped",
      "planned",
    ]);
    expect(result).toMatchObject({
      totalTargets: 2,
      plannedTargets: 1,
      queuedTargets: 0,
      skippedTargets: 1,
    });
    expect(result.batchId).toBeUndefined();
    expect(result.items.every((item) => item.status !== "queued")).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
  });
  test("maps each queued target to its own job under one shared root with tool attribution", async () => {
    const { shell, context, target } = fixture();
    const queue = shell.getJobQueueService();
    const toolContext = {
      interfaceType: "test",
      actor: { kind: "service" as const, serviceId: "books" },
      userPermissionLevel: "trusted" as const,
      progressToken: "progress-1",
    };
    const result = await context.content.generate({
      targets: [target("skipped", "missing"), target("first"), target("last")],
      toolContext,
    });
    expect(result.items.map((item) => item.status)).toEqual([
      "skipped",
      "queued",
      "queued",
    ]);
    expect(result.items.map(jobIdOf)).toEqual([undefined, "job-1", "job-2"]);
    if (!result.batchId) throw new Error("Missing batch");
    for (const item of result.items) {
      if (item.status !== "queued") continue;
      const child = await queue.getStatus(item.jobId);
      expect(child?.source).toBe("books");
      expect(child?.metadata.rootJobId).toBe(result.batchId);
      expect(child?.metadata.operationType).toBe("content_operations");
      expect(child?.metadata.requestedByActor).toEqual(toolContext.actor);
      // Progress for each generated target must reach the caller that asked.
      expect(child?.metadata.progressToken).toBe(toolContext.progressToken);
      const data = contentGenerationJobDataSchema.parse(
        JSON.parse(child?.data ?? "null"),
      );
      expect(data.destination.entityId).toBe(item.destination.entityId);
      expect(data.templateName).toBe("books:chapter");
    }
    // Children are recoverable from the queue's existing durable root index.
    expect(await queue.getJobsByRootJobId(result.batchId)).toHaveLength(2);
  });
  test("a tool caller's declared level cannot exceed the service's configured grant", async () => {
    const { shell, context, target } = fixture();
    const queue = shell.getJobQueueService();
    // The fixture grants service:books "trusted"; the caller claims "admin".
    const result = await context.content.generate({
      targets: [target("chapter")],
      toolContext: {
        interfaceType: "test",
        actor: { kind: "service", serviceId: "books" },
        userPermissionLevel: "admin",
      },
    });
    const jobId = jobIdOf(result.items[0]);
    if (!jobId) throw new Error("Expected an admitted target");
    const data = contentGenerationJobDataSchema.parse(
      JSON.parse((await queue.getStatus(jobId))?.data ?? "null"),
    );
    // Configured grants decide background authority, never the incoming level,
    // and the durable payload carries no flag that could skip that check.
    expect(data.authority.permissionCeiling).toBe("trusted");
    expect(JSON.stringify(data.authority)).not.toContain("runtimeGrant");
  });
  test("each submission reports its own child job IDs", async () => {
    const { context, target } = fixture();
    const request = { targets: [target("same")] };
    const first = await context.content.generate(request);
    const second = await context.content.generate(request);
    expect(jobIdOf(first.items[0])).toBe("job-1");
    expect(jobIdOf(second.items[0])).toBe("job-2");
    expect(first.batchId).not.toBe(second.batchId);
  });
  test("does not depend on an ambient root lookup to produce references", async () => {
    const { shell, context, target } = fixture();
    const read = spyOn(
      shell.getJobQueueService(),
      "getJobsByRootJobId",
    ).mockResolvedValue([]);
    const result = await context.content.generate({
      targets: [target("chapter")],
    });
    expect(result.queuedTargets).toBe(1);
    expect(jobIdOf(result.items[0])).toBe("job-1");
    expect(read).not.toHaveBeenCalled();
  });
  test("all-skipped and empty requests do not create a batch", async () => {
    const { shell, context, target } = fixture();
    const enqueue = spyOn(shell.getJobQueueService(), "enqueue");
    for (const targets of [[], [target("skipped", "missing")]]) {
      const result = await context.content.generate({ targets });
      expect(result.batchId).toBeUndefined();
      expect(result.queuedTargets).toBe(0);
    }
    expect(enqueue).not.toHaveBeenCalled();
  });
});
