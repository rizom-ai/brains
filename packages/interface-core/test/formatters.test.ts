import { describe, it, expect, beforeEach } from "bun:test";
import { 
  MarkdownFormatter, 
  ResponseFormatter 
} from "../src/formatters/index";
import type { MessageContext } from "../src/types";

describe("MarkdownFormatter", () => {
  let formatter: MarkdownFormatter;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });

  describe("format", () => {
    it("should format markdown text", async () => {
      const input = "# Hello\n\nThis is a **test**";
      const result = await formatter.format(input);
      expect(result).toContain("# Hello");
      expect(result).toContain("This is a **test**");
    });

    it("should preserve frontmatter when option is set", async () => {
      const formatterWithFrontmatter = new MarkdownFormatter({ preserveFrontmatter: true });
      const input = "---\ntitle: Test\n---\n# Hello";
      const result = await formatterWithFrontmatter.format(input);
      expect(result).toContain("---");
      expect(result).toContain("title: Test");
    });
  });

  describe("extractText", () => {
    it("should extract plain text from markdown", async () => {
      const input = "# Hello World\n\nThis is **bold** and _italic_ text.";
      const result = await formatter.extractText(input);
      expect(result).toContain("Hello World");
      expect(result).toContain("This is");
      expect(result).toContain("bold");
      expect(result).toContain("italic");
      expect(result).toContain("text.");
    });

    it("should ignore code blocks when extracting text", async () => {
      const input = "Some text\n```\ncode block\n```\nMore text";
      const result = await formatter.extractText(input);
      expect(result).toBe("Some text More text");
    });
  });

  describe("extractCodeBlocks", () => {
    it("should extract code blocks with language", async () => {
      const input = "Text\n```javascript\nconsole.log('hello');\n```\nMore text";
      const result = await formatter.extractCodeBlocks(input);
      expect(result).toHaveLength(1);
      expect(result[0]?.lang).toBe("javascript");
      expect(result[0]?.value).toBe("console.log('hello');");
    });

    it("should extract code blocks without language", async () => {
      const input = "Text\n```\nsome code\n```";
      const result = await formatter.extractCodeBlocks(input);
      expect(result).toHaveLength(1);
      expect(result[0]?.lang).toBeNull();
      expect(result[0]?.value).toBe("some code");
    });

    it("should extract multiple code blocks", async () => {
      const input = "```js\ncode1\n```\n\n```python\ncode2\n```";
      const result = await formatter.extractCodeBlocks(input);
      expect(result).toHaveLength(2);
      expect(result[0]?.lang).toBe("js");
      expect(result[1]?.lang).toBe("python");
    });
  });
});

describe("ResponseFormatter", () => {
  let formatter: ResponseFormatter;

  beforeEach(() => {
    formatter = new ResponseFormatter();
  });

  describe("formatResponse", () => {
    it("should format basic response", () => {
      const result = formatter.formatResponse("Hello, world!");
      expect(result).toBe("Hello, world!");
    });

    it("should truncate long responses when maxLength is set", () => {
      const longFormatter = new ResponseFormatter({ maxLength: 10 });
      const result = longFormatter.formatResponse("This is a very long message");
      expect(result).toBe("This is...");
    });

    it("should add timestamp when option is set", () => {
      const timestampFormatter = new ResponseFormatter({ showTimestamp: true });
      const context: MessageContext = {
        userId: "user123",
        channelId: "channel123",
        messageId: "msg123",
        timestamp: new Date("2024-01-01T12:00:00Z"),
      };
      const result = timestampFormatter.formatResponse("Message", context);
      expect(result).toContain("[2024-01-01T12:00:00.000Z]");
      expect(result).toContain("Message");
    });

    it("should add userId when option is set", () => {
      const userFormatter = new ResponseFormatter({ showUserId: true });
      const context: MessageContext = {
        userId: "user123",
        channelId: "channel123",
        messageId: "msg123",
        timestamp: new Date(),
      };
      const result = userFormatter.formatResponse("Message", context);
      expect(result).toContain("@user123");
    });

    it("should add channel when option is set", () => {
      const channelFormatter = new ResponseFormatter({ showChannel: true });
      const context: MessageContext = {
        userId: "user123",
        channelId: "general",
        messageId: "msg123",
        timestamp: new Date(),
      };
      const result = channelFormatter.formatResponse("Message", context);
      expect(result).toContain("#general");
    });
  });

  describe("formatError", () => {
    it("should format error from Error object", () => {
      const error = new Error("Something went wrong");
      const result = formatter.formatError(error);
      expect(result).toBe("❌ Error: Something went wrong");
    });

    it("should format error from string", () => {
      const result = formatter.formatError("Custom error message");
      expect(result).toBe("❌ Error: Custom error message");
    });
  });

  describe("formatSuccess", () => {
    it("should format success message", () => {
      const result = formatter.formatSuccess("Operation completed");
      expect(result).toBe("✅ Operation completed");
    });
  });

  describe("formatWarning", () => {
    it("should format warning message", () => {
      const result = formatter.formatWarning("Be careful");
      expect(result).toBe("⚠️  Be careful");
    });
  });

  describe("formatInfo", () => {
    it("should format info message", () => {
      const result = formatter.formatInfo("For your information");
      expect(result).toBe("ℹ️  For your information");
    });
  });
});