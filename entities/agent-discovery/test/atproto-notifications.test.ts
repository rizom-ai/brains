import { describe, expect, it } from "bun:test";
import type {
  AtprotoBrainCardConflictPayload,
  AtprotoBrainDiscoveryEventPayload,
} from "@brains/atproto-contracts";
import type { Plugin } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import agentDiscovery from "../src";
import { AGENT_PLUGIN_ID } from "./fixtures/agent-network";
import {
  recordConflict,
  recordDiscoveryCandidate,
} from "../src/lib/atproto-notifications";

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

const conflictPayload: AtprotoBrainCardConflictPayload = {
  domain: "peer.example.com",
  existingRepoDid: "did:plc:approved-owner",
  candidateRepoDid: "did:plc:attacker",
  observedAt: "2026-07-22T13:00:00.000Z",
  reason: "ATProto agent identity collision",
};

type Harness = ReturnType<typeof createPluginHarness<Plugin>>;
type CapturedCheck = Parameters<
  ReturnType<
    ReturnType<Harness["getMockShell"]>["getRecurringChecks"]
  >["register"]
>[0];

async function installWithCapturedCheck(notifyOnNewAgents: boolean): Promise<{
  harness: Harness;
  check: { run: () => ReturnType<CapturedCheck["run"]> };
}> {
  const harness = createPluginHarness<Plugin>();
  const shell = harness.getMockShell();
  const registered: CapturedCheck[] = [];
  shell.getRecurringChecks = (): ReturnType<
    typeof shell.getRecurringChecks
  > => ({
    register: (definition): (() => void) => {
      registered.push(definition);
      return () => {};
    },
  });

  const plugins = instantiatePluginPackageDefinition(
    agentDiscovery,
    { notifyOnNewAgents },
    { name: "@brains/agent-discovery", version: "0.1.0" },
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);

  const check = registered.find(({ id }) => id.endsWith("directory-scan"));
  if (!check) throw new Error("Expected recurring check registration");
  return {
    harness,
    check: { run: () => check.run({ signal: new AbortController().signal }) },
  };
}

describe("ATProto discovery notifications", () => {
  it("delivers one bounded digest through the existing recurring alert path", async () => {
    const { harness, check } = await installWithCapturedCheck(true);
    const context = harness.getReactionContext(AGENT_PLUGIN_ID);

    await recordDiscoveryCandidate(
      context,
      discoveredPayload,
      "2026-07-22T12:00:00.000Z",
    );
    await recordDiscoveryCandidate(
      context,
      {
        ...discoveredPayload,
        agentId: "second.example.com",
        name: "Second Brain",
        url: "https://second.example.com",
        repoDid: "did:plc:second",
        brainDid: "did:web:second.example.com",
        cardUri: "at://did:plc:second/ai.rizom.brain.card/self",
        cardCid: "bafy-second-card",
      },
      "2026-07-22T12:01:00.000Z",
    );

    const first = await check.run();
    expect(first.alerts).toEqual([
      expect.objectContaining({
        title: "New ATProto agents awaiting review",
        body: expect.stringContaining("2 new agents"),
      }),
    ]);
    expect(first.alerts?.[0]?.body).toContain("/agents?status=discovered");

    const second = await check.run();
    expect(second.alerts ?? []).toEqual([]);

    harness.reset();
  });

  it("delivers identity collisions as a separate bounded security digest", async () => {
    const { harness, check } = await installWithCapturedCheck(true);
    await recordConflict(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      conflictPayload,
    );

    const result = await check.run();
    expect(result.alerts).toEqual([
      expect.objectContaining({
        title: "ATProto identity conflict",
        body: expect.stringContaining("peer.example.com"),
      }),
    ]);

    harness.reset();
  });

  it("does not queue an ATProto digest when notifications are disabled", async () => {
    const { harness, check } = await installWithCapturedCheck(false);
    await recordDiscoveryCandidate(
      harness.getReactionContext(AGENT_PLUGIN_ID),
      discoveredPayload,
      "2026-07-22T12:00:00.000Z",
    );

    const result = await check.run();
    expect(result.alerts ?? []).toEqual([]);

    harness.reset();
  });

  it("keeps the backlog while notifications are off, and reports it once on", async () => {
    // The reason recording is not gated on the same setting that delivers:
    // switching alerts on used to show nothing, because nothing had been
    // written down while they were off.
    const off = await installWithCapturedCheck(false);
    await recordDiscoveryCandidate(
      off.harness.getReactionContext(AGENT_PLUGIN_ID),
      discoveredPayload,
      "2026-07-22T12:00:00.000Z",
    );
    expect((await off.check.run()).alerts ?? []).toEqual([]);

    const on = await installWithCapturedCheck(true);
    await recordDiscoveryCandidate(
      on.harness.getReactionContext(AGENT_PLUGIN_ID),
      discoveredPayload,
      "2026-07-22T12:00:00.000Z",
    );
    expect((await on.check.run()).alerts).toEqual([
      expect.objectContaining({
        title: "New ATProto agents awaiting review",
      }),
    ]);

    off.harness.reset();
    on.harness.reset();
  });
});
