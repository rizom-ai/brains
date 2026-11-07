import { describe, expect, it, mock } from "bun:test";
import type { JobProgressEvent } from "@brains/job-queue";
import { createSilentLogger } from "@brains/test-utils";
import {
  ProgressMessageCoordinator,
  type ProgressMessageTransport,
} from "../../src/message-interface/progress-message-coordinator";

interface TransportOptions {
  editSucceeds: boolean;
  supportsEditing?: boolean;
}

function createTransport(options: TransportOptions): {
  transport: ProgressMessageTransport;
  sendMessageToChannel: ReturnType<
    typeof mock<ProgressMessageTransport["sendMessageToChannel"]>
  >;
  editMessage: ReturnType<typeof mock<ProgressMessageTransport["editMessage"]>>;
} {
  const sendMessageToChannel = mock<
    ProgressMessageTransport["sendMessageToChannel"]
  >(() => {});
  const editMessage = mock<ProgressMessageTransport["editMessage"]>(
    async () => options.editSucceeds,
  );
  const logger = createSilentLogger("progress-message-coordinator-test");
  return {
    sendMessageToChannel,
    editMessage,
    transport: {
      interfaceId: () => "chat",
      logger: () => logger,
      sendMessageToChannel,
      sendMessageWithId: async () => "progress-1",
      editMessage,
      supportsMessageEditing: () => options.supportsEditing ?? true,
      formatProgressOutput: (event) => `Working: ${event.message ?? ""}`,
      formatCompletionOutput: (event) => `Done: ${event.message ?? ""}`,
      onProgressUpdate: async (): Promise<void> => {},
      handleToolStatusUpdate: async (): Promise<void> => {},
    },
  };
}

function jobEvent(
  status: JobProgressEvent["status"],
  channelId: string | null = "chan-1",
): JobProgressEvent {
  return {
    id: "job-1",
    type: "job",
    status,
    metadata: {
      operationType: "content_operations",
      rootJobId: "job-1",
      interfaceType: "chat",
      ...(channelId ? { channelId } : {}),
    },
    message: status === "completed" ? "Saved" : "Saving",
  };
}

describe("ProgressMessageCoordinator job completion", () => {
  it("edits the agent's reply into the completion and posts nothing else", async () => {
    const { transport, editMessage, sendMessageToChannel } = createTransport({
      editSucceeds: true,
    });
    const coordinator = new ProgressMessageCoordinator(transport);
    coordinator.trackAgentResponseForJob("job-1", "reply-1", "chan-1");

    await coordinator.handleProgressEvent(jobEvent("completed"));

    expect(editMessage).toHaveBeenCalledWith({
      channelId: "chan-1",
      messageId: "reply-1",
      newMessage: "Done: Saved",
    });
    expect(sendMessageToChannel).not.toHaveBeenCalled();
  });

  it("posts the completion once when the edit of the agent's reply fails", async () => {
    const { transport, sendMessageToChannel } = createTransport({
      editSucceeds: false,
    });
    const coordinator = new ProgressMessageCoordinator(transport);
    coordinator.trackAgentResponseForJob("job-1", "reply-1", "chan-1");

    await coordinator.handleProgressEvent(jobEvent("completed"));

    expect(sendMessageToChannel.mock.calls).toEqual([
      [{ channelId: "chan-1", message: "Done: Saved" }],
    ]);
  });

  it("posts the completion when the interface cannot edit messages", async () => {
    const { transport, editMessage, sendMessageToChannel } = createTransport({
      editSucceeds: true,
      supportsEditing: false,
    });
    const coordinator = new ProgressMessageCoordinator(transport);
    coordinator.trackAgentResponseForJob("job-1", "reply-1", "chan-1");

    await coordinator.handleProgressEvent(jobEvent("completed"));

    expect(editMessage).not.toHaveBeenCalled();
    expect(sendMessageToChannel.mock.calls).toEqual([
      [{ channelId: "chan-1", message: "Done: Saved" }],
    ]);
  });

  it("posts the completion when the edit of a progress message fails", async () => {
    const { transport, editMessage, sendMessageToChannel } = createTransport({
      editSucceeds: false,
    });
    const coordinator = new ProgressMessageCoordinator(transport);

    await coordinator.handleProgressEvent(jobEvent("processing"));
    await coordinator.handleProgressEvent(jobEvent("completed"));

    expect(editMessage).toHaveBeenCalledWith({
      channelId: "chan-1",
      messageId: "progress-1",
      newMessage: "Done: Saved",
    });
    expect(sendMessageToChannel.mock.calls).toEqual([
      [{ channelId: "chan-1", message: "Done: Saved" }],
    ]);
  });

  it("posts to the channel of the reply it could not edit when the job names none", async () => {
    const { transport, sendMessageToChannel } = createTransport({
      editSucceeds: false,
    });
    const coordinator = new ProgressMessageCoordinator(transport);
    coordinator.trackAgentResponseForJob("job-1", "reply-1", "chan-1");

    await coordinator.handleProgressEvent(jobEvent("completed", null));

    expect(sendMessageToChannel.mock.calls).toEqual([
      [{ channelId: "chan-1", message: "Done: Saved" }],
    ]);
  });

  it("stays silent for a job with no channel and nothing tracked", async () => {
    const { transport, sendMessageToChannel } = createTransport({
      editSucceeds: false,
    });
    const coordinator = new ProgressMessageCoordinator(transport);

    await coordinator.handleProgressEvent(jobEvent("completed", null));

    expect(sendMessageToChannel).not.toHaveBeenCalled();
  });
});
