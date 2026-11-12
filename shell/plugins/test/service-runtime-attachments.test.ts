import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createServicePluginContext,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads the attachments other
 * packages provide as its class did through context.attachments: whether a
 * source type provides an attachment, and the attachment itself, resolved
 * by its provider; none where no provider is registered. Content-pipeline
 * reads a post's rendered cover this way before it publishes.
 */

async function runtimeOn(shell: MockShell): Promise<{
  runtime: ServiceRuntime;
  plugin: Plugin;
}> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

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
    const { runtime } = await runtimeOn(shell);
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
    const { runtime } = await runtimeOn(createMockShell());

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
