import { describe, it, expect } from "bun:test";
import type { Plugin } from "@brains/plugins";
import {
  AuthService,
  AuthServicePlugin,
  getActiveAuthService,
} from "@brains/auth-service";
import { keyFingerprint } from "@brains/http-signatures";
import {
  createPluginHarness,
  expectConfirmation,
  expectSuccess,
} from "@brains/plugins/test";
import {
  createMockJwksFetch,
  installAgentDiscovery,
  runTool,
  tempStorageDir,
  toolsOf,
  useNetwork,
} from "./fixtures/agent-network";
import { createTestAgent } from "./fixtures/agent";

describe("the inbound trust tool", () => {
  it("registers agents_set-trust-level as the explicit inbound trust tool", async () => {
    const harness = createPluginHarness<Plugin>({});

    await installAgentDiscovery(harness);

    const tool = toolsOf(harness).find(
      (candidate) => candidate.name === "agents_set-trust-level",
    );
    expect(tool?.visibility).toBe("admin");
    expect(tool?.sideEffects).toBe("external");
    expect(tool?.description).toContain("inbound A2A trust");
    expect(tool?.description).toContain("does not add or remove");

    harness.reset();
  });

  it("agents_set-trust-level pins a peer key for inbound trusted access", async () => {
    const harness = createPluginHarness<Plugin>({});
    const authPlugin = new AuthServicePlugin({
      storageDir: await tempStorageDir(),
      issuer: "https://local.example",
    });
    const remoteAuth = new AuthService({
      storageDir: await tempStorageDir(),
      issuer: "https://trust.example",
    });
    const remoteJwks = await remoteAuth.getJwks();
    const remoteA2AKey = remoteJwks.keys.find((key) => key.alg === "EdDSA");
    if (!remoteA2AKey) throw new Error("Expected remote A2A public key");
    const fetchMock = createMockJwksFetch({ "trust.example": remoteJwks });

    await harness.installPlugin(authPlugin);
    useNetwork(fetchMock.fetch);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "trust.example",
        name: "Trusted Peer",
        url: "https://trust.example/a2a",
        status: "approved",
      }),
    });

    const confirmation = await runTool(harness, "agents_set-trust-level", {
      agent: "trust.example",
      level: "trusted",
    });
    expectConfirmation(confirmation);
    expect(confirmation.toolName).toBe("agents_set-trust-level");
    expect(confirmation.summary).toContain(
      "Grant inbound trusted A2A access to trust.example?",
    );
    // The fingerprint is no longer shown at approval time, because it is no
    // longer fetched then. It used to be fetched first, displayed, and
    // handed back through the caller — so what got pinned was whatever came
    // back rather than whatever the domain publishes. The assertions below
    // are the property that replaced it: the pinned key is the one the
    // domain served, fetched once, after the person agreed.
    expect(fetchMock.calls).toEqual([]);

    const activeAuth = getActiveAuthService();
    if (!activeAuth) throw new Error("Expected active auth service");
    const owner = await activeAuth.createUser({
      displayName: "Owner",
      role: "admin",
    });
    const result = await runTool(
      harness,
      "agents_set-trust-level",
      confirmation.args as Record<string, unknown>,
      { kind: "user", userId: owner.userId },
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      agent: "trust.example",
      level: "trusted",
      keyFingerprint: keyFingerprint(remoteA2AKey),
    });
    expect(await activeAuth.getA2APeerTrust("trust.example")).toMatchObject({
      domain: "trust.example",
      grantedLevel: "trusted",
      keyFingerprint: keyFingerprint(remoteA2AKey),
    });
    expect(fetchMock.calls).toEqual([
      "https://trust.example/.well-known/jwks.json",
    ]);
    expect(await activeAuth.listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: owner.userId,
          action: "auth.a2a_peer_trust.granted",
          targetId: "trust.example",
        }),
      ]),
    );

    if (authPlugin.shutdown) await authPlugin.shutdown();
    harness.reset();
  });

  it("agents_set-trust-level revokes inbound trusted access", async () => {
    const harness = createPluginHarness<Plugin>({});
    const authPlugin = new AuthServicePlugin({
      storageDir: await tempStorageDir(),
      issuer: "https://local.example",
    });

    await harness.installPlugin(authPlugin);
    await installAgentDiscovery(harness);
    await harness.getEntityService().createEntity({
      entity: createTestAgent({
        id: "trust.example",
        name: "Trusted Peer",
        url: "https://trust.example/a2a",
        status: "approved",
      }),
    });
    const activeAuth = getActiveAuthService();
    if (!activeAuth) throw new Error("Expected active auth service");
    await activeAuth.grantA2APeerTrust({
      domain: "trust.example",
      keyFingerprint: "fingerprint-1",
      grantedLevel: "trusted",
    });

    const confirmation = await runTool(harness, "agents_set-trust-level", {
      agent: "trust.example",
      level: "public",
    });
    expectConfirmation(confirmation);
    expect(confirmation.summary).toBe(
      "Revoke inbound trusted A2A access from trust.example?",
    );

    const result = await runTool(
      harness,
      "agents_set-trust-level",
      confirmation.args as Record<string, unknown>,
    );

    expectSuccess(result);
    expect(result.data).toMatchObject({
      agent: "trust.example",
      level: "public",
    });
    expect(await activeAuth.getA2APeerTrust("trust.example")).toBeUndefined();

    if (authPlugin.shutdown) await authPlugin.shutdown();
    harness.reset();
  });
});
