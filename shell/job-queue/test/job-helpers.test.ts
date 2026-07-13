import { describe, expect, it, mock } from "bun:test";
import { createEnqueueJobFn } from "../src/job-helpers";
import type { IJobQueueService } from "../src/types";

describe("createEnqueueJobFn", () => {
  it("copies authenticated requester attribution into private job metadata", async () => {
    const enqueue = mock(async () => "job-1");
    const enqueueJob = createEnqueueJobFn(
      { enqueue } as unknown as IJobQueueService,
      "site-content",
      true,
    );

    await enqueueJob({
      type: "generate",
      data: { routeId: "home" },
      toolContext: {
        interfaceType: "discord",
        userId: "usr_mira",
        canonicalId: "user:mira",
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
});
