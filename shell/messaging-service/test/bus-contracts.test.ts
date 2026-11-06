import { describe, expect, it } from "bun:test";
import { defineBusContract, type BusContract } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { MessageBus } from "../src";
import {
  answerContract,
  collectContract,
  commandContract,
} from "../src/bus-contracts";

const questionSchema = z.strictObject({ topic: z.string() });
const itemSchema = z.strictObject({ source: z.string(), text: z.string() });

const gather: BusContract<typeof questionSchema, typeof itemSchema, "collect"> =
  defineBusContract({
    channel: "test:gather",
    request: questionSchema,
    response: itemSchema,
    delivery: "collect",
  });

function bus(): MessageBus {
  return MessageBus.createFresh(createSilentLogger("bus-contracts"));
}

describe("collect contracts", () => {
  it("gathers every owner's validated answer, in registration order", async () => {
    const messageBus = bus();
    const logger = createSilentLogger("owners");
    for (const source of ["memory", "playbooks"]) {
      answerContract(
        messageBus,
        gather,
        async ({ topic }) => ({ source, text: `${source} on ${topic}` }),
        { owner: source, logger },
      );
    }

    const result = await collectContract(
      messageBus,
      gather,
      { topic: "launch" },
      "shell",
    );

    expect(result).toEqual({
      status: "answered",
      answers: [
        { source: "memory", text: "memory on launch" },
        { source: "playbooks", text: "playbooks on launch" },
      ],
      failures: [],
    });
  });

  it("keeps the valid answers when one owner answers outside the contract", async () => {
    const messageBus = bus();
    const logger = createSilentLogger("owners");
    answerContract(
      messageBus,
      gather,
      async () => ({ source: "memory", text: "kept" }),
      { owner: "memory", logger },
    );
    answerContract(
      messageBus,
      gather,
      async () => JSON.parse('{"source":"broken"}'),
      { owner: "broken", logger },
    );

    const result = await collectContract(
      messageBus,
      gather,
      { topic: "launch" },
      "shell",
    );

    expect(result).toMatchObject({
      status: "answered",
      answers: [{ source: "memory", text: "kept" }],
    });
    expect(result.status === "answered" && result.failures).toHaveLength(1);
  });

  it("reports a contract no plugin answers as unavailable", async () => {
    expect(
      await collectContract(bus(), gather, { topic: "launch" }, "shell"),
    ).toEqual({ status: "unavailable" });
  });
});

const announceSchema = z.strictObject({ entityType: z.string() });

const announce: BusContract<typeof announceSchema, z.ZodVoid, "command"> =
  defineBusContract({
    channel: "test:announce",
    request: announceSchema,
    response: z.void(),
    delivery: "command",
  });

describe("command contracts", () => {
  it("reaches every owner, even when one of them fails", async () => {
    const messageBus = bus();
    const logger = createSilentLogger("owners");
    const heard: string[] = [];
    answerContract(
      messageBus,
      announce,
      async () => {
        throw new Error("newsletter is down");
      },
      { owner: "newsletter", logger },
    );
    answerContract(
      messageBus,
      announce,
      async ({ entityType }) => {
        heard.push(entityType);
      },
      { owner: "social-media", logger },
    );

    await commandContract(
      messageBus,
      announce,
      { entityType: "social-post" },
      "content-pipeline",
    );

    expect(heard).toEqual(["social-post"]);
  });

  it("tells each owner who sent the command", async () => {
    const messageBus = bus();
    const senders: string[] = [];
    answerContract(
      messageBus,
      announce,
      async (_command, { sender }) => {
        senders.push(sender);
      },
      { owner: "newsletter", logger: createSilentLogger("owners") },
    );

    await commandContract(
      messageBus,
      announce,
      { entityType: "post" },
      "content-pipeline",
    );

    expect(senders).toEqual(["content-pipeline"]);
  });

  it("refuses an invalid command before it is sent", async () => {
    expect(
      commandContract(bus(), announce, JSON.parse("{}"), "content-pipeline"),
    ).rejects.toThrow();
  });

  it("delivers to no one quietly", async () => {
    expect(
      await commandContract(
        bus(),
        announce,
        { entityType: "post" },
        "content-pipeline",
      ),
    ).toBeUndefined();
  });
});
