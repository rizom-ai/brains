import { describe, expect, it } from "bun:test";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class reads the attachments other
 * packages provide as its class did through context.attachments: whether a
 * source type provides an attachment, and the attachment itself, resolved
 * by its provider; none where no provider is registered. Content-pipeline
 * reads a post's rendered cover this way before it publishes.
 */

const cover = {
  type: "image" as const,
  data: new Uint8Array([1, 2, 3]),
  mimeType: "image/png" as const,
  filename: "cover.png",
};

describe("a first-party service's attachment reads", () => {
  it("resolve an attachment another package provides", async () => {
    const shell = createMockShell();
    const asked: unknown[] = [];
    createServicePluginContext(shell, "decks").attachments.register(
      "deck",
      "cover",
      {
        resolve: (request) => {
          asked.push(request);
          return cover;
        },
      },
    );
    const { runtime } = await probeService(shell);
    const request = {
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "cover",
    };

    expect(runtime.attachments.hasProvider("deck", "cover")).toBe(true);
    expect(await runtime.attachments.resolve(request)).toEqual(cover);
    expect(asked).toEqual([request]);
  });

  it("have none where no provider is registered", async () => {
    const { runtime } = await probeService(createMockShell());

    expect(runtime.attachments.hasProvider("deck", "cover")).toBe(false);
    expect(
      await runtime.attachments.resolve({
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "cover",
      }),
    ).toBeUndefined();
  });
});
