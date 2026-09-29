import { createMockShell } from "@brains/plugins/test";
import { describe, expect, it, mock } from "bun:test";
import type { AtprotoPdsClientLike } from "../src";
import {
  createProfiledShell,
  instantiate,
  publisherFor,
  type MockShell,
} from "./helpers/install";

/** A brain with a web channel, whose site is where the card points. */
function createWebShell(): MockShell {
  const shell = createProfiledShell({
    domain: "brain.example.com",
    kind: "professional",
    category: "person",
    web: true,
  });
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

describe("AT Protocol brain card publishing", () => {
  it("builds a brain card record without writing when dryRun is true", async () => {
    const createRecord = mock(async () => ({
      uri: "at://repo/card",
      cid: "cid",
    }));
    const publisher = publisherFor(
      createWebShell(),
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

    const result = await publisher.publishBrainCard({ dryRun: true });

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
        category: "person",
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

  it("defaults brain and anchor DIDs from the siteUrl host", async () => {
    const publisher = publisherFor(createWebShell(), {
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
    });

    const result = await publisher.publishBrainCard({ dryRun: true });

    expect(result.record.brain.did).toBe("did:web:brain.example.com");
    expect(result.record.anchor.did).toBe("did:web:brain.example.com:anchor");
  });

  it("rejects did:web brain identities that do not match siteUrl host", async () => {
    const publisher = publisherFor(createWebShell(), {
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      brainDid: "did:web:other.example.com",
      anchorDid: "did:plc:anchor",
    });

    let error: unknown;
    try {
      await publisher.publishBrainCard({ dryRun: true });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty(
      "message",
      "AT Protocol brain card did:web host must match siteUrl host",
    );
  });

  it("rejects typed publication when no profile kind is selected", () => {
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.getProfileKindRegistry().finalize();
    const publisher = publisherFor(shell, {
      identifier: "brain.example.com",
      appPassword: "secret",
    });

    expect(publisher.publishBrainCard({ dryRun: true })).rejects.toThrow(
      "AT Protocol brain card publishing requires a configured profile kind",
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
    const publisher = publisherFor(
      createWebShell(),
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

    const result = await publisher.publishBrainCard();

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

  it("does not expose publish-card as an agent tool", async () => {
    const config = {
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
      anchorDid: "did:plc:anchor",
    };
    const shell = createWebShell();
    const capabilities = await instantiate(config).register(shell);

    expect(capabilities.tools).toEqual([]);
    const result = await publisherFor(shell, config).publishBrainCard({
      dryRun: true,
    });
    expect(result).toMatchObject({
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
          category: "person",
          kind: "professional",
        },
        siteUrl: "https://brain.example.com/",
      },
    });
  });
});
