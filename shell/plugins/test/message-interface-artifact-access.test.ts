import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse, ResponseRenderDirective } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * An artifact the caller may not see must not reach them as a card either.
 *
 * `collectDeniedArtifactCardIds` says every message interface should drop
 * these, and web-chat did it by hand — which meant the pipeline handed every
 * *declared* interface the undenied plan, and each one would have had to
 * remember the check on its own. The caller's permission level is resolved
 * one frame above where the plan is built, so the pipeline is the only place
 * that can apply it once for all of them.
 */

interface Receiver {
  receiveAuthenticated(input: {
    sender: { id: string; displayName?: string };
    channel: { id: string; threadId?: string };
    text: string;
  }): Promise<void>;
}

const receivers: Receiver[] = [];

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/artifact-reader", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");
  return plugin;
}

/** An interface that records the directives it was handed. */
function recorder(
  seen: ResponseRenderDirective[],
): ReturnType<typeof defineMessageInterface> {
  return defineMessageInterface({
    id: "artifact-reader",
    config: z.object({}),
    channel: {
      type: "artifact-reader",
      displayName: "Artifact Reader",
      subjectLabel: "Room",
      recipient: z.string(),
    },
    listen: async ({ messages, signal, health }) => {
      receivers.push(messages);
      health.ready();
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    send: async () => "message-1",
    present: ({ directives }) => {
      seen.push(...directives);
      return undefined;
    },
  });
}

async function deliverWithArtifact(
  seen: ResponseRenderDirective[],
  entityVisibility: "public" | "restricted",
): Promise<void> {
  receivers.length = 0;
  const harness = createPluginHarness();
  harness.addEntities([
    {
      id: "q3-financials",
      entityType: "document",
      content: "data:application/pdf;base64,AA==",
      metadata: {},
      visibility: entityVisibility,
    },
  ]);
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (): Promise<AgentResponse> => ({
      text: "Here is the report.",
      cards: [
        {
          kind: "attachment",
          id: "card-restricted",
          title: "Q3 financials",
          attachment: {
            filename: "q3-financials.pdf",
            mediaType: "application/pdf",
            url: "/api/files/q3-financials.pdf",
            source: { entityType: "document", entityId: "q3-financials" },
          },
        },
      ],
      toolResults: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    invalidateAgent: (): void => {},
    confirmPendingAction: async (): Promise<AgentResponse> => {
      throw new Error("not reached");
    },
  }));

  const plugin = instantiate(recorder(seen));
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
  await harness
    .getMockShell()
    .getDaemonRegistry()
    .start(`${plugin.id}:listener`);

  const receiver = receivers[0];
  if (!receiver) throw new Error("Listener did not expose its receiver");
  await receiver.receiveAuthenticated({
    sender: { id: "reader-1" },
    channel: { id: "room-1" },
    text: "show me the report",
  });
}

describe("a declared interface delivering an artifact", () => {
  it("marks an artifact the caller may not see as denied", async () => {
    const seen: ResponseRenderDirective[] = [];
    await deliverWithArtifact(seen, "restricted");

    // Denied rather than absent: the interface still decides whether to
    // mention it, but it can no longer render the card as deliverable.
    expect(seen.map((directive) => directive.kind)).toContain(
      "denied-artifact",
    );
    expect(seen.map((directive) => directive.kind)).not.toContain("artifact");
  });

  it("leaves an artifact the caller may see deliverable", async () => {
    const seen: ResponseRenderDirective[] = [];
    await deliverWithArtifact(seen, "public");

    expect(seen.map((directive) => directive.kind)).toContain("artifact");
    expect(seen.map((directive) => directive.kind)).not.toContain(
      "denied-artifact",
    );
  });
});
