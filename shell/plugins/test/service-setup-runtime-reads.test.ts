import { afterEach, describe, expect, it } from "bun:test";
import { caughtError, createSilentLogger } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type IAttachmentsNamespace,
  type IPermissionsNamespace,
  type ServiceJobs,
  type ServicePublisher,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A service whose engine runs on its own schedule holds what it needs rather
 * than being handed it per call: a publisher, because a timer has no caller
 * to answer; the permission check, because it acts for callers on types it
 * does not own; attachments, because what it sends includes media another
 * package resolves; and the work it queued, because an operator page shows
 * what is in flight. Named consumer: @brains/content-pipeline.
 */
describe("service setup runtime reads", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-setup-reads-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  /** What this service holds from setup, for the assertions below. */
  interface SetupReads {
    readonly messaging: ServicePublisher;
    readonly permissions: Pick<
      IPermissionsNamespace,
      "assertEntityActionAllowed"
    >;
    readonly attachments: IAttachmentsNamespace;
    readonly jobs: ServiceJobs;
  }

  async function install(): Promise<SetupReads> {
    let captured: SetupReads | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "pipeline",
        config: z.object({}),
        setup: ({ messaging, permissions, attachments, jobs }) => {
          captured = { messaging, permissions, attachments, jobs };
          return {};
        },
      }),
      {},
      { name: "@fixture/pipeline", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("announces from state to every subscriber", async () => {
    const heard: string[] = [];
    for (const listener of ["first", "second"]) {
      harness.subscribe("pipeline:tick", async () => {
        heard.push(listener);
        return { success: true };
      });
    }
    const { messaging } = await install();

    await messaging.publish({ topic: "pipeline:tick", data: { at: "now" } });

    expect(heard).toEqual(["first", "second"]);
  });

  it("refuses an entity action the caller may not perform", async () => {
    harness.setPermissionService(
      new PermissionService({
        entityActions: { "social-post": { publish: "admin" } },
      }),
    );
    const { permissions } = await install();

    expect(() =>
      permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "admin",
      }),
    ).not.toThrow();
    const error = ((): Error | undefined => {
      try {
        permissions.assertEntityActionAllowed("social-post", "publish", {
          userPermissionLevel: "trusted",
        });
        return undefined;
      } catch (caught) {
        return caughtError(caught);
      }
    })();
    expect(error).toBeInstanceOf(Error);
  });

  it("reads whether an attachment provider exists before asking for one", async () => {
    const { attachments } = await install();
    expect(attachments.hasProvider("post", "og-image")).toBe(false);

    harness
      .getMockShell()
      .getAttachmentRegistry()
      .register("post", "og-image", { resolve: () => undefined });

    expect(attachments.hasProvider("post", "og-image")).toBe(true);
  });

  it("reports the work this package queued, and nobody else's", async () => {
    const { jobs } = await install();
    const queue = harness.getMockShell().getJobQueueService();
    await queue.enqueue({
      type: "image:render",
      data: { source: "elsewhere" },
      options: {
        source: "someone-else",
        metadata: { operationType: "content_operations" },
      },
    });
    await queue.enqueue({
      type: "image:render",
      data: { source: "mine" },
      options: {
        source: "@fixture/pipeline:pipeline",
        metadata: { operationType: "content_operations" },
      },
    });

    const active = await jobs.active();

    expect(active.map((job) => job.data)).toEqual([{ source: "mine" }]);
  });
});
