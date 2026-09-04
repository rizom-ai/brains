import { describe, it, expect } from "bun:test";
import type { Plugin } from "@brains/plugins";
import {
  createPluginHarness,
  expectConfirmation,
  expectSuccess,
} from "@brains/plugins/test";
import {
  createAgentCard,
  createMockAgentCardFetch,
  installAgentDiscovery,
  runTool,
  makeAgentEntity,
  toolsOf,
  useNetwork,
} from "./fixtures/agent-network";

import { agentEntitySchema } from "../src/schemas/agent";
import { expectConfirmationArgs } from "@brains/test-utils";

describe("the connect tool", () => {
  it("registers agents_connect as the canonical confirmation-gated A2A verification tool", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({
      "connect-followup.example": createAgentCard("connect-followup.example"),
    });

    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);

    const tool = toolsOf(harness).find(
      (candidate) => candidate.name === "agents_connect",
    );
    expect(tool?.visibility).toBe("trusted");
    expect(tool?.sideEffects).toBe("external");
    expect(tool?.description).toContain("/.well-known/agent-card.json");
    expect(tool?.description).not.toContain("confirmed");
    expect(tool?.description).toContain(
      "Never use this tool for a request to approve or archive an existing saved contact",
    );
    expect(tool?.description).not.toContain("prior conversation turn");

    const confirmation = await runTool(harness, "agents_connect", {
      source: { kind: "url", url: "connect-followup.example" },
    });

    expectConfirmation(confirmation);
    expect(confirmation.toolName).toBe("agents_connect");
    // The subject is named: approving "connect an agent" without seeing
    // which one is not a decision anyone can make.
    expect(confirmation.summary).toContain("connect-followup.example");
    expect(confirmation.summary).toContain("A2A Agent Card");
    const confirmationArgs = expectConfirmationArgs(confirmation);
    expect(confirmationArgs).toMatchObject({
      source: { kind: "url", url: "connect-followup.example" },
    });
    expect(typeof confirmationArgs["_rizomConfirmationToken"]).toBe("string");

    const result = await runTool(harness, "agents_connect", confirmationArgs);

    expectSuccess(result);
    expect(result.data).toMatchObject({
      status: "approved",
      entityId: "connect-followup.example",
      connected: true,
      created: true,
      a2aEndpoint: "https://connect-followup.example/a2a",
      skills: [
        {
          name: "Research",
          description: "Research topics for collaborators.",
          tags: ["research"],
        },
      ],
    });
    expect(fetchMock.calls).toEqual([
      "https://connect-followup.example/.well-known/agent-card.json",
    ]);

    const saved = await harness.getEntityService().getEntity(
      {
        entityType: "agent",
        id: "connect-followup.example",
      },
      agentEntitySchema,
    );
    expect(saved?.metadata.status).toBe("approved");
    expect(saved?.metadata.a2aEndpoint).toBe(
      "https://connect-followup.example/a2a",
    );
    expect(saved?.content).toContain("Research");

    harness.reset();
  });

  it("returns not_an_agent when agents_connect cannot verify an Agent Card", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({});

    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);

    const confirmation = await runTool(harness, "agents_connect", {
      source: { kind: "url", url: "missing.example" },
    });
    expectConfirmation(confirmation);

    const result = await runTool(
      harness,
      "agents_connect",
      expectConfirmationArgs(confirmation),
    );

    // The runtime shapes a thrown failure; a declared tool carries no code
    // of its own.
    expect(result).toEqual({
      success: false,
      error: "Could not verify an A2A Agent Card for missing.example.",
    });
    expect(
      await harness.getEntityService().getEntity({
        entityType: "agent",
        id: "missing.example",
      }),
    ).toBeNull();

    harness.reset();
  });

  it("rejects confirmed agents_connect args that do not match pending approval", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    const confirmation = await runTool(harness, "agents_connect", {
      source: { kind: "url", url: "connect-original.example" },
    });
    expectConfirmation(confirmation);

    const result = await runTool(harness, "agents_connect", {
      ...expectConfirmationArgs(confirmation),
      source: { kind: "url", url: "connect-changed.example" },
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("do not match the pending approval"),
    });

    harness.reset();
  });

  it("rejects confirmed agents_connect without a minted confirmation token", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    const result = await runTool(harness, "agents_connect", {
      source: { kind: "url", url: "fabricated.example" },
      _rizomConfirmationToken: "not-a-real-token",
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("No pending"),
    });

    harness.reset();
  });

  it("agents_connect approves an existing discovered agent", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({
      "yeehaa.io": createAgentCard("yeehaa.io"),
    });

    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);
    await harness
      .getEntityService()
      .createEntity({ entity: makeAgentEntity("discovered") });

    const confirmation = await runTool(harness, "agents_connect", {
      source: { kind: "url", url: "https://yeehaa.io" },
    });
    expectConfirmation(confirmation);

    const result = await runTool(
      harness,
      "agents_connect",
      expectConfirmationArgs(confirmation),
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      status: "approved",
      entityId: "yeehaa.io",
      connected: true,
      created: false,
    });

    const entities = await harness.getEntityService().listEntities({
      entityType: "agent",
    });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.metadata["status"]).toBe("approved");
    expect(entities[0]?.content).toContain("status: approved");

    harness.reset();
  });

  it("agents_connect refreshes an existing approved agent without downgrading approval", async () => {
    const harness = createPluginHarness<Plugin>({});
    const fetchMock = createMockAgentCardFetch({
      "yeehaa.io": createAgentCard("yeehaa.io"),
    });

    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);
    await harness
      .getEntityService()
      .createEntity({ entity: makeAgentEntity("approved") });

    const confirmation = await runTool(harness, "agents_connect", {
      source: { kind: "url", url: "https://yeehaa.io" },
    });
    expectConfirmation(confirmation);

    const result = await runTool(
      harness,
      "agents_connect",
      expectConfirmationArgs(confirmation),
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      status: "approved",
      entityId: "yeehaa.io",
      connected: true,
      created: false,
    });

    const entities = await harness.getEntityService().listEntities({
      entityType: "agent",
    });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.metadata["status"]).toBe("approved");

    harness.reset();
  });
});
