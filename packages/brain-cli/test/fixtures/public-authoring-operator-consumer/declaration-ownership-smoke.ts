import { defineEntity } from "@rizom/brain/entities";
import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";
import { createBrainTestHarness } from "@rizom/brain/testing";

for (const mutation of ["array", "type"]) {
  const own = defineEntity({
    type: "owned-record",
    purpose: "Owned by the writer",
    metadata: z.object({}),
  });
  const foreign = defineEntity({
    type: "foreign-record",
    purpose: "Owned by another installed package",
    metadata: z.object({}),
  });
  const mutableOwn = { ...own, type: "owned-record" };
  const declarations: Array<typeof mutableOwn | typeof foreign> = [mutableOwn];
  const owner = defineServicePlugin({
    id: "owner",
    config: z.object({}),
    entities: [foreign],
  });
  const writer = defineServicePlugin(
    { id: "writer", config: z.object({}), entities: declarations },
    {
      tools: () => [
        defineTool({
          name: "write",
          description: "Check installed ownership",
          input: z.object({ foreign: z.boolean() }),
          output: z.object({ id: z.string() }),
          execute: ({ input, entities }) =>
            entities.create(input.foreign ? foreign : own, {
              id: "one",
              content: "Body",
              metadata: {},
            }),
        }),
      ],
    },
  );
  const h = createBrainTestHarness();
  try {
    await h.installPackage(
      owner,
      {},
      { name: "@fixture/ownership-owner", version: "0.0.0" },
    );
    const installed = await h.installPackage(
      writer,
      {},
      { name: "@fixture/ownership-writer", version: "0.0.0" },
    );
    await h.finalizeRegistration();
    const refused = async (): Promise<void> => {
      const result = await installed.tool("write").call({ foreign: true });
      if (
        result.ok ||
        !("code" in result) ||
        result.code !== "handler_failed" ||
        !(result.cause instanceof Error) ||
        !result.cause.message.includes("may only write")
      ) {
        throw new Error("Foreign write did not retain its ownership refusal");
      }
    };
    await refused();
    if (mutation === "array") declarations.splice(0, 1, foreign);
    else mutableOwn.type = foreign.type;
    await refused();
    if (await h.getEntity(foreign.type, "one"))
      throw new Error("Foreign record was created");
    const result = await installed.tool("write").call({ foreign: false });
    if (!result.ok || !(await h.getEntity(own.type, "one"))) {
      throw new Error("Original installed ownership was lost");
    }
  } finally {
    await h.reset();
  }
}
