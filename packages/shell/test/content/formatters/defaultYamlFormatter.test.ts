import { describe, expect, it } from "bun:test";
import { DefaultYamlFormatter } from "../../../src/content/formatters/defaultYamlFormatter";

describe("DefaultYamlFormatter", () => {
  const formatter = new DefaultYamlFormatter();

  describe("format", () => {
    it("should format simple object as YAML in code block", () => {
      const data = {
        name: "Test Item",
        value: 42,
        enabled: true,
      };

      const result = formatter.format(data);

      expect(result).toContain("# Content Data");
      expect(result).toContain("```yaml");
      expect(result).toContain("name: Test Item");
      expect(result).toContain("value: 42");
      expect(result).toContain("enabled: true");
      expect(result).toContain("```");
      expect(result).toContain("Edit the YAML above to modify the content.");
    });

    it("should format nested objects", () => {
      const data = {
        user: {
          name: "John Doe",
          age: 30,
          settings: {
            theme: "dark",
            notifications: true,
          },
        },
      };

      const result = formatter.format(data);

      expect(result).toContain("user:");
      expect(result).toContain("  name: John Doe");
      expect(result).toContain("  age: 30");
      expect(result).toContain("  settings:");
      expect(result).toContain("    theme: dark");
      expect(result).toContain("    notifications: true");
    });

    it("should format arrays", () => {
      const data = {
        items: ["apple", "banana", "cherry"],
        numbers: [1, 2, 3],
      };

      const result = formatter.format(data);

      expect(result).toContain("items:");
      expect(result).toContain("  - apple");
      expect(result).toContain("  - banana");
      expect(result).toContain("  - cherry");
      expect(result).toContain("numbers:");
      expect(result).toContain("  - 1");
      expect(result).toContain("  - 2");
      expect(result).toContain("  - 3");
    });

    it("should handle empty objects", () => {
      const data = {};

      const result = formatter.format(data);

      expect(result).toContain("```yaml");
      expect(result).toContain("{}\n```");
    });

    it("should preserve key order", () => {
      const data = {
        zebra: "last",
        alpha: "first",
        middle: "center",
      };

      const result = formatter.format(data);
      
      const yamlContent = result.match(/```yaml\n([\s\S]*?)\n```/)?.[1] || "";
      const lines = yamlContent.split("\n").filter(line => line.trim());
      
      expect(lines[0]).toContain("zebra");
      expect(lines[1]).toContain("alpha");
      expect(lines[2]).toContain("middle");
    });
  });

  describe("parse", () => {
    it("should parse YAML from code block", () => {
      const content = `# Content Data

\`\`\`yaml
name: Test Item
value: 42
enabled: true
\`\`\`

Edit the YAML above to modify the content.`;

      const result = formatter.parse(content);

      expect(result).toEqual({
        name: "Test Item",
        value: 42,
        enabled: true,
      });
    });

    it("should parse nested objects", () => {
      const content = `# Content Data

\`\`\`yaml
user:
  name: John Doe
  age: 30
  settings:
    theme: dark
    notifications: true
\`\`\`

Edit the YAML above to modify the content.`;

      const result = formatter.parse(content);

      expect(result).toEqual({
        user: {
          name: "John Doe",
          age: 30,
          settings: {
            theme: "dark",
            notifications: true,
          },
        },
      });
    });

    it("should parse arrays", () => {
      const content = `# Content Data

\`\`\`yaml
items:
  - apple
  - banana
  - cherry
numbers:
  - 1
  - 2
  - 3
\`\`\`

Edit the YAML above to modify the content.`;

      const result = formatter.parse(content);

      expect(result).toEqual({
        items: ["apple", "banana", "cherry"],
        numbers: [1, 2, 3],
      });
    });

    it("should parse empty object", () => {
      const content = `# Content Data

\`\`\`yaml
{}
\`\`\`

Edit the YAML above to modify the content.`;

      const result = formatter.parse(content);

      expect(result).toEqual({});
    });

    it("should throw error if no YAML code block found", () => {
      const content = "Just some text without YAML";

      expect(() => formatter.parse(content)).toThrow(
        "No YAML code block found in content"
      );
    });

    it("should throw error for invalid YAML", () => {
      const content = `# Content Data

\`\`\`yaml
invalid: yaml: content:
  - no proper structure
\`\`\`

Edit the YAML above to modify the content.`;

      expect(() => formatter.parse(content)).toThrow("Failed to parse YAML:");
    });

    it("should throw error if YAML is not an object", () => {
      const content = `# Content Data

\`\`\`yaml
- just
- an
- array
\`\`\`

Edit the YAML above to modify the content.`;

      expect(() => formatter.parse(content)).toThrow(
        "YAML content must be an object"
      );
    });

    it("should handle extra content around YAML block", () => {
      const content = `# Content Data

Some introduction text here.

\`\`\`yaml
key: value
\`\`\`

Edit the YAML above to modify the content.

Some additional notes here.`;

      const result = formatter.parse(content);

      expect(result).toEqual({
        key: "value",
      });
    });
  });

  describe("roundtrip", () => {
    it("should maintain data through format and parse", () => {
      const originalData = {
        name: "Test",
        count: 10,
        active: true,
        tags: ["tag1", "tag2"],
        metadata: {
          created: "2024-01-01",
          author: "Test User",
        },
      };

      const formatted = formatter.format(originalData);
      const parsed = formatter.parse(formatted);

      expect(parsed).toEqual(originalData);
    });

    it("should handle complex nested structures", () => {
      const originalData = {
        config: {
          database: {
            host: "localhost",
            port: 5432,
            credentials: {
              username: "admin",
              password: "secret",
            },
          },
          features: ["auth", "api", "ui"],
          settings: {
            debug: false,
            maxConnections: 100,
          },
        },
      };

      const formatted = formatter.format(originalData);
      const parsed = formatter.parse(formatted);

      expect(parsed).toEqual(originalData);
    });
  });
});