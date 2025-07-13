import { describe, expect, it, beforeEach } from "bun:test";
import { MessageInterfacePlugin } from "../src/base/message-interface-plugin";
import type { MessageContext } from "../src/base/types";
import type { JobProgressEvent } from "@brains/job-queue";
import type { JobContext } from "@brains/db";
import { z } from "zod";

// Test implementation
class TestMessageInterface extends MessageInterfacePlugin<object> {
  constructor() {
    super(
      "test-interface",
      { name: "test-interface", version: "1.0.0" },
      {},
      z.object({}),
      {},
    );
  }

  protected async handleProgressEvent(
    _progressEvent: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Test implementation
  }

  protected async sendMessage(
    _content: string,
    _context: MessageContext,
    _replyToId?: string,
  ): Promise<string> {
    return "test-message-id";
  }

  protected async editMessage(
    _messageId: string,
    _content: string,
    _context: MessageContext,
  ): Promise<void> {
    // Test implementation
  }

  public async start(): Promise<void> {
    // Test implementation
  }

  public async stop(): Promise<void> {
    // Test implementation
  }
}

describe("MessageInterfacePlugin", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
  });

  it("should create instance with session ID", () => {
    expect(plugin.sessionId).toMatch(/^test-interface-session-\d+$/);
  });

  it("should handle commands", async () => {
    const result = await plugin.executeCommand("/help", {
      userId: "test-user",
      channelId: "test-channel",
      messageId: "test-message",
      timestamp: new Date(),
      interfaceType: "test",
      userPermissionLevel: "public",
    });

    expect(result.message).toContain("Available commands:");
    expect(result.message).toContain("/help");
    expect(result.message).toContain("/search");
    expect(result.message).toContain("/list");
  });

  it("should handle unknown commands", async () => {
    const result = await plugin.executeCommand("/unknown", {
      userId: "test-user",
      channelId: "test-channel",
      messageId: "test-message",
      timestamp: new Date(),
      interfaceType: "test",
      userPermissionLevel: "public",
    });

    expect(result.message).toBe(
      "Unknown command: /unknown. Type /help for available commands.",
    );
  });
});
