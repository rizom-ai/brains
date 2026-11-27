import { describe, expect, it } from "bun:test";
import { countTokens } from "gpt-tokenizer/encoding/o200k_base";
import { callInputTokens, callOutputTokens } from "../src/reference-tokens";

const searchInput = { query: "compost" };
const searchTool = {
  type: "function",
  name: "system_search",
  description: "Search the brain's entities",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

describe("callInputTokens", () => {
  it("counts the instructions and each message's text", () => {
    expect(
      callInputTokens({
        instructions: "hello world",
        messages: [
          { role: "user", content: "hello world" },
          {
            role: "assistant",
            content: [{ type: "text", text: "hello world" }],
          },
        ],
        tools: undefined,
      }),
    ).toBe(6);
  });

  it("counts system messages given as instructions", () => {
    expect(
      callInputTokens({
        instructions: [{ role: "system", content: "hello world" }],
        messages: [],
        tools: undefined,
      }),
    ).toBe(2);
  });

  it("counts a tool call's name and arguments and a tool result's output", () => {
    expect(
      callInputTokens({
        instructions: undefined,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "system_search",
                input: searchInput,
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-1",
                toolName: "system_search",
                output: { type: "json", value: { hits: ["compost"] } },
              },
            ],
          },
        ],
        tools: undefined,
      }),
    ).toBe(
      2 * countTokens("system_search") +
        countTokens(JSON.stringify(searchInput)) +
        countTokens(JSON.stringify({ hits: ["compost"] })),
    );
  });

  it("counts each tool definition's name, description and input schema", () => {
    expect(
      callInputTokens({
        instructions: undefined,
        messages: [],
        tools: [searchTool],
      }),
    ).toBe(
      countTokens("system_search") +
        countTokens("Search the brain's entities") +
        countTokens(JSON.stringify(searchTool.inputSchema)),
    );
  });

  it("counts nothing for reasoning, images and files", () => {
    expect(
      callInputTokens({
        instructions: undefined,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: new Uint8Array([1, 2, 3]) },
              {
                type: "file",
                data: new Uint8Array([1, 2, 3]),
                mediaType: "application/pdf",
              },
            ],
          },
          {
            role: "assistant",
            content: [{ type: "reasoning", text: "hello world" }],
          },
        ],
        tools: undefined,
      }),
    ).toBe(0);
  });
});

describe("callOutputTokens", () => {
  it("counts a reply's text and tool calls, not its reasoning", () => {
    expect(
      callOutputTokens([
        { type: "reasoning", text: "a long chain of thought" },
        { type: "text", text: "hello world" },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "system_search",
          input: searchInput,
        },
      ]),
    ).toBe(
      2 +
        countTokens("system_search") +
        countTokens(JSON.stringify(searchInput)),
    );
  });

  it("counts tool-call arguments the model sent as a string once", () => {
    expect(
      callOutputTokens([
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "system_search",
          input: JSON.stringify(searchInput),
        },
      ]),
    ).toBe(
      countTokens("system_search") + countTokens(JSON.stringify(searchInput)),
    );
  });
});
