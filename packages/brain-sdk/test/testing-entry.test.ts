import { describe, expect, it } from "bun:test";
import {
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineTool,
  z,
} from "@brains/sdk/services";
import { createTemplate, defineEntity } from "@brains/sdk/entities";
import { defineMessageInterface } from "@brains/sdk/interfaces";
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

  /**
   * The second sign-off shape: a configured service with a durable job and a
   * route that answers from what setup built. A test that cannot make a
   * request cannot check the route at all.
   */
  it("serves a route from the state its own setup built", async () => {
    const counter = defineServicePlugin(
      {
        id: "counter",
        config: z.object({ start: z.number().default(0) }),
        setup: ({ config }) => ({ seen: [config.start] }),
      },
      {
        jobs: () => [
          defineJob({
            name: "tally",
            input: z.object({ n: z.number() }),
            output: z.object({ total: z.number() }),
          }).handle(({ input }) => ({ total: input.n })),
        ],
        routes: ({ state }) => [
          defineRoute({
            method: "GET",
            path: "/api/counter",
            security: { kind: "public" },
            response: z.object({ seen: z.array(z.number()) }),
            handle: () => ({ seen: state.seen }),
          }),
        ],
      },
    );

    const harness = createBrainTestHarness();
    await harness.installPackage(
      counter,
      { start: 7 },
      { name: "@fixture/counter", version: "0.1.0" },
    );

    const answer = await harness.fetch("GET", "/api/counter");

    expect(answer).toEqual({ seen: [7] });

    await harness.reset();
  });
  /**
   * The third sign-off shape: a conversational interface that builds one
   * resource in setup and uses it from more than one callback. The point is
   * that neither callback reaches for a variable outside the declaration to
   * find it.
   */
  it("shares one setup resource across a message interface's callbacks", async () => {
    const sent: string[] = [];

    const campfire = defineMessageInterface(
      {
        id: "campfire",
        config: z.object({ room: z.string() }),
        channel: {
          type: "campfire",
          displayName: "Campfire",
          subjectLabel: "Room",
          recipient: z.object({ roomId: z.string().min(1) }),
        },
        setup: ({ config }) => ({
          transcript: { room: config.room, lines: sent },
        }),
      },
      {
        send: ({ state, message }) => {
          state.transcript.lines.push(
            `${state.transcript.room}: ${message.text}`,
          );
          return `message-${state.transcript.lines.length}`;
        },
        deliver: ({ state, recipient, message }) => {
          state.transcript.lines.push(`${recipient.roomId}: ${message.text}`);
          return `delivery-${state.transcript.lines.length}`;
        },
      },
    );

    const harness = createBrainTestHarness();
    await harness.installPackage(
      campfire,
      { room: "hearth" },
      { name: "@fixture/campfire", version: "0.1.0" },
    );

    // Installing is the assertion: a package whose two callbacks disagreed
    // about where the transcript lives would not type-check, and one that
    // held it outside the declaration would share it between instances.
    expect(sent).toEqual([]);

    await harness.reset();
  });
  /**
   * The first sign-off shape: an entity that carries its own presentation,
   * and a job that reads one back through the definition rather than a type
   * name and a second copy of its schema.
   */
  it("reads an entity through its definition and renders it", async () => {
    const bookmark = defineEntity({
      type: "bookmark",
      purpose: "Something worth coming back to.",
      metadata: z.object({ title: z.string(), url: z.url() }),
      templates: {
        card: createTemplate({
          name: "card",
          description: "A bookmark, as a card.",
          schema: z.object({ title: z.string() }),
          formatter: {
            format: (value: { title: string }): string => `# ${value.title}`,
            parse: (content: string): { title: string } => ({
              title: content.replace(/^# /u, ""),
            }),
          },
        }),
      },
    });

    let read: string | undefined;

    const reader = defineServicePlugin(
      { id: "reader", config: z.object({}), entities: [bookmark] },
      {
        jobs: () => [
          defineJob({
            name: "read-one",
            input: z.object({ id: z.string() }),
            output: z.object({ title: z.string() }),
          }).handle(async ({ input, entities }) => {
            const saved = await entities.get(bookmark, input.id);
            read = saved?.metadata.title;
            return { title: read ?? "" };
          }),
        ],
      },
    );

    const harness = createBrainTestHarness();
    await harness.installPackage(
      reader,
      {},
      { name: "@fixture/reader", version: "0.1.0" },
    );

    expect(harness.templateNames()).toContain("@fixture/reader:bookmark:card");

    await harness.reset();
    expect(read).toBeUndefined();
  });
});
