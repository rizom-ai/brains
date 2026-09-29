import { describe, expect, it, mock, type Mock } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import type { AgentResponse } from "@brains/plugins";
import {
  createRemoteAgentChatContext,
  handleRemoteAgentChatRequest,
  handleRemoteAgentConfirmRequest,
  remoteAgentInterfaceType,
  type RemoteAgentHandlerDeps,
} from "../src/remote-agent-handlers";

type AgentChat = RemoteAgentHandlerDeps["agent"]["chat"];
type AgentConfirm = RemoteAgentHandlerDeps["agent"]["confirmPendingAction"];

function agentResponse(text: string): AgentResponse {
  return {
    text,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat/remote-agent", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function createDeps(
  overrides: Partial<RemoteAgentHandlerDeps> = {},
): RemoteAgentHandlerDeps & {
  chat: Mock<AgentChat>;
  confirmPendingAction: Mock<AgentConfirm>;
} {
  const chat = mock<AgentChat>(async () => agentResponse("hello"));
  const confirmPendingAction = mock<AgentConfirm>(async () =>
    agentResponse("confirmed"),
  );
  return {
    chat,
    confirmPendingAction,
    agent: { chat, confirmPendingAction },
    resolveBrowserAccess: async () => ({
      permissionLevel: "trusted",
      hasChatAccess: true,
    }),
    toConversationAccess: (permissionLevel) => ({ permissionLevel }),
    ensureConversation: async () => undefined,
    requireExistingConversation: async () => undefined,
    ...overrides,
  };
}

describe("remote agent chat route", () => {
  it("rejects callers without chat access", async () => {
    const deps = createDeps({
      resolveBrowserAccess: async () => ({
        permissionLevel: "public",
        hasChatAccess: false,
      }),
    });

    const response = await handleRemoteAgentChatRequest(
      jsonRequest({ message: "hi", conversationId: "c1" }),
      deps,
    );

    expect(response.status).toBe(403);
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await handleRemoteAgentChatRequest(
      jsonRequest("{not json"),
      createDeps(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid JSON body");
  });

  it("rejects a body that fails the request schema", async () => {
    const response = await handleRemoteAgentChatRequest(
      jsonRequest({ message: "", conversationId: "c1" }),
      createDeps(),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid remote agent chat request");
  });

  it("returns the conversation guard's response when the conversation is refused", async () => {
    const refused = new Response("Forbidden", { status: 403 });
    const deps = createDeps({ ensureConversation: async () => refused });

    const response = await handleRemoteAgentChatRequest(
      jsonRequest({ message: "hi", conversationId: "c1" }),
      deps,
    );

    expect(response).toBe(refused);
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("ensures the remote agent conversation and forwards the message to the agent", async () => {
    const ensureConversation = mock<
      RemoteAgentHandlerDeps["ensureConversation"]
    >(async () => undefined);
    const deps = createDeps({ ensureConversation });

    const response = await handleRemoteAgentChatRequest(
      jsonRequest({ message: "hi", conversationId: "c1" }),
      deps,
    );

    expect(ensureConversation).toHaveBeenCalledWith(
      "c1",
      remoteAgentInterfaceType,
      "Remote Agent",
      { permissionLevel: "trusted" },
    );
    expect(deps.chat).toHaveBeenCalledTimes(1);
    const [message, conversationId, context] = deps.chat.mock.calls[0] ?? [];
    expect(message).toBe("hi");
    expect(conversationId).toBe("c1");
    expect(context).toMatchObject({
      interfaceType: remoteAgentInterfaceType,
      channelId: "c1",
      channelName: "Remote Agent",
      userPermissionLevel: "trusted",
    });
    expect(await response.json()).toMatchObject({ text: "hello" });
  });
});

describe("remote agent confirm route", () => {
  it("requires an existing conversation before confirming", async () => {
    const missing = new Response("Not Found", { status: 404 });
    const deps = createDeps({
      requireExistingConversation: async () => missing,
    });

    const response = await handleRemoteAgentConfirmRequest(
      jsonRequest({ conversationId: "c1", confirmed: true, approvalId: "a1" }),
      deps,
    );

    expect(response).toBe(missing);
    expect(deps.confirmPendingAction).not.toHaveBeenCalled();
  });

  it("forwards the confirmation decision to the agent", async () => {
    const deps = createDeps();

    const response = await handleRemoteAgentConfirmRequest(
      jsonRequest({ conversationId: "c1", confirmed: false, approvalId: "a1" }),
      deps,
    );

    const [conversationId, confirmed, approvalId, context] =
      deps.confirmPendingAction.mock.calls[0] ?? [];
    expect(conversationId).toBe("c1");
    expect(confirmed).toBe(false);
    expect(approvalId).toBe("a1");
    expect(context).toMatchObject({ interfaceType: remoteAgentInterfaceType });
    expect(await response.json()).toMatchObject({ text: "confirmed" });
  });
});

describe("createRemoteAgentChatContext", () => {
  it("identifies an authenticated principal as a user actor", () => {
    const principal: AuthPrincipal = {
      userId: "u1",
      personId: "p1",
      canonicalId: "canonical-1",
      displayName: "Ada",
      role: "admin",
      status: "active",
      permissionLevel: "admin",
      isAnchor: true,
    };

    const context = createRemoteAgentChatContext("c1", "trusted", principal);

    expect(context.isAnchor).toBe(true);
    expect(context.actor?.displayName).toBe("Ada");
    expect(context.actor?.identity).toEqual({
      kind: "user",
      userId: "u1",
      canonicalId: "canonical-1",
    });
  });

  it("falls back to an external actor derived from the conversation", () => {
    const context = createRemoteAgentChatContext("c1", "public", undefined);

    expect(context.isAnchor).toBe(false);
    expect(context.actor?.displayName).toBe("Remote agent user");
    expect(context.actor?.identity.kind).toBe("external");
  });
});
