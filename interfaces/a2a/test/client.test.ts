import { describe, it, expect } from "bun:test";
import { parseA2AResponse, createA2ACallTool } from "../src/client";
import { parseAgentCard } from "@brains/plugins";

function createSavedAgentEntityService(agentId = "remote.example.com"): {
  getEntity: (request: { entityType: string; id: string }) => Promise<{
    id: string;
    content: string;
    metadata: Record<string, unknown>;
  } | null>;
} {
  return {
    getEntity: async (request: {
      entityType: string;
      id: string;
    }): Promise<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
    } | null> => {
      if (request.entityType !== "agent" || request.id !== agentId) return null;
      return {
        id: agentId,
        content: `---\nname: Remote\nurl: 'https://${agentId}/a2a'\nstatus: approved\n---`,
        metadata: {
          name: "Remote",
          url: `https://${agentId}/a2a`,
          status: "approved",
        },
      };
    },
  };
}

describe("A2A Client", () => {
  describe("parseAgentCard", () => {
    it("should parse a valid agent card", () => {
      const card = parseAgentCard({
        name: "Rover",
        url: "https://yeehaa.io",
        skills: [],
      });

      expect(card).not.toBeNull();
      expect(card?.brainName).toBe("Rover");
      expect(card?.url).toBe("https://yeehaa.io");
    });

    it("should return null for missing url", () => {
      const card = parseAgentCard({ name: "Rover" });
      expect(card).toBeNull();
    });

    it("should return null for missing name", () => {
      const card = parseAgentCard({ url: "https://yeehaa.io" });
      expect(card).toBeNull();
    });

    it("should return null for non-object input", () => {
      expect(parseAgentCard("not an object")).toBeNull();
      expect(parseAgentCard(null)).toBeNull();
      expect(parseAgentCard(42)).toBeNull();
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
        entityService: createSavedAgentEntityService(),
      });

      await tool.handler(
        { agent: "remote.example.com", message: "hello" },
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
        entityService: createSavedAgentEntityService(),
      });

      await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(capturedHeaders).toHaveLength(1);
      expect(capturedHeaders[0]?.["Authorization"]).toBeUndefined();
    });

    it("should not send Authorization header when no outbound tokens configured", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      const tool = createA2ACallTool({
        fetch: createMockFetch(capturedHeaders),
        entityService: createSavedAgentEntityService(),
      });

      await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(capturedHeaders).toHaveLength(1);
      expect(capturedHeaders[0]?.["Authorization"]).toBeUndefined();
    });
  });

  describe("SSE streaming via message/stream", () => {
    /** Build an SSE response body from status-update events */
    function sseBody(
      events: Array<{ state: string; final: boolean; text?: string }>,
    ): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller): void {
          for (const event of events) {
            const data = {
              jsonrpc: "2.0",
              id: "req-1",
              result: {
                kind: "status-update",
                taskId: "task-123",
                status: {
                  state: event.state,
                  ...(event.text && {
                    message: {
                      parts: [{ kind: "text", text: event.text }],
                    },
                  }),
                },
                final: event.final,
              },
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          }
          controller.close();
        },
      });
    }

    function createStreamFetch(
      events: Array<{ state: string; final: boolean; text?: string }>,
    ): (url: string | URL | Request, init?: RequestInit) => Promise<Response> {
      return async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        // Agent card discovery
        if (!init?.method || init.method === "GET") {
          return new Response(
            JSON.stringify({
              name: "Test Agent",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        // message/stream — return SSE
        return new Response(sseBody(events), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      };
    }

    it("should read SSE stream and return completed result", async () => {
      const tool = createA2ACallTool({
        fetch: createStreamFetch([
          { state: "working", final: false },
          { state: "completed", final: true, text: "Final answer" },
        ]),
        entityService: createSavedAgentEntityService(),
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data.state", "completed");
      expect(result).toHaveProperty("data.response", "Final answer");
    });

    it("should handle failed task via SSE stream", async () => {
      const tool = createA2ACallTool({
        fetch: createStreamFetch([
          { state: "working", final: false },
          { state: "failed", final: true, text: "Error: Agent crashed" },
        ]),
        entityService: createSavedAgentEntityService(),
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data.state", "failed");
    });

    it("should handle stream that closes without final event", async () => {
      const tool = createA2ACallTool({
        fetch: createStreamFetch([
          { state: "working", final: false },
          // stream closes without final: true
        ]),
        entityService: createSavedAgentEntityService(),
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(result).toHaveProperty("success", false);
    });

    it("should timeout and retry when the POST never returns", async () => {
      let postAttempts = 0;
      const fetchFn = async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        if (!init?.method || init.method === "GET") {
          return new Response(
            JSON.stringify({
              name: "Test Agent",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        postAttempts++;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      };

      const tool = createA2ACallTool({
        fetch: fetchFn,
        entityService: createSavedAgentEntityService(),
        requestTimeoutMs: 5,
        maxNetworkAttempts: 2,
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(postAttempts).toBe(2);
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty(
        "error",
        "Failed to reach remote agent after 2 attempts: request timed out after 5ms",
      );
    });

    it("should timeout and retry when the SSE stream stalls", async () => {
      const encoder = new TextEncoder();
      const createStalledStream = (): ReadableStream<Uint8Array> =>
        new ReadableStream<Uint8Array>({
          start(controller): void {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  result: {
                    status: { state: "working" },
                    final: false,
                  },
                })}\n\n`,
              ),
            );
          },
        });

      let postAttempts = 0;
      const fetchFn = async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        if (!init?.method || init.method === "GET") {
          return new Response(
            JSON.stringify({
              name: "Test Agent",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        postAttempts++;
        return new Response(createStalledStream(), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      };

      const tool = createA2ACallTool({
        fetch: fetchFn,
        entityService: createSavedAgentEntityService(),
        streamIdleTimeoutMs: 5,
        maxNetworkAttempts: 2,
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(postAttempts).toBe(2);
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty(
        "error",
        "A2A stream stalled waiting for final event after 5ms after 2 attempts",
      );
    });

    it("should retry once on transient network failure", async () => {
      let postAttempts = 0;
      const fetchFn = async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        if (!init?.method || init.method === "GET") {
          return new Response(
            JSON.stringify({
              name: "Test Agent",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        postAttempts++;
        if (postAttempts === 1) {
          throw new Error("fetch failed");
        }

        return new Response(
          sseBody([{ state: "completed", final: true, text: "retry ok" }]),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          },
        );
      };

      const tool = createA2ACallTool({
        fetch: fetchFn,
        entityService: createSavedAgentEntityService(),
        maxNetworkAttempts: 2,
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(postAttempts).toBe(2);
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data.response", "retry ok");
    });

    it("should complete a slow stream under the idle timeout", async () => {
      const encoder = new TextEncoder();
      const slowStream = new ReadableStream<Uint8Array>({
        start(controller): void {
          setTimeout(() => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  result: {
                    status: {
                      state: "completed",
                      message: {
                        parts: [{ kind: "text", text: "slow ok" }],
                      },
                    },
                    final: true,
                  },
                })}\n\n`,
              ),
            );
            controller.close();
          }, 5);
        },
      });

      const fetchFn = async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        if (!init?.method || init.method === "GET") {
          return new Response(
            JSON.stringify({
              name: "Test Agent",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        return new Response(slowStream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      };

      const tool = createA2ACallTool({
        fetch: fetchFn,
        entityService: createSavedAgentEntityService(),
        streamIdleTimeoutMs: 50,
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data.response", "slow ok");
    });

    it("should not retry client HTTP errors", async () => {
      let postAttempts = 0;
      const fetchFn = async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        if (!init?.method || init.method === "GET") {
          return new Response(
            JSON.stringify({
              name: "Test Agent",
              url: "https://remote.example.com/a2a",
            }),
            { status: 200 },
          );
        }

        postAttempts++;
        return new Response("Forbidden", { status: 403 });
      };

      const tool = createA2ACallTool({
        fetch: fetchFn,
        entityService: createSavedAgentEntityService(),
        maxNetworkAttempts: 2,
      });

      const result = await tool.handler(
        { agent: "remote.example.com", message: "hello" },
        { interfaceType: "test", userId: "test" },
      );

      expect(postAttempts).toBe(1);
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error", "Remote agent returned HTTP 403");
    });
  });
});
