import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto";
import { createLinkAtprotoProjection } from "../src/atproto-projection";
import { LinkPlugin } from "../src/plugin";
import { linkAdapter } from "../src/adapters/link-adapter";
import type { LinkEntity } from "../src/schemas/link";

const content = linkAdapter.createLinkContent({
  status: "published",
  title: "AT Protocol",
  url: "https://atproto.com",
  description: "Protocol docs",
  summary: "AT Protocol documentation summary.",
  domain: "atproto.com",
  capturedAt: "2026-05-28T09:00:00.000Z",
  source: { ref: "cli:local", label: "CLI" },
});

const link: LinkEntity = {
  id: "link-1",
  entityType: "link",
  content,
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: { title: "AT Protocol", status: "published" },
};

describe("link ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps links to ai.rizom.brain.link records", async () => {
    const projection = createLinkAtprotoProjection();

    const record = await projection.buildRecord({
      entity: link,
      context: createPluginHarness().getServiceContext("link"),
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
        anchorDid: "did:plc:anchor",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.link",
      title: "AT Protocol",
      url: "https://atproto.com",
      description: "Protocol docs",
      summary: "AT Protocol documentation summary.",
      domain: "atproto.com",
      capturedAt: "2026-05-28T09:00:00.000Z",
      source: { ref: "cli:local", label: "CLI" },
      anchorDid: "did:plc:anchor",
      sourceEntityType: "link",
      sourceEntityId: "link-1",
      createdAt: "2026-05-28T10:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("registers the link projection when the link plugin registers", async () => {
    const harness = createPluginHarness({ dataDir: "/tmp/test-link-atproto" });
    await harness.installPlugin(new LinkPlugin({}));

    const projection = AtprotoProjectionRegistry.getInstance().get("link");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.link");
  });
});
