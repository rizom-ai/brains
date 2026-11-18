import { describe, expect, it } from "bun:test";
import {
  recordConflictContract,
  recordConflictResponseSchema,
  type RecordConflictRequest,
} from "@brains/contracts";
import { inboxItemSchema, type Plugin } from "@brains/plugins";
import {
  createMockShell,
  createPluginHarness,
  registerAll,
} from "@brains/plugins/test";
import { createConflictPlugins } from "./conflict-plugins";
import { rejection } from "./helpers/rejection";

const never = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
};

const lost: RecordConflictRequest = {
  entityType: "note",
  entityId: "readme",
  origin: "file",
  current: "hash-of-current",
  text: "---\ntitle: Readme\n---\n\nEdited in a file.\n",
  targetVisibility: "public",
};

async function installed(options: { executionOnly?: boolean } = {}): Promise<{
  shell: ReturnType<typeof createMockShell>;
  plugins: Plugin[];
}> {
  const shell = createMockShell();
  const plugins = createConflictPlugins();
  await registerAll(shell, plugins, options);
  shell.getInboxRegistry().finalize();
  return { shell, plugins };
}

async function running(): Promise<
  ReturnType<typeof createPluginHarness<Plugin>>
> {
  const harness = createPluginHarness<Plugin>();
  for (const plugin of createConflictPlugins()) {
    await harness.installPlugin(plugin);
  }
  await harness.finalizeRegistration();
  return harness;
}

describe("the conflict package's registered surface", () => {
  it("is the conflict type beside the service that keeps conflicts, with no tools, routes or jobs", async () => {
    const { shell, plugins } = await installed();
    expect(
      plugins.map(({ id, type, packageName }) => [id, type, packageName]),
    ).toEqual([
      ["conflict", "entity", "@brains/conflict"],
      ["conflict-image", "entity", "@brains/conflict"],
      ["conflicts", "service", "@brains/conflict"],
    ]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
  });

  it("registers the conflict type: system, written only by the brain, and out of search, embeddings and projections", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual([
      "conflict",
      "conflict-image",
    ]);
    for (const type of ["conflict", "conflict-image"]) {
      expect(registry.getEntityTypeConfig(type)).toMatchObject({
        classification: "system",
        actionPolicy: never,
        embeddable: false,
        fullTextSearchable: false,
        includeInBroadSearch: false,
        projectionSource: false,
        projectionSourceRole: "excluded",
      });
    }
    // A losing image is held as its bytes.
    expect(registry.getEntityTypeConfig("conflict-image").binaryStorage).toBe(
      "asset",
    );
    expect(
      registry.getEntityTypeConfig("conflict").binaryStorage,
    ).toBeUndefined();
  });

  it("never stores a public conflict", async () => {
    const { shell } = await installed();
    expect(
      shell.getEntityRegistry().getPersistValidator("conflict-image"),
    ).toBeFunction();
    const validate = shell.getEntityRegistry().getPersistValidator("conflict");
    expect(validate).toBeFunction();
    const persisted = async (
      visibility: "public" | "shared" | "restricted",
    ): Promise<void> => {
      await validate?.(
        {
          id: "note:readme:20261118T102030Z",
          entityType: "conflict",
          content: "```text\nx\n```\n",
          metadata: {},
          visibility,
          contentHash: "h",
          created: "2026-11-18T10:20:30.000Z",
          updated: "2026-11-18T10:20:30.000Z",
        },
        { operation: "create" },
      );
    };
    expect(await rejection(persisted("public"))).toContain("never public");
    await persisted("shared");
    await persisted("restricted");
  });

  it("offers the Inbox source where the Inbox is served, and takes losing edits in every process", async () => {
    const web = await installed();
    expect(
      web.shell
        .getInboxRegistry()
        .listSources()
        .map(({ sourceId, displayName }) => [sourceId, displayName]),
    ).toEqual([["conflicts", "Conflicts"]]);

    const worker = await installed({ executionOnly: true });
    expect(worker.shell.getInboxRegistry().listSources()).toEqual([]);
  });
});

describe("the conflict service", () => {
  it("keeps a losing edit handed over on the bus and lists it in the Inbox", async () => {
    const harness = await running();

    const answer = recordConflictResponseSchema.parse(
      await harness.sendMessage(recordConflictContract.name, lost),
    );

    expect(answer.created).toBe(true);
    expect(answer.conflictId).toMatch(/^note:readme:\d{8}T\d{6}Z$/);
    const again = recordConflictResponseSchema.parse(
      await harness.sendMessage(recordConflictContract.name, lost),
    );
    expect(again).toEqual({ conflictId: answer.conflictId, created: false });

    const source = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("conflicts");
    const items = (await source?.list()) ?? [];
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(inboxItemSchema.safeParse(item).success).toBe(true);
    expect(item).toMatchObject({
      title: "note/readme",
      urgency: "normal",
      entityRef: { entityType: "note", entityId: "readme" },
      actions: [
        { id: "apply", label: "Apply this version", confirm: true },
        { id: "keep-current", label: "Keep current" },
      ],
    });
    // The listing is read with no viewer behind it: it carries none of the text.
    expect(JSON.stringify(item)).not.toContain("Edited in a file");
  });

  it("removes the conflict when an admin keeps the current version", async () => {
    const harness = await running();
    await harness.sendMessage(recordConflictContract.name, lost);
    const source = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("conflicts");
    const [item] = (await source?.list()) ?? [];
    if (!source || !item) throw new Error("No conflict in the Inbox");

    expect(
      await rejection(
        source.act(item.id, "nonsense", { permissionLevel: "admin" }),
      ),
    ).toContain("Unknown conflict action");
    await source.act(item.id, "keep-current", { permissionLevel: "admin" });

    expect(await source.list()).toEqual([]);
  });
});
