import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/web-chat` and `@brains/chat` need to hold a file.
 *
 * An interface that accepts an attachment has to put the bytes somewhere the
 * agent can read them back, survive a restart, and be reachable at a URL the
 * client can fetch. That is durable storage with a retention policy — the
 * same reason `runtimeState` exists, for content rather than for bookkeeping,
 * and it arrives the same way: a scope the declaration names, a store the
 * runtime owns.
 *
 * Scoped rather than shared: two interfaces accepting attachments must not be
 * able to read each other's, and a ref handed to a client says which scope
 * issued it.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/uploading-interface",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Interface plugin was not created");
  return plugin;
}

describe("an interface that holds a file", () => {
  it("saves bytes and reads them back through a scoped store", async () => {
    const definition = defineInterface({
      id: "uploader",
      config: z.object({}),
      setup: ({ uploads }) => ({
        store: uploads({
          namespace: "upload",
          refKind: "upload",
          routePath: "/api/uploader/uploads",
        }),
      }),
      tools: ({ state }) => [
        defineTool({
          name: "keep",
          description: "Store a note and hand back its ref.",
          input: z.object({ filename: z.string(), text: z.string() }),
          output: z.object({ kind: z.string(), id: z.string() }),
          permission: "public",
          execute: async ({ input }) => {
            const record = await state.store.save({
              filename: input.filename,
              mediaType: "text/plain",
              content: Buffer.from(input.text, "utf8"),
            });
            return record.ref;
          },
        }),
        defineTool({
          name: "recall",
          description: "Read a stored note back.",
          input: z.object({ id: z.string() }),
          output: z.object({ text: z.string(), filename: z.string() }),
          permission: "public",
          execute: async ({ input }) => {
            // `read` refuses rather than answering undefined, so a caller
            // cannot mistake a missing file for an empty one.
            const resolved = await state.store.read(input.id);
            return {
              text: resolved.content.toString("utf8"),
              filename: resolved.record.filename,
            };
          },
        }),
      ],
    });

    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(definition, {}));

    // Parsed rather than asserted: the discriminant is checked, so a tool that
    // failed cannot read back as a success with undefined fields.
    const kept = z
      .object({
        success: z.literal(true),
        data: z.object({ kind: z.string(), id: z.string() }),
      })
      .parse(
        await harness.executeTool("uploader_keep", {
          filename: "note.txt",
          text: "the bytes survive",
        }),
      );

    expect(kept.data.kind).toBe("upload");

    expect(
      await harness.executeTool("uploader_recall", { id: kept.data.id }),
    ).toEqual({
      success: true,
      data: { text: "the bytes survive", filename: "note.txt" },
    });
  });

  it("keeps one interface's uploads out of another's scope", async () => {
    // A ref is only meaningful in the scope that issued it. Two interfaces
    // both accepting attachments must not be able to read each other's.
    const uploader = (id: string): ReturnType<typeof defineInterface> =>
      defineInterface({
        id,
        config: z.object({}),
        setup: ({ uploads }) => ({
          store: uploads({
            namespace: "upload",
            refKind: "upload",
            routePath: `/api/${id}/uploads`,
          }),
        }),
        tools: ({ state }) => [
          defineTool({
            name: "keep",
            description: "Store a note.",
            input: z.object({ text: z.string() }),
            output: z.object({ id: z.string() }),
            permission: "public",
            execute: async ({ input }) => {
              const record = await state.store.save({
                filename: "note.txt",
                mediaType: "text/plain",
                content: Buffer.from(input.text, "utf8"),
              });
              return { id: record.ref.id };
            },
          }),
          defineTool({
            name: "recall",
            description: "Read a note back.",
            input: z.object({ id: z.string() }),
            output: z.object({ text: z.string() }),
            permission: "public",
            execute: async ({ input }) => {
              const resolved = await state.store.read(input.id);
              return { text: resolved.content.toString("utf8") };
            },
          }),
        ],
      });

    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(uploader("first"), {}));
    const kept = z
      .object({ data: z.object({ id: z.string() }) })
      .parse(await harness.executeTool("first_keep", { text: "private" }));
    const { id } = kept.data;

    // The first interface can read its own file back.
    expect(await harness.executeTool("first_recall", { id })).toEqual({
      success: true,
      data: { text: "private" },
    });

    // The second asked for the same namespace word and shares the same data
    // directory, and still cannot see it. Before the runtime scoped the
    // namespace by declaration id, this read succeeded.
    const other = createPluginHarness();
    await other.installPlugin(instantiate(uploader("second"), {}));
    expect(await other.executeTool("second_recall", { id })).toMatchObject({
      success: false,
      error: "Upload not found",
    });
  });
});
