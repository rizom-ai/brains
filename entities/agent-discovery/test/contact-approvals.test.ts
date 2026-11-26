import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS, type Plugin } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { contactApprovalStore } from "../src/lib/contact-approvals";
import { agentDiscoveryPlugins, installAll } from "./agent-discovery-plugins";
import { createTestAgent } from "./fixtures/agent";

type Harness = ReturnType<typeof createPluginHarness<Plugin>>;

async function brain(): Promise<Harness> {
  const harness = createPluginHarness<Plugin>({});
  await installAll(harness, agentDiscoveryPlugins());
  return harness;
}

async function save(
  harness: Harness,
  id: string,
  status: "discovered" | "approved" | "archived",
): Promise<void> {
  const entity = createTestAgent({
    id,
    name: id,
    url: `https://${id}/a2a`,
    status,
  });
  const service = harness.getEntityService();
  const existing = await service.getEntity({
    entityType: "agent",
    id,
    visibilityScope: "restricted",
  });
  if (existing)
    await service.updateEntity({ entity: { ...existing, ...entity } });
  else await service.createEntity({ entity });
}

async function settle(harness: Harness): Promise<void> {
  await harness
    .getMockShell()
    .getMessageBus()
    .send({
      type: SYSTEM_CHANNELS.startupContentSettled,
      payload: { timestamp: "2026-11-26T00:00:00.000Z" },
      sender: "test",
      broadcast: true,
    });
}

/** An entry changed as a file edit changes it: no tool, no approval. */
async function editFile(
  harness: Harness,
  id: string,
  status: "discovered" | "approved" | "archived",
): Promise<void> {
  await save(harness, id, status);
  await harness
    .getMockShell()
    .getMessageBus()
    .send({
      type: "entity:updated",
      payload: { entityType: "agent", entityId: id },
      sender: "test",
      broadcast: true,
    });
}

const approved = (harness: Harness, id: string): Promise<boolean> =>
  contactApprovalStore(harness.getMockShell().getRuntimeState()).has(id);

async function statusOf(harness: Harness, id: string): Promise<unknown> {
  return (
    await harness.getEntityService().getEntity({
      entityType: "agent",
      id,
      visibilityScope: "restricted",
    })
  )?.metadata["status"];
}

describe("which peers a brain may contact", () => {
  it("carries the peers approved before the move into runtime state, once", async () => {
    const harness = await brain();
    await save(harness, "old-friend.example", "approved");
    await save(harness, "stranger.example", "discovered");
    await save(harness, "former.example", "archived");

    await settle(harness);

    expect(await approved(harness, "old-friend.example")).toBe(true);
    expect(await approved(harness, "stranger.example")).toBe(false);
    expect(await approved(harness, "former.example")).toBe(false);
    expect(await statusOf(harness, "old-friend.example")).toBe("approved");
    await harness.reset();
  });

  it("does not approve a peer whose file is edited to approved after the move", async () => {
    const harness = await brain();
    await save(harness, "stranger.example", "discovered");
    await settle(harness);

    await editFile(harness, "stranger.example", "approved");

    expect(await approved(harness, "stranger.example")).toBe(false);
    // The entry shows what is true again.
    expect(await statusOf(harness, "stranger.example")).toBe("discovered");
    await harness.reset();
  });

  it("does not carry approvals over a second time on a later start", async () => {
    const harness = await brain();
    await settle(harness);
    await save(harness, "late.example", "approved");

    await settle(harness);

    expect(await approved(harness, "late.example")).toBe(false);
    expect(await statusOf(harness, "late.example")).toBe("discovered");
    await harness.reset();
  });

  it("leaves an approved peer's entry alone", async () => {
    const harness = await brain();
    await save(harness, "old-friend.example", "approved");
    await settle(harness);

    await editFile(harness, "old-friend.example", "approved");

    expect(await approved(harness, "old-friend.example")).toBe(true);
    expect(await statusOf(harness, "old-friend.example")).toBe("approved");
    await harness.reset();
  });

  it("lets a file edit archive a peer: that only takes contact away", async () => {
    const harness = await brain();
    await save(harness, "old-friend.example", "approved");
    await settle(harness);

    await editFile(harness, "old-friend.example", "archived");

    expect(await statusOf(harness, "old-friend.example")).toBe("archived");
    await harness.reset();
  });
});
