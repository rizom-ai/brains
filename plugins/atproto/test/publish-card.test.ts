import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  AtprotoPlugin,
  atprotoPlugin,
  type AtprotoPdsClientLike,
} from "../src";

function createContext(): ServicePluginContext {
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
  return createServicePluginContext(shell, "atproto");
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
      name: "Test Brain",
      description: "Testing purposes",
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:plc:anchor",
      siteUrl: "https://brain.example.com",
      a2aEndpoint: "/a2a",
    });
    expect(result.record.capabilities).toContain("model:test-brain");
    expect(result.record.capabilities).toContain("endpoint:A2A");
    expect(result.record.capabilities).toContain("interaction:Chat");
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("publishes the brain card to the configured PDS repo", async () => {
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
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        brainDid: "did:web:brain.example.com",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          createRecord,
        }),
      },
    );

    const result = await plugin.publishBrainCard(createContext());

    expect(result.dryRun).toBe(false);
    expect(result.repo).toBe("did:plc:session-repo");
    expect(result.uri).toBe("at://repo/card");
    expect(result.cid).toBe("cid");
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.rizom.brain.card",
      rkey: "self",
      validate: true,
      record: result.record,
    });
  });

  it("exposes a publish-card tool that can dry-run the record", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });
    const capabilities = await plugin.register(
      createMockShell({
        domain: "brain.example.com",
      }),
    );

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
        record: { $type: "ai.rizom.brain.card", name: "Test Brain" },
      },
    });
  });
});
