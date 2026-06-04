import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  AtprotoPlugin,
  atprotoPlugin,
  type AtprotoPdsClientLike,
} from "../src";

function createShellWithA2A(): ReturnType<typeof createMockShell> {
  const shell = createMockShell({ domain: "brain.example.com" });
  shell.registerEndpoint({
    pluginId: "a2a",
    label: "A2A",
    url: "/a2a",
    priority: 10,
    visibility: "public",
  });
  shell.registerInteraction({
    pluginId: "web-chat",
    id: "chat",
    label: "Chat",
    href: "/chat",
    kind: "agent",
    priority: 20,
    visibility: "public",
  });
  return shell;
}

function createContext(): ServicePluginContext {
  return createServicePluginContext(createShellWithA2A(), "atproto");
}

describe("AT Protocol brain card publishing", () => {
  it("builds a brain card record without writing when dryRun is true", async () => {
    const createRecord = mock(async () => ({
      uri: "at://repo/card",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        repoDid: "did:plc:repo",
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:plc:anchor",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          createRecord,
        }),
      },
    );

    const result = await plugin.publishBrainCard(createContext(), {
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.repo).toBe("did:plc:repo");
    expect(result.uri).toBeUndefined();
    expect(result.record).toMatchObject({
      $type: "ai.rizom.brain.card",
      brain: {
        did: "did:web:brain.example.com",
        name: "Test Brain",
        role: "Test Assistant",
        purpose: "Testing purposes",
        values: ["reliability", "accuracy"],
      },
      anchor: {
        did: "did:plc:anchor",
        name: "Test Owner",
        kind: "professional",
      },
      siteUrl: "https://brain.example.com/",
      skills: [],
      model: "test-brain",
    });
    expect("brainDid" in result.record).toBe(false);
    expect("anchorDid" in result.record).toBe(false);
    expect(result.record.version).toBeDefined();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("rejects did:web brain identities that do not match siteUrl host", async () => {
    const plugin = new AtprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      brainDid: "did:web:other.example.com",
      anchorDid: "did:plc:anchor",
    });

    let error: unknown;
    try {
      await plugin.publishBrainCard(createContext(), { dryRun: true });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty(
      "message",
      "AT Protocol brain card did:web host must match siteUrl host",
    );
  });

  it("upserts the brain card to the configured PDS repo", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:session-repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const createRecord = mock(async () => ({
      uri: "at://repo/card",
      cid: "cid",
    }));
    const putRecord = mock(async () => ({
      uri: "at://repo/card/self",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:plc:anchor",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          createRecord,
          putRecord,
        }),
      },
    );

    const result = await plugin.publishBrainCard(createContext());

    expect(result.dryRun).toBe(false);
    expect(result.repo).toBe("did:plc:session-repo");
    expect(result.uri).toBe("at://repo/card/self");
    expect(result.cid).toBe("cid");
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createRecord).not.toHaveBeenCalled();
    expect(putRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.rizom.brain.card",
      rkey: "self",
      validate: false,
      record: result.record,
    });
  });

  it("exposes a publish-card tool that can dry-run the record", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:plc:anchor",
    });
    const capabilities = await plugin.register(createShellWithA2A());

    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_publish_card",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      { dryRun: true },
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        record: {
          $type: "ai.rizom.brain.card",
          brain: {
            did: "did:web:brain.example.com",
            name: "Test Brain",
          },
          anchor: {
            did: "did:plc:anchor",
            name: "Test Owner",
            kind: "professional",
          },
          siteUrl: "https://brain.example.com/",
        },
      },
    });
  });
});
