import { describe, expect, it } from "bun:test";
import { defineServicePlugin, defineTool, z } from "@brains/sdk/services";
import { createBrainTestHarness } from "@brains/sdk/testing";

/**
 * Testing a package without booting a brain.
 *
 * Every package in this repository tests through the runtime's own harness,
 * which an external author cannot import — so the only way to exercise a
 * published package was to install it into a packed brain and drive that.
 * Everything below is written the way an author would write it: nothing here
 * imports the runtime.
 */
describe("the public testing harness", () => {
  const greeter = defineServicePlugin(
    { id: "greeter", config: z.object({ greeting: z.string() }) },
    {
      tools: ({ config }) => [
        defineTool({
          name: "greet",
          description: "Say hello.",
          input: z.object({ name: z.string() }),
          output: z.object({ message: z.string() }),
          execute: ({ input }) => ({
            message: `${config.greeting}, ${input.name}`,
          }),
        }),
      ],
    },
  );

  const install = async (): Promise<{
    harness: ReturnType<typeof createBrainTestHarness>;
    greet: { call(input: unknown): Promise<unknown> };
  }> => {
    const harness = createBrainTestHarness();
    const installed = await harness.installPackage(
      greeter,
      { greeting: "Hello" },
      { name: "@fixture/greeter", version: "0.1.0" },
    );
    const greet = installed.tools.find(({ name }) => name.endsWith("greet"));
    if (!greet) throw new Error("The package declared no greet tool");
    return { harness, greet };
  };

  it("installs a package and answers its tool", async () => {
    const { harness, greet } = await install();

    expect(await greet.call({ name: "world" })).toEqual({
      message: "Hello, world",
    });

    await harness.reset();
  });

  it("refuses input the tool did not declare", async () => {
    const { harness, greet } = await install();

    expect(greet.call({ nome: "world" })).rejects.toThrow("refused");

    await harness.reset();
  });

  it("seeds records a package reads back", async () => {
    const harness = createBrainTestHarness();

    harness.addEntities([
      {
        id: "note-1",
        entityType: "note",
        content: "# A note",
        metadata: { words: 2 },
      },
    ]);

    expect(await harness.getEntity("note", "note-1")).toMatchObject({
      id: "note-1",
      entityType: "note",
    });

    await harness.reset();
  });
});
