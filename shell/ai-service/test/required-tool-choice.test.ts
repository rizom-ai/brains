import { describe, expect, it } from "bun:test";
import { generateText, jsonSchema, tool, type JSONSchema7 } from "ai";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";
import {
  createLocalRuntimeClient,
  localChatModel,
} from "../src/provider-clients";

/** A runtime that answers each chat request with the next message in turn. */
function runtime(messages: Record<string, unknown>[]): {
  fetch: typeof fetch;
  requests: Record<string, unknown>[];
} {
  const requests: Record<string, unknown>[] = [];
  const respond = async (
    _input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push(
      z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))),
    );
    const message = messages.shift();
    if (!message) throw new Error("No more responses");
    return Response.json({
      id: `chatcmpl-${requests.length}`,
      object: "chat.completion",
      created: 0,
      model: "qwen3:30b-a3b",
      choices: [
        {
          index: 0,
          message: { role: "assistant", ...message },
          finish_reason: "tool_calls" in message ? "tool_calls" : "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    });
  };
  const fetchImpl: typeof fetch = Object.assign(respond, {
    preconnect: globalThis.fetch.preconnect,
  });
  return { fetch: fetchImpl, requests };
}

const save = tool({
  description: "Save a note",
  inputSchema: jsonSchema({
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
    additionalProperties: false,
  }),
  execute: async () => "Saved.",
});

async function generate(
  fetchImpl: typeof fetch,
  toolChoice: "required" | "auto",
): Promise<{
  text: string;
  toolCalls: { toolName: string; input: unknown }[];
  inputTokens: number | undefined;
}> {
  const client = createLocalRuntimeClient("http://models:11434", fetchImpl);
  const result = await generateText({
    model: localChatModel(client, "qwen3:30b-a3b"),
    prompt: "Keep these files.",
    tools: { system_create: save },
    toolChoice,
  });
  return {
    text: result.text,
    toolCalls: result.toolCalls.map(({ toolName, input }) => ({
      toolName,
      input,
    })),
    inputTokens: result.usage.inputTokens,
  };
}

describe("a required tool call on the local runtime", () => {
  it("is asked for in the tools' schema, which the runtime enforces", async () => {
    const { fetch, requests } = runtime([
      { content: '{"tool":"system_create","input":{"title":"Harbor"}}' },
    ]);

    const result = await generate(fetch, "required");

    expect(result.toolCalls.map((call) => [call.toolName, call.input])).toEqual(
      [["system_create", { title: "Harbor" }]],
    );
    expect(result.inputTokens).toBe(100);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.["response_format"]).toEqual({
      type: "json_schema",
      json_schema: {
        name: "tool_call",
        schema: {
          anyOf: [
            {
              type: "object",
              properties: {
                tool: { const: "system_create" },
                input: {
                  type: "object",
                  properties: { title: { type: "string" } },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
              required: ["tool", "input"],
              additionalProperties: false,
            },
          ],
        },
        strict: true,
      },
    });
  });

  it("is kept as the runtime made it natively", async () => {
    const { fetch, requests } = runtime([
      {
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "system_create", arguments: '{"title":"Plan"}' },
          },
        ],
      },
    ]);

    const result = await generate(fetch, "required");

    expect(result.toolCalls.map((call) => call.input)).toEqual([
      { title: "Plan" },
    ]);
    expect(requests).toHaveLength(1);
  });

  it("is not asked for when no call is required", async () => {
    const { fetch, requests } = runtime([{ content: "Hello." }]);

    const result = await generate(fetch, "auto");

    expect(result.text).toBe("Hello.");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.["response_format"]).toBeUndefined();
  });

  it("is still missing when the schema answer is not a call", async () => {
    const { fetch } = runtime([{ content: "not json" }]);

    expect(generate(fetch, "required")).rejects.toThrow(
      "did not contain a tool call",
    );
  });
});

/** Every $ref in a schema, and whether each resolves from that schema's root. */
function unresolvedRefs(root: unknown): string[] {
  const refs: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") refs.push(value);
      else walk(value);
    }
  };
  walk(root);
  return refs.filter((ref) => {
    const found = ref
      .replace(/^#\//, "")
      .split("/")
      .reduce<unknown>(
        (node, key) => (isPlainRecord(node) ? node[key] : undefined),
        root,
      );
    return found === undefined;
  });
}

describe("a required call to a tool whose schema refers to its own definitions", () => {
  it("is asked for in a schema whose references all resolve", async () => {
    // A schema used twice is written once and referred to.
    const action: JSONSchema7 = { type: "string", enum: ["sync", "status"] };
    const manage = tool({
      description: "Manage sync",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          action: { $ref: "#/definitions/action" },
          then: { $ref: "#/definitions/action" },
        },
        required: ["action"],
        definitions: { action },
      }),
      execute: async () => "Done.",
    });
    const { fetch, requests } = runtime([
      { content: '{"tool":"directory_sync","input":{"action":"sync"}}' },
    ]);
    const client = createLocalRuntimeClient("http://models:11434", fetch);

    await generateText({
      model: localChatModel(client, "qwen3:30b-a3b"),
      prompt: "Sync.",
      tools: { system_create: save, directory_sync: manage },
      toolChoice: "required",
    });

    const format = z
      .object({ json_schema: z.object({ schema: z.unknown() }) })
      .parse(requests[0]?.["response_format"]);
    expect(unresolvedRefs(format.json_schema.schema)).toEqual([]);
    expect(JSON.stringify(format.json_schema.schema)).toContain('"$ref"');
  });
});
