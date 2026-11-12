import { describe, expect, it } from "bun:test";
import type { AtprotoProjection } from "@brains/atproto-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type { LinkEntity } from "../src/schemas/link";
import { linkPlugin } from "./link-plugin";

// A link as a declared type reads it: its metadata and its summary.
const link: LinkEntity = {
  id: "link-1",
  entityType: "link",
  content: "AT Protocol documentation summary.\n",
  created: "2026-05-28T10:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    status: "published",
    title: "AT Protocol",
    url: "https://atproto.com",
    description: "Protocol docs",
    capturedAt: "2026-05-28T09:00:00.000Z",
    source: { ref: "cli:local", label: "CLI" },
  },
};

async function projection(): Promise<AtprotoProjection> {
  const harness = createPluginHarness({ dataDir: "/tmp/test-link-atproto" });
  await harness.installPlugin(linkPlugin());
  const found = harness
    .getMockShell()
    .getAtprotoProjectionRegistry()
    .get("link");
  if (!found) throw new Error("No link projection");
  return found;
}

describe("link ATProto projection", () => {
  it("maps links to ai.rizom.brain.link records", async () => {
    const linkProjection = await projection();

    const record = await linkProjection.buildRecord({
      entity: link,
      context: createPluginHarness().getServiceContext("link"),
      config: {
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

  it("names its page when the site gives the link one, and nothing otherwise", async () => {
    const linkProjection = await projection();
    const context = createPluginHarness().getServiceContext("link");
    const placed = await linkProjection.buildRecord({
      entity: link,
      context,
      config: {},
      pageUrl: "https://brain.example.com/links/link-1",
    });
    expect(placed["canonicalUrl"]).toBe(
      "https://brain.example.com/links/link-1",
    );
    const unplaced = await linkProjection.buildRecord({
      entity: link,
      context,
      config: {},
    });
    expect(unplaced["canonicalUrl"]).toBeUndefined();
  });

  it("registers the link projection when the links register", async () => {
    const linkProjection = await projection();
    expect(linkProjection.collection).toBe("ai.rizom.brain.link");
    expect(linkProjection.validate).toBe(false);
  });
});
