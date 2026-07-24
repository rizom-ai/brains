import { describe, expect, it } from "bun:test";
import {
  ATPROTO_BRAIN_CARD_CONFLICT,
  ATPROTO_BRAIN_DISCOVERED,
  type AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";
import { createMockShell } from "@brains/test-utils";
import { AgentToolsPlugin } from "../src/plugins/agent-tools-plugin";

const discoveredPayload: AtprotoBrainDiscoveryEventPayload = {
  agentId: "peer.example.com",
  name: "Peer Brain",
  url: "https://peer.example.com",
  status: "discovered",
  repoDid: "did:plc:peer",
  brainDid: "did:web:peer.example.com",
  cardUri: "at://did:plc:peer/ai.rizom.brain.card/self",
  cardCid: "bafy-peer-card",
};

type RecurringCheckDefinition = Parameters<
  ReturnType<
    ReturnType<typeof createMockShell>["getRecurringChecks"]
  >["register"]
>[0];

async function installWithCapturedCheck(notifyOnNewAgents: boolean): Promise<{
  shell: ReturnType<typeof createMockShell>;
  check: RecurringCheckDefinition;
}> {
  const shell = createMockShell();
  let captured: RecurringCheckDefinition | undefined;
  shell.getRecurringChecks = (): ReturnType<
    typeof shell.getRecurringChecks
  > => ({
    register: (definition) => {
      captured = definition;
      return (): void => {};
    },
  });
  const plugin = new AgentToolsPlugin(undefined, { notifyOnNewAgents });
  await plugin.register(shell);
  if (!captured) throw new Error("Expected recurring check registration");
  return { shell, check: captured };
}

describe("ATProto discovery notifications", () => {
  it("delivers one bounded digest through the existing recurring alert path", async () => {
    const { shell, check } = await installWithCapturedCheck(true);
    await shell.getMessageBus().send({
      type: ATPROTO_BRAIN_DISCOVERED,
      payload: discoveredPayload,
      sender: "agent-discovery",
      broadcast: true,
    });
    await shell.getMessageBus().send({
      type: ATPROTO_BRAIN_DISCOVERED,
      payload: {
        ...discoveredPayload,
        agentId: "second.example.com",
        name: "Second Brain",
        url: "https://second.example.com",
        repoDid: "did:plc:second",
        brainDid: "did:web:second.example.com",
        cardUri: "at://did:plc:second/ai.rizom.brain.card/self",
        cardCid: "bafy-second-card",
      },
      sender: "agent-discovery",
      broadcast: true,
    });

    const first = await check.run({ signal: new AbortController().signal });
    expect(first.alerts).toEqual([
      expect.objectContaining({
        title: "New ATProto agents awaiting review",
        body: expect.stringContaining("2 new agents"),
      }),
    ]);
    expect(first.alerts?.[0]?.body).toContain("/agents?status=discovered");

    const second = await check.run({ signal: new AbortController().signal });
    expect(second.alerts ?? []).toEqual([]);
  });

  it("delivers identity collisions as a separate bounded security digest", async () => {
    const { shell, check } = await installWithCapturedCheck(true);
    await shell.getMessageBus().send({
      type: ATPROTO_BRAIN_CARD_CONFLICT,
      payload: {
        domain: "peer.example.com",
        existingRepoDid: "did:plc:approved-owner",
        candidateRepoDid: "did:plc:attacker",
        observedAt: "2026-07-22T13:00:00.000Z",
        reason: "ATProto agent identity collision",
      },
      sender: "atproto",
      broadcast: true,
    });

    const result = await check.run({
      signal: new AbortController().signal,
    });
    expect(result.alerts).toEqual([
      expect.objectContaining({
        title: "ATProto identity conflict",
        body: expect.stringContaining("peer.example.com"),
      }),
    ]);
  });

  it("does not queue an ATProto digest when notifications are disabled", async () => {
    const { shell, check } = await installWithCapturedCheck(false);
    await shell.getMessageBus().send({
      type: ATPROTO_BRAIN_DISCOVERED,
      payload: discoveredPayload,
      sender: "agent-discovery",
      broadcast: true,
    });

    const result = await check.run({
      signal: new AbortController().signal,
    });
    expect(result.alerts ?? []).toEqual([]);
  });
});
