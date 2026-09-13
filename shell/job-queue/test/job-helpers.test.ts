import { describe, expect, it, mock } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { createEnqueueJobFn } from "../src/job-helpers";
import type { IJobQueueService } from "../src/types";
import type { JobEnqueuer } from "../src/job-helpers";

describe("createEnqueueJobFn", () => {
  it("copies authenticated requester attribution into private job metadata", async () => {
    const enqueue = mock(
      async (_request: Parameters<IJobQueueService["enqueue"]>[0]) => "job-1",
    );
    const enqueueJob = createEnqueueJobFn(
      { enqueue } satisfies JobEnqueuer,
      "site-content",
      true,
    );

    await enqueueJob({
      type: "generate",
      data: { routeId: "home" },
      toolContext: {
        interfaceType: "discord",
        actor: {
          kind: "user",
          userId: "usr_mira",
          canonicalId: "user:mira",
        },
        displayName: "Mira",
        conversationId: "conversation-1",
        channelId: "channel-1",
      },
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "site-content:generate",
        options: expect.objectContaining({
          metadata: expect.objectContaining({
            requestedByUserId: "usr_mira",
            requestedByInterface: "discord",
            conversationId: "conversation-1",
            channelId: "channel-1",
          }),
        }),
      }),
    );
  });

  it("routes the caller's progress token, and keeps an explicit one when the context has none", async () => {
    const enqueue = mock(
      async (_request: Parameters<IJobQueueService["enqueue"]>[0]) => "job-1",
    );
    const enqueueJob = createEnqueueJobFn(
      { enqueue } satisfies JobEnqueuer,
      "site-content",
      true,
    );
    const caller = {
      interfaceType: "cli",
      actor: { kind: "service" as const, serviceId: "site-content" },
    };

    await enqueueJob({
      type: "generate",
      data: {},
      toolContext: { ...caller, progressToken: "token-from-caller" },
    });
    expect(
      expectDefined(enqueue.mock.calls[0]?.[0].options).metadata,
    ).toMatchObject({ progressToken: "token-from-caller" });

    // Progress routing without a token cannot reach anyone, so a token passed
    // explicitly by the plugin must survive a context that carries none.
    await enqueueJob({
      type: "generate",
      data: {},
      toolContext: caller,
      options: {
        source: "site-content",
        metadata: {
          operationType: "content_operations",
          progressToken: "token-from-plugin",
        },
      },
    });
    expect(
      expectDefined(enqueue.mock.calls[1]?.[0].options).metadata,
    ).toMatchObject({ progressToken: "token-from-plugin" });
  });

  it("does not let option metadata override verified requester attribution", async () => {
    const enqueue = mock(
      async (_request: Parameters<IJobQueueService["enqueue"]>[0]) => "job-1",
    );
    const enqueueJob = createEnqueueJobFn(
      { enqueue } satisfies JobEnqueuer,
      "site-content",
      true,
    );
    const actor = { kind: "external", externalActorId: "ext_mira" } as const;

    await enqueueJob({
      type: "generate",
      data: { routeId: "home" },
      toolContext: { interfaceType: "mcp", actor },
      options: {
        source: "spoofed",
        metadata: {
          operationType: "data_processing",
          requestedByActor: { kind: "user", userId: "usr_spoof" },
          requestedByUserId: "usr_spoof",
          requestedByInterface: "spoofed",
        },
      },
    });

    const queuedOptions = enqueue.mock.calls[0]?.[0].options;
    expect(queuedOptions?.source).toBe("site-content");
    const metadata = queuedOptions?.metadata;
    expect(metadata).toMatchObject({
      requestedByActor: actor,
      requestedByInterface: "mcp",
    });
    expect(metadata).not.toHaveProperty("requestedByUserId");
  });

  it("does not persist non-user actors as requested users", async () => {
    const enqueue = mock(
      async (_request: Parameters<IJobQueueService["enqueue"]>[0]) => "job-1",
    );
    const enqueueJob = createEnqueueJobFn(
      { enqueue } satisfies JobEnqueuer,
      "site-content",
      true,
    );

    await enqueueJob({
      type: "generate",
      data: { routeId: "home" },
      toolContext: {
        interfaceType: "discord",
        actor: { kind: "external", externalActorId: "ext_mira" },
      },
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          metadata: expect.objectContaining({
            requestedByActor: {
              kind: "external",
              externalActorId: "ext_mira",
            },
          }),
        }),
      }),
    );
    const request = expectDefined(
      enqueue.mock.calls[0]?.[0],
      "enqueue() request",
    );
    expect(request.options?.metadata).not.toHaveProperty("requestedByUserId");
  });
});
