import { describe, it, expect, mock, afterEach } from "bun:test";
import type {
  ServicePluginContext,
  ToolContext,
  PluginTool,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { createNewsletterTools } from "../src/tools";

// Save original fetch to restore after tests
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Mock logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => mockLogger,
} as unknown as Logger;

// Helper to create a mock fetch
function mockFetch(
  handler: (url: string, options: RequestInit) => Promise<Partial<Response>>,
): void {
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}

// Create minimal mock context
function createMockContext(): ServicePluginContext {
  return {
    logger: mockLogger,
    entityService: {
      getEntity: mock(() => Promise.resolve(null)),
      listEntities: mock(() => Promise.resolve([])),
      createEntity: mock(() =>
        Promise.resolve({ entityId: "test-id", jobId: "job-1" }),
      ),
      upsertEntity: mock(() =>
        Promise.resolve({ entityId: "test-id", jobId: "job-1", created: true }),
      ),
    },
    entities: {
      register: mock(() => {}),
      getAdapter: mock(() => null),
    },
    messaging: {
      send: mock(() => Promise.resolve()),
      subscribe: mock((): { unsubscribe: () => void } => ({
        unsubscribe: (): void => {},
      })),
    },
  } as unknown as ServicePluginContext;
}

// Create mock tool context
function createMockToolContext(): ToolContext {
  return {
    interfaceType: "test",
    userId: "test-user",
  };
}

// Helper to find tool or throw
function findTool(tools: PluginTool[], name: string): PluginTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

describe("Newsletter Tools", () => {
  describe("newsletter_subscribe", () => {
    it("should subscribe email via Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "sub-123",
              email: "test@example.com",
              subscriber_type: "unactivated",
            }),
        }),
      );

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const subscribeTool = findTool(tools, "newsletter_subscribe");

      const result = await subscribeTool.handler(
        { email: "test@example.com" },
        toolContext,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("subscriberId", "sub-123");
      }
    });

    it("should include name when provided", async () => {
      let capturedBody: string | undefined;
      mockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "sub-123",
              email: "test@example.com",
            }),
        });
      });

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const subscribeTool = findTool(tools, "newsletter_subscribe");
      await subscribeTool.handler(
        {
          email: "test@example.com",
          name: "Test User",
        },
        toolContext,
      );

      expect(capturedBody).toContain("Test User");
    });

    it("should handle API errors gracefully", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ detail: "Invalid email" }),
        }),
      );

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const subscribeTool = findTool(tools, "newsletter_subscribe");
      const result = await subscribeTool.handler(
        { email: "invalid" },
        toolContext,
      );

      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("Invalid email");
    });
  });

  describe("newsletter_unsubscribe", () => {
    it("should unsubscribe email via Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const unsubscribeTool = findTool(tools, "newsletter_unsubscribe");

      const result = await unsubscribeTool.handler(
        { email: "test@example.com" },
        toolContext,
      );
      expect(result.success).toBe(true);
    });
  });

  describe("newsletter_list_subscribers", () => {
    it("should list subscribers from Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: "sub-1",
                  email: "a@test.com",
                  subscriber_type: "regular",
                },
                {
                  id: "sub-2",
                  email: "b@test.com",
                  subscriber_type: "regular",
                },
              ],
              count: 2,
            }),
        }),
      );

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const listTool = findTool(tools, "newsletter_list_subscribers");

      const result = await listTool.handler({}, toolContext);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("subscribers");
        expect(result.data).toHaveProperty("count", 2);
      }
    });
  });

  describe("newsletter_send", () => {
    it("should send newsletter via Buttondown API", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "email-123",
              subject: "Test Newsletter",
              status: "sent",
            }),
        }),
      );

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const sendTool = findTool(tools, "newsletter_send");

      const result = await sendTool.handler(
        {
          subject: "Test Newsletter",
          body: "Hello subscribers!",
          immediate: true,
        },
        toolContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("emailId", "email-123");
      }
    });

    it("should create draft when immediate is false", async () => {
      let capturedBody: string | undefined;
      mockFetch((_url, options) => {
        capturedBody = options.body as string;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "email-123",
              subject: "Test Newsletter",
              status: "draft",
            }),
        });
      });

      const context = createMockContext();
      const toolContext = createMockToolContext();
      const tools = createNewsletterTools("newsletter", context, {
        apiKey: "test-key",
        doubleOptIn: true,
      });

      const sendTool = findTool(tools, "newsletter_send");
      await sendTool.handler(
        {
          subject: "Test Newsletter",
          body: "Hello!",
          immediate: false,
        },
        toolContext,
      );

      expect(capturedBody).toContain('"status":"draft"');
    });
  });

  describe("without buttondown config", () => {
    it("should return empty tools array when no config provided", () => {
      const context = createMockContext();
      const tools = createNewsletterTools("newsletter", context, undefined);

      expect(tools).toHaveLength(0);
    });
  });
});
