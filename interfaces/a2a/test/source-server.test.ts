import { describe, expect, it, mock } from "bun:test";
import type { AgentNamespace, AgentResponse } from "@brains/plugins";
import type { SourceCitation } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createTestEntity } from "@brains/entity-service/test";
import { waitUntil } from "@brains/test-utils";
import { TaskManager } from "../src/task-manager";
import { A2ATurnSupervisor } from "../src/turn-supervisor";
import {
  handleJsonRpc,
  handleStreamMessage,
  type JsonRpcHandlerContext,
} from "../src/jsonrpc-handler";
import { readSourceArtifacts } from "../src/source-artifacts";
import { installA2A } from "./helpers/install";

const source: SourceCitation = {
  id: "post:one",
  source: "post",
  title: "Current public title",
  url: "https://brain.example/essays/one",
  entityType: "post",
  entityId: "one",
};
const answer: AgentResponse = {
  text: "Answer",
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  cards: [
    {
      id: "answer-sources",
      kind: "sources",
      sources: [
        {
          ...source,
          title: "Forged title",
          excerpt: "Private prose",
          brain: { name: "Forged brain" },
        },
      ],
    },
  ],
};
const message = {
  kind: "message",
  messageId: "stable",
  parts: [{ kind: "text", text: "Question" }],
};
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "message/send",
  params: { message },
};
function agent(
  chat: AgentNamespace["chat"] = async () => answer,
): AgentNamespace {
  return {
    chat,
    confirmPendingAction: async () => answer,
    invalidate: (): void => {},
  };
}

describe("A2A public source emission", () => {
  it("uses the installed public reader instead of model citation text, even for existing inbound calls", async () => {
    const harness = createPluginHarness({
      domain: "brain.example",
      entityDisplay: { post: { label: "Essay", citable: true } },
    });
    const candidates = ["one", "private", "draft"].map((id) => ({
      ...source,
      entityId: id,
    }));
    harness.getMockShell().addEntities([
      createTestEntity("post", {
        id: "one",
        visibility: "public",
        metadata: { title: "Current public title", status: "published" },
      }),
      createTestEntity("post", {
        id: "private",
        visibility: "restricted",
        metadata: { title: "SECRET", status: "published" },
      }),
      createTestEntity("post", {
        id: "draft",
        visibility: "public",
        metadata: { title: "UNPUBLISHED", status: "draft" },
      }),
    ]);
    const response: AgentResponse = {
      ...answer,
      cards: [{ id: "answer-sources", kind: "sources", sources: candidates }],
    };
    harness.setAgentService({
      chat: async () => response,
      confirmPendingAction: async () => response,
      invalidateAgent: (): void => {},
    });
    try {
      const installed = await installA2A(harness, { inbound: true });
      const result = await installed.route("/a2a", "POST").handler(
        new Request("https://brain.example/a2a", {
          method: "POST",
          body: JSON.stringify({ ...request, method: "message/stream" }),
        }),
      );
      const body = await result.text();
      expect(result.status).toBe(200);
      expect(body).toContain('"name":"sources"');
      expect(body).toContain('"title":"Current public title"');
      expect(body).toContain('"url":"https://brain.example/essays/one"');
      expect(body).not.toContain("SECRET");
      expect(body).not.toContain("UNPUBLISHED");
      expect(body).not.toContain("Private prose");
      expect(body).not.toContain("Forged");
      expect(body.indexOf('"kind":"artifact-update"')).toBeLessThan(
        body.indexOf('"state":"completed"'),
      );
    } finally {
      await harness.reset();
    }
  });

  it("rechecks polling and both replay paths without rerunning the model or bypassing caller ownership", async () => {
    const taskManager = new TaskManager();
    const turnSupervisor = new A2ATurnSupervisor();
    let eligible = true;
    const resolve = mock(async (): Promise<readonly SourceCitation[]> =>
      eligible ? [source] : [],
    );
    const chat = mock(async (): Promise<AgentResponse> => answer);
    const context: JsonRpcHandlerContext = {
      taskManager,
      turnSupervisor,
      agentService: agent(chat),
      callerPermissionLevel: "trusted",
      callerDomain: "caller.example",
      publicSources: { resolve },
    };
    try {
      const started = await handleJsonRpc(request, context);
      if (started.error) throw new Error(started.error.message);
      const taskId = started.result.id;
      await waitUntil(
        () => taskManager.getTask(taskId)?.task.status.state === "completed",
        "completed source task",
      );
      const get = {
        jsonrpc: "2.0",
        id: 2,
        method: "tasks/get",
        params: { id: taskId },
      };
      const first = await handleJsonRpc(get, context);
      if (first.error) throw new Error(first.error.message);
      expect(readSourceArtifacts(first.result.artifacts)).toEqual([source]);
      eligible = false;
      for (const next of [get, request]) {
        const replay = await handleJsonRpc(next, context);
        if (replay.error) throw new Error(replay.error.message);
        expect(readSourceArtifacts(replay.result.artifacts)).toEqual([]);
      }
      const streaming = handleStreamMessage(3, message, context);
      if ("error" in streaming) throw new Error(streaming.error.message);
      expect(await new Response(streaming.stream).text()).not.toContain(
        "Current public title",
      );
      expect(chat).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledTimes(5);
      const denied = await handleJsonRpc(get, {
        ...context,
        callerDomain: "other.example",
      });
      expect(denied.error?.code).toBe(-32001);
      expect(resolve).toHaveBeenCalledTimes(5);
    } finally {
      await turnSupervisor.close();
    }
  });

  it("refuses source results that complete after task cancellation", async () => {
    const taskManager = new TaskManager();
    const turnSupervisor = new A2ATurnSupervisor();
    let release: ((sources: readonly SourceCitation[]) => void) | undefined;
    let entered = false;
    let observedSignal: AbortSignal | undefined;
    const pending = new Promise<readonly SourceCitation[]>((resolve) => {
      release = resolve;
    });
    const context: JsonRpcHandlerContext = {
      taskManager,
      turnSupervisor,
      agentService: agent(),
      callerPermissionLevel: "trusted",
      callerDomain: "caller.example",
      publicSources: {
        resolve: async (_references, signal) => {
          observedSignal = signal;
          entered = true;
          return pending;
        },
      },
    };
    try {
      const started = await handleJsonRpc(request, context);
      if (started.error) throw new Error(started.error.message);
      const taskId = started.result.id;
      await waitUntil(() => entered, "source read admission");
      await handleJsonRpc(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tasks/cancel",
          params: { id: taskId },
        },
        context,
      );
      expect(observedSignal?.aborted).toBe(true);
      release?.([source]);
      await turnSupervisor.close();
      expect(taskManager.getTask(taskId)?.task.status.state).toBe("canceled");
      expect(taskManager.getTask(taskId)?.task.artifacts).toBeUndefined();
    } finally {
      release?.([]);
      await turnSupervisor.close();
    }
  });
});
