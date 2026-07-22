import { describe, expect, it } from "bun:test";
import type { AgentNamespace, AgentResponse } from "@brains/plugins";
import { handleJsonRpc, handleStreamMessage } from "../src/jsonrpc-handler";
import { TaskManager } from "../src/task-manager";
import { A2ATurnSupervisor } from "../src/turn-supervisor";

const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

function slowAgent(
  started: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
  captureSignal: (signal: AbortSignal | undefined) => void,
): AgentNamespace {
  return {
    chat: async (
      _message,
      _conversationId,
      _context,
      signal,
    ): Promise<AgentResponse> => {
      captureSignal(signal);
      started.resolve();
      await release.promise;
      return { text: "late response", usage };
    },
    confirmPendingAction: async () => ({ text: "unused", usage }),
    invalidate: (): void => {},
  };
}

describe("A2A lifecycle characterization", () => {
  it("cancels a streaming turn when its consumer disconnects", async () => {
    const taskManager = new TaskManager();
    const turnSupervisor = new A2ATurnSupervisor();
    const started = deferred();
    const release = deferred();
    let receivedSignal: AbortSignal | undefined;
    const result = handleStreamMessage(
      1,
      { kind: "message", parts: [{ kind: "text", text: "Hello" }] },
      {
        taskManager,
        turnSupervisor,
        agentService: slowAgent(started, release, (signal) => {
          receivedSignal = signal;
        }),
        callerPermissionLevel: "public",
      },
    );
    if ("error" in result) throw new Error(result.error.message);

    const reader = result.stream.getReader();
    await reader.read();
    await started.promise;
    await reader.cancel();
    expect(receivedSignal?.aborted).toBe(true);
    expect(taskManager.getTask(result.taskId)?.task.status.state).toBe(
      "canceled",
    );

    release.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(taskManager.getTask(result.taskId)?.task.status.state).toBe(
      "canceled",
    );
    await turnSupervisor.close();
  });

  it("preserves a completed task when a cancel fires after the turn finished", async () => {
    const taskManager = new TaskManager();
    const turnSupervisor = new A2ATurnSupervisor();
    const started = deferred();
    const release = deferred();
    const result = handleStreamMessage(
      1,
      { kind: "message", parts: [{ kind: "text", text: "Hello" }] },
      {
        taskManager,
        turnSupervisor,
        agentService: slowAgent(started, release, () => {}),
        callerPermissionLevel: "public",
      },
    );
    if ("error" in result) throw new Error(result.error.message);

    const reader = result.stream.getReader();
    await reader.read();
    await started.promise;
    release.resolve();
    // Observe completion before the supervisor's fiber teardown deregisters
    // the turn — the window where a late cancel used to clobber the state.
    while (
      taskManager.getTask(result.taskId)?.task.status.state !== "completed"
    ) {
      await Promise.resolve();
    }

    turnSupervisor.cancel(result.taskId, new Error("late cancel"));
    expect(taskManager.getTask(result.taskId)?.task.status.state).toBe(
      "completed",
    );
    await reader.cancel();
    expect(taskManager.getTask(result.taskId)?.task.status.state).toBe(
      "completed",
    );
    await turnSupervisor.close();
  });

  it("interrupts a polling turn when its task is canceled", async () => {
    const taskManager = new TaskManager();
    const turnSupervisor = new A2ATurnSupervisor();
    const started = deferred();
    const release = deferred();
    let receivedSignal: AbortSignal | undefined;
    const context = {
      taskManager,
      turnSupervisor,
      agentService: slowAgent(started, release, (signal) => {
        receivedSignal = signal;
      }),
      callerPermissionLevel: "trusted" as const,
      callerDomain: "peer.example",
    };
    const sent = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "message/send",
        params: {
          message: {
            kind: "message",
            messageId: "message-1",
            role: "user",
            parts: [{ kind: "text", text: "Hello" }],
          },
        },
      },
      context,
    );
    if (sent.error) throw new Error(sent.error.message);
    await started.promise;

    await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tasks/cancel",
        params: { id: sent.result.id },
      },
      context,
    );
    expect(receivedSignal?.aborted).toBe(true);
    expect(taskManager.getTask(sent.result.id)?.task.status.state).toBe(
      "canceled",
    );

    release.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(taskManager.getTask(sent.result.id)?.task.status.state).toBe(
      "canceled",
    );
    await turnSupervisor.close();
  });
});
