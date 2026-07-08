import { describe, it, expect } from "bun:test";
import {
  canConfirmPendingAction,
  resolveConfirmationContext,
} from "../src/confirmation-coordinator";
import type { RuntimePendingConfirmation } from "../src/agent-machine";
import type { AgentMachineContext } from "../src/agent-machine";

function pendingConfirmation(
  requester: RuntimePendingConfirmation["requester"],
): RuntimePendingConfirmation {
  return {
    id: "approval:call-1",
    toolName: "delete_note",
    summary: "Delete note?",
    args: { noteId: "123" },
    requester,
  };
}

function machineContext(
  overrides?: Partial<AgentMachineContext>,
): AgentMachineContext {
  return {
    conversationId: "conv-a",
    message: "delete my note",
    interfaceType: "matrix",
    channelId: "channel-1",
    channelName: "General",
    userPermissionLevel: "anchor",
    actor: null,
    source: null,
    attachments: [],
    response: null,
    pendingConfirmations: [],
    activeConfirmation: null,
    error: null,
    ...overrides,
  };
}

describe("canConfirmPendingAction", () => {
  it("always allows the anchor", () => {
    const confirmation = pendingConfirmation({
      actorKey: "alice",
      userPermissionLevel: "trusted",
    });

    expect(
      canConfirmPendingAction(confirmation, {
        userPermissionLevel: "anchor",
        actor: {
          actorId: "someone-else",
          interfaceType: "matrix",
          role: "user",
        },
      }),
    ).toBe(true);
  });

  it("rejects a different actor when the requester is pinned", () => {
    const confirmation = pendingConfirmation({
      actorKey: "alice",
      userPermissionLevel: "public",
    });

    expect(
      canConfirmPendingAction(confirmation, {
        userPermissionLevel: "trusted",
        actor: {
          actorId: "bob-id",
          canonicalId: "bob",
          interfaceType: "matrix",
          role: "user",
        },
      }),
    ).toBe(false);
  });

  it("matches the requester by canonical id before actor id", () => {
    const confirmation = pendingConfirmation({
      actorKey: "alice",
      userPermissionLevel: "public",
    });

    expect(
      canConfirmPendingAction(confirmation, {
        userPermissionLevel: "public",
        actor: {
          actorId: "matrix-alice-device-2",
          canonicalId: "alice",
          interfaceType: "matrix",
          role: "user",
        },
      }),
    ).toBe(true);
  });

  it("requires the caller to meet the requester's permission level", () => {
    const confirmation = pendingConfirmation({
      userPermissionLevel: "trusted",
    });

    expect(
      canConfirmPendingAction(confirmation, {
        userPermissionLevel: "public",
        actor: null,
      }),
    ).toBe(false);
    expect(
      canConfirmPendingAction(confirmation, {
        userPermissionLevel: "trusted",
        actor: null,
      }),
    ).toBe(true);
  });
});

describe("resolveConfirmationContext", () => {
  it("requires an explicit caller permission level", () => {
    expect(resolveConfirmationContext(undefined, machineContext())).toBe(null);
    expect(
      resolveConfirmationContext({ interfaceType: "matrix" }, machineContext()),
    ).toBe(null);
  });

  it("falls back to the machine context for transport fields", () => {
    const resolved = resolveConfirmationContext(
      { userPermissionLevel: "trusted" },
      machineContext({
        interfaceType: "discord",
        channelId: "channel-9",
        channelName: "Ops",
      }),
    );

    expect(resolved).toEqual({
      interfaceType: "discord",
      channelId: "channel-9",
      channelName: "Ops",
      userPermissionLevel: "trusted",
      actor: null,
      source: null,
    });
  });

  it("prefers the caller's own transport fields and identity", () => {
    const actor = {
      actorId: "alice-id",
      canonicalId: "alice",
      interfaceType: "matrix",
      role: "user" as const,
    };
    const resolved = resolveConfirmationContext(
      {
        userPermissionLevel: "anchor",
        interfaceType: "matrix",
        channelId: "channel-2",
        channelName: "Direct",
        actor,
      },
      machineContext(),
    );

    expect(resolved).toEqual({
      interfaceType: "matrix",
      channelId: "channel-2",
      channelName: "Direct",
      userPermissionLevel: "anchor",
      actor,
      source: null,
    });
  });
});
