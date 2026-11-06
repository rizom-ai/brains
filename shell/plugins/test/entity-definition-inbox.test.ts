import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type InboxSource,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const suggestionMetadata = z.object({
  title: z.string(),
  status: z.enum(["pending", "accepted"]).default("pending"),
});

const suggestion = defineEntity({
  type: "suggestion",
  purpose: "A suggestion a visitor left, waiting for the operator.",
  metadata: suggestionMetadata,
  actions: { publish: "admin" },
  inbox: {
    sourceId: "suggestions",
    displayName: "Suggestions",
    facets: [
      {
        key: "status",
        label: "Status",
        values: [{ value: "pending", label: "Pending" }],
      },
    ],
    list: async ({ records }) =>
      (await records.list())
        .filter(({ metadata }) => metadata.status === "pending")
        .map(({ id, metadata, updated }) => ({
          id,
          title: metadata.title,
          receivedAt: updated,
          urgency: "normal",
          entityRef: { entityType: "suggestion", entityId: id },
          facets: { status: "pending" },
          actions: [
            { id: "accept", label: "Accept" },
            { id: "decline", label: "Decline", confirm: true },
          ],
        })),
    resolveDetail: async (itemId, { records, actor, signal }) => {
      signal.throwIfAborted();
      const found = await records.get(itemId);
      if (!found) throw new Error("Suggestion not found");
      return {
        kind: "plain",
        text: `${found.metadata.title} (seen by ${actor.permissionLevel})`,
        truncated: false,
      };
    },
    act: async (itemId, actionId, { records, edits }) => {
      const found = await records.get(itemId);
      if (!found) throw new Error("Suggestion not found");
      if (actionId === "decline") return edits.delete(found);
      return edits.publish(found, {
        metadata: { ...found.metadata, status: "accepted" },
      });
    },
  },
});

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "suggestions", entities }),
    {},
    { name: "@fixture/suggestions", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-inbox"),
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  harness.getMockShell().getInboxRegistry().finalize();
  for (const id of ["kinder", "faster"]) {
    await harness.getEntityService().createEntity({
      entity: {
        id,
        entityType: "suggestion",
        content: `Make it ${id}.`,
        metadata: { title: `Make it ${id}`, status: "pending" },
        visibility: "restricted",
      },
    });
  }
  return harness;
}

function source(harness: Harness): InboxSource {
  const found = harness
    .getMockShell()
    .getInboxRegistry()
    .getSource("suggestions");
  if (!found) throw new Error("The inbox source was not registered");
  return found;
}

const admin = { permissionLevel: "admin" } as const;
const trusted = { permissionLevel: "trusted" } as const;

describe("declared inbox", () => {
  it("lists the items the type puts in front of the operator", async () => {
    const harness = await install([suggestion]);
    try {
      const inbox = source(harness);
      expect(inbox.displayName).toBe("Suggestions");
      expect((await inbox.list()).map(({ id }) => id).sort()).toEqual([
        "faster",
        "kinder",
      ]);
      expect(
        await inbox.resolveDetail?.(
          "kinder",
          admin,
          new AbortController().signal,
        ),
      ).toEqual({
        kind: "plain",
        text: "Make it kinder (seen by admin)",
        truncated: false,
      });
    } finally {
      await harness.reset();
    }
  });

  it("acts through edits that need the actor's permission", async () => {
    const harness = await install([suggestion]);
    try {
      const inbox = source(harness);
      const refused = await inbox
        .act("kinder", "accept", trusted)
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);

      await inbox.act("kinder", "accept", admin);
      const accepted = await harness.getEntityService().getEntity({
        entityType: "suggestion",
        id: "kinder",
        visibilityScope: "restricted",
      });
      expect(accepted?.metadata).toEqual({
        title: "Make it kinder",
        status: "accepted",
      });

      await inbox.act("faster", "decline", admin);
      expect(
        await harness.getEntityService().getEntity({
          entityType: "suggestion",
          id: "faster",
          visibilityScope: "restricted",
        }),
      ).toBeNull();
      expect(await inbox.list()).toEqual([]);
    } finally {
      await harness.reset();
    }
  });

  it("reads at the actor's visibility when it acts", async () => {
    const harness = await install([suggestion]);
    try {
      const outcome = await source(harness)
        .act("kinder", "accept", { permissionLevel: "public" })
        .catch((error: unknown) => error);
      expect(String(outcome)).toContain("Suggestion not found");
    } finally {
      await harness.reset();
    }
  });

  it("refuses a write over a record that changed after it was read", async () => {
    const harness = await install([
      defineEntity({
        type: "suggestion",
        purpose: "Writes over a stale read.",
        metadata: suggestionMetadata,
        inbox: {
          sourceId: "suggestions",
          displayName: "Suggestions",
          list: async () => [],
          act: async (itemId, _actionId, { records, edits }) => {
            const found = await records.get(itemId);
            if (!found) throw new Error("Suggestion not found");
            await harness.getEntityService().updateEntity({
              entity: {
                ...found,
                content: "Edited meanwhile.",
              },
            });
            await edits.update(found, { content: "Accepted." });
          },
        },
      }),
    ]);
    try {
      const outcome = await source(harness)
        .act("kinder", "accept", admin)
        .catch((error: unknown) => error);
      expect(String(outcome)).toContain("changed meanwhile");
    } finally {
      await harness.reset();
    }
  });
});
