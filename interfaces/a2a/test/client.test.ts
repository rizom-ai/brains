import { describe, it, expect } from "bun:test";
import {
  parseAgentCardResponse,
  parseA2AResponse,
  createA2ACallTool,
} from "../src/client";

describe("A2A Client", () => {
  describe("parseAgentCardResponse", () => {
    it("should parse a valid agent card", () => {
      const card = parseAgentCardResponse({
        name: "Rover",
        url: "https://yeehaa.io",
        skills: [],
      });

      expect(card).not.toBeNull();
      expect(card?.name).toBe("Rover");
      expect(card?.url).toBe("https://yeehaa.io");
    });

    it("should return null for missing url", () => {
      const card = parseAgentCardResponse({ name: "Rover" });
      expect(card).toBeNull();
    });

    it("should return null for missing name", () => {
      const card = parseAgentCardResponse({ url: "https://yeehaa.io" });
      expect(card).toBeNull();
    });

    it("should return null for non-object input", () => {
      expect(parseAgentCardResponse("not an object")).toBeNull();
      expect(parseAgentCardResponse(null)).toBeNull();
      expect(parseAgentCardResponse(42)).toBeNull();
    });
  });

  describe("parseA2AResponse", () => {
    it("should extract text from completed task", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          kind: "task",
          id: "task-1",
          contextId: "ctx-1",
          status: {
            state: "completed",
            message: {
              kind: "message",
              messageId: "msg-1",
              role: "agent",
              parts: [{ kind: "text", text: "Hello from remote agent" }],
            },
          },
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.state).toBe("completed");
      expect(result.data.response).toBe("Hello from remote agent");
    });

    it("should concatenate multiple text parts", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          kind: "task",
          status: {
            state: "completed",
            message: {
              parts: [
                { kind: "text", text: "Part one." },
                { kind: "text", text: "Part two." },
              ],
            },
          },
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.response).toBe("Part one.\nPart two.");
    });

    it("should handle failed task", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          kind: "task",
          status: {
            state: "failed",
            message: {
              parts: [{ kind: "text", text: "Something went wrong" }],
            },
          },
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.state).toBe("failed");
      expect(result.data.response).toBe("Something went wrong");
    });

    it("should return error for JSON-RPC error response", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "Method not found" },
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toContain("Method not found");
    });

    it("should handle missing status message gracefully", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          kind: "task",
          status: {
            state: "completed",
          },
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.state).toBe("completed");
      expect(result.data.response).toBe("No response text");
    });

    it("should skip non-text parts", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          kind: "task",
          status: {
            state: "completed",
            message: {
              parts: [
                { kind: "data", data: { foo: "bar" } },
                { kind: "text", text: "Actual text" },
              ],
            },
          },
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.response).toBe("Actual text");
    });

    it("should handle empty result", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.state).toBe("unknown");
      expect(result.data.response).toBe("No response text");
    });

    it("should handle message response (not task)", () => {
      const result = parseA2AResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          kind: "message",
          messageId: "msg-1",
          role: "agent",
          parts: [{ kind: "text", text: "Direct message reply" }],
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.response).toBe("Direct message reply");
    });
  });

  describe("createA2ACallTool outbound auth", () => {
    /** Mock fetch that serves an agent card then records the a2a call */
    function createMockFetch(capturedHeaders: Record<string, string>[]) {
      return async (
        url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const urlStr = typeof url === "string" ? url : url.toString();

        // Agent Card discovery
        if (urlStr.includes(".well-known/agent-card.json")) {
          return new Response(
            JSON.stringify({
              name: "Remote",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        // A2A endpoint — capture headers
        const headers: Record<string, string> = {};
        if (init?.headers) {
          const h = init.headers;
          if (h instanceof Headers) {
            h.forEach((v, k) => {
              headers[k] = v;
            });
          } else if (typeof h === "object") {
            Object.assign(headers, h);
          }
        }
        capturedHeaders.push(headers);

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              kind: "task",
              status: {
                state: "completed",
                message: {
                  parts: [{ kind: "text", text: "ok" }],
                },
              },
            },
          }),
          { status: 200 },
        );
      };
    }

    it("should send Authorization header when outbound token matches domain", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      const tool = createA2ACallTool({
        fetch: createMockFetch(capturedHeaders),
        outboundTokens: {
          "remote.example.com": "secret-token-xyz",
        },
      });

      await tool.handler(
        { agent: "https://remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(capturedHeaders).toHaveLength(1);
      const headers = capturedHeaders[0];
      expect(headers).toBeDefined();
      expect(headers?.["Authorization"]).toBe("Bearer secret-token-xyz");
    });

    it("should not send Authorization header when no token matches", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      const tool = createA2ACallTool({
        fetch: createMockFetch(capturedHeaders),
        outboundTokens: {
          "other-agent.com": "some-token",
        },
      });

      await tool.handler(
        { agent: "https://remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(capturedHeaders).toHaveLength(1);
      expect(capturedHeaders[0]?.["Authorization"]).toBeUndefined();
    });

    it("should not send Authorization header when no outbound tokens configured", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      const tool = createA2ACallTool({
        fetch: createMockFetch(capturedHeaders),
      });

      await tool.handler(
        { agent: "https://remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(capturedHeaders).toHaveLength(1);
      expect(capturedHeaders[0]?.["Authorization"]).toBeUndefined();
    });
  });
});
