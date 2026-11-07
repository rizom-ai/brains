import { describe, expect, it } from "bun:test";
import {
  SdkError,
  defineBusContract,
  type BusContract,
} from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { MessageBus } from "../src";
import {
  answerContract,
  collectContract,
  commandContract,
  requestContract,
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

const measureSchema = z.strictObject({ text: z.string() });
const lengthSchema = z.strictObject({ length: z.number() });
const measure: BusContract<
  typeof measureSchema,
  typeof lengthSchema,
  "request"
> = defineBusContract({
  channel: "test:measure",
  request: measureSchema,
  response: lengthSchema,
  delivery: "request",
});

const SECRET = "the private body of tide-1";

describe("a request's failure reaches the asker in its public form", () => {
  async function answeredBy(
    handler: () => Promise<{ length: number }>,
  ): Promise<{ result: unknown; logged: unknown[]; warned: unknown[] }> {
    const messageBus = bus();
    const logged: unknown[] = [];
    const warned: unknown[] = [];
    const logger = createSilentLogger("owner");
    logger.error = (...args: unknown[]): void => {
      logged.push(args);
    };
    logger.warn = (...args: unknown[]): void => {
      warned.push(args);
    };
    answerContract(messageBus, measure, handler, { owner: "owner", logger });
    const result = await requestContract(
      messageBus,
      measure,
      { text: "four" },
      "caller",
    );
    return { result, logged, warned };
  }

  it("keeps a thrown SdkError's code and public message, its diagnostic a warning in the owner's log", async () => {
    const { result, logged, warned } = await answeredBy(async () => {
      throw new SdkError("not_found", {
        message: SECRET,
        publicMessage: "No such text",
      });
    });
    expect(result).toEqual({
      status: "failed",
      error: { code: "not_found", message: "No such text" },
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(warned)).toContain(SECRET);
    expect(logged).toEqual([]);
  });

  it("passes on a plain error as a failed handler, logging its diagnostic with the owner", async () => {
    const { result, logged } = await answeredBy(async () => {
      throw new Error(SECRET);
    });
    expect(result).toEqual({
      status: "failed",
      error: { code: "handler_failed", message: "The operation failed" },
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(logged)).toContain(SECRET);
  });

  it("reports an answer outside the contract as an invalid response", async () => {
    const { result } = await answeredBy(async () =>
      JSON.parse(`{"length":"${SECRET}"}`),
    );
    expect(result).toEqual({
      status: "failed",
      error: { code: "invalid_response", message: "Invalid response" },
    });
  });

  it("does not trust a subscriber's own failure text", async () => {
    const messageBus = bus();
    messageBus.subscribe(measure.name, async () => ({
      success: false,
      error: SECRET,
    }));
    const result = await requestContract(
      messageBus,
      measure,
      { text: "four" },
      "caller",
    );
    expect(result).toEqual({
      status: "failed",
      error: { code: "handler_failed", message: "The operation failed" },
    });
  });

  it("collects each owner's failure in its public form", async () => {
    const messageBus = bus();
    const logger = createSilentLogger("owners");
    answerContract(
      messageBus,
      gather,
      async () => {
        throw new SdkError("conflict", { publicMessage: "Busy" });
      },
      { owner: "busy", logger },
    );
    answerContract(
      messageBus,
      gather,
      async () => ({ source: "memory", text: "kept" }),
      { owner: "memory", logger },
    );
    expect(
      await collectContract(messageBus, gather, { topic: "launch" }, "shell"),
    ).toEqual({
      status: "answered",
      answers: [{ source: "memory", text: "kept" }],
      failures: [{ code: "conflict", message: "Busy" }],
    });
  });
});
