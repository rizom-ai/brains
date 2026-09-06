import { beforeEach, describe, expect, it } from "bun:test";
import {
  baseEntitySchema,
  createMockShell,
  createTestEntityAdapter,
  type MockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  loadPipelineWidget,
  publicationPipelineWidget,
  type PipelineWidgetDeps,
} from "../src/lib/dashboard-widget";
import { ProviderRegistry } from "../src/provider-registry";
import { QueueManager } from "../src/queue-manager";
import { RetryTracker } from "../src/retry-tracker";
import type { PublicationPipelineSnapshot } from "../src/pipeline-snapshot";
import type { PipelineRuntime } from "../src/runtime";
import type { OperatorView } from "@brains/plugins";
import { PIPELINE_PLUGIN_ID, runtimeFor } from "./helpers/install";

/** What the declaration says it renders; the contract types both as optional. */
function declared<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Widget declares no ${what}`);
  return value;
}

/**
 * The widget is a declaration: an id, how it reads, and what it loads. The
 * runtime registers it and normalizes what it returns — covered where the
 * runtime is tested. What belongs here is what the pipeline actually says.
 */
describe("publication pipeline widget", () => {
  let runtime: PipelineRuntime;
  let mockShell: MockShell;
  let deps: PipelineWidgetDeps;

  /** The widget's own reading of a snapshot, which it always declares. */
  const digestOf = (data: PublicationPipelineSnapshot): unknown =>
    declared(publicationPipelineWidget.digest, "digest")({ data });
  const viewOf = (data: PublicationPipelineSnapshot): OperatorView =>
    declared(publicationPipelineWidget.view, "view")({ data });

  const load = (): Promise<PublicationPipelineSnapshot> =>
    loadPipelineWidget(runtime, deps)({ signal: new AbortController().signal });

  beforeEach(() => {
    mockShell = createMockShell({ logger: createSilentLogger() });
    runtime = runtimeFor(mockShell);
    for (const entityType of ["social-post", "workflow-card"]) {
      mockShell
        .getEntityRegistry()
        .registerEntityType(
          entityType,
          baseEntitySchema.partial().passthrough(),
          createTestEntityAdapter(entityType),
        );
    }

    const providerRegistry = ProviderRegistry.createFresh();
    providerRegistry.register("social-post", {
      name: "linkedin",
      publish: async () => ({ id: "remote-post" }),
    });
    deps = {
      providerRegistry,
      queueManager: QueueManager.createFresh(),
      retryTracker: RetryTracker.createFresh(),
    };
  });

  it("declares the primary read-only publication widget", () => {
    expect(publicationPipelineWidget).toMatchObject({
      id: "publication-pipeline",
      title: "Publication Pipeline",
      group: "publishing",
      placement: "primary",
      priority: 100,
      permission: "admin",
    });
  });

  it("uses the canonical provider-bounded pipeline snapshot", async () => {
    for (const entity of [
      {
        id: "draft-post",
        entityType: "social-post",
        content: "draft",
        metadata: { status: "draft", title: "Draft Post" },
      },
      {
        id: "queued-post",
        entityType: "social-post",
        content: "queued",
        metadata: { status: "queued" },
      },
      {
        id: "unrelated-draft",
        entityType: "workflow-card",
        content: "not publication content",
        metadata: { status: "draft" },
      },
    ]) {
      await mockShell.getEntityService().createEntity({ entity });
    }
    await deps.queueManager.add("social-post", "queued-post");

    const data = await load();

    expect(digestOf(data)).toEqual({
      items: [
        { label: "Pipeline", value: "1 queued · 0 generating", tone: "warn" },
        { label: "Awaiting review", value: "1 drafts", tone: "warn" },
        { label: "Published", value: "0", tone: "good" },
      ],
      attention: 1,
    });
    expect(viewOf(data).blocks[0]).toMatchObject({
      type: "stats",
      items: [
        { label: "Queued", value: 1 },
        { label: "Generating", value: 0 },
        { label: "Awaiting review", value: 1 },
        { label: "Published", value: 0 },
      ],
    });
  });

  it("reads as idle when nothing is in flight", async () => {
    const data = await load();

    expect(digestOf(data)).toEqual({
      items: [
        { label: "Pipeline", value: "idle" },
        { label: "Awaiting review", value: "0 drafts" },
        { label: "Published", value: "0", tone: "good" },
      ],
      attention: 0,
    });
  });

  it("uses a host launch instead of carrying a Studio management URL", async () => {
    const data = await load();
    const view = viewOf(data);

    expect(view.blocks[2]).toEqual({
      type: "links",
      items: [
        {
          label: "Open in Studio",
          target: { launch: { target: "publishing" } },
        },
      ],
    });
    expect(JSON.stringify(view)).not.toContain("managementUrl");
  });

  it("counts this package's own queued work as generating", async () => {
    await mockShell.getJobQueueService().enqueue({
      type: "image:image-render-source",
      data: {
        sourceEntityType: "social-post",
        sourceEntityId: "domain-as-identity",
        attachmentType: "og-image",
      },
      options: {
        source: PIPELINE_PLUGIN_ID,
        metadata: { operationType: "content_operations" },
      },
    });
    await mockShell.getJobQueueService().enqueue({
      type: "site:build",
      data: {},
      options: {
        source: "site-builder",
        metadata: { operationType: "content_operations" },
      },
    });

    const data = await load();
    const stats = viewOf(data).blocks[0];

    expect(stats?.type).toBe("stats");
    if (stats?.type !== "stats") throw new Error("Expected pipeline stats");
    expect(stats.items[1]).toEqual({ label: "Generating", value: 1 });
  });
});
