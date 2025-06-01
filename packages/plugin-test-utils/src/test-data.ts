import type { BaseEntity } from "@brains/types";
import { randomBytes } from "crypto";

/**
 * Generate test entity data
 */
export class TestDataGenerator {
  private static counter = 0;

  /**
   * Generate a unique ID
   */
  static id(prefix = "test"): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  }

  /**
   * Generate a unique counter
   */
  static count(): number {
    return ++this.counter;
  }

  /**
   * Generate test note data
   */
  static note(overrides: Partial<BaseEntity> = {}): Partial<BaseEntity> {
    // If no title override, don't include counter for default
    const defaultTitle = overrides.title ?? "Test Note";
    const now = new Date().toISOString();
    return {
      title: defaultTitle,
      content: "This is test content",
      tags: [],
      created: now,
      updated: now,
      ...overrides,
    };
  }

  /**
   * Generate multiple test notes
   */
  static notes(
    count: number,
    overrides: Partial<BaseEntity> = {},
  ): Array<Partial<BaseEntity>> {
    return Array.from({ length: count }, (_, i) =>
      this.note({
        ...overrides,
        title: overrides.title ?? `Test Note ${i + 1}`,
      }),
    );
  }

  /**
   * Generate test article data
   */
  static article(options: {
    title: string;
    sections: string[];
  }): Partial<BaseEntity> {
    const content = [
      `# ${options.title}`,
      "",
      ...options.sections.map(
        (section) => `## ${section}\n\nContent for ${section}.\n`,
      ),
    ].join("\n");

    return {
      title: options.title,
      content,
      tags: ["article"],
    };
  }

  /**
   * Generate markdown content
   */
  static markdown(
    options: {
      headers?: string[];
      paragraphs?: number;
      lists?: boolean;
      code?: boolean;
    } = {},
  ): string {
    const parts: string[] = [];

    // Add custom headers first
    if (options.headers) {
      options.headers.forEach((header) => {
        parts.push(`# ${header}`);
        parts.push("");
      });
    }

    // Add paragraphs
    const paragraphCount = options.paragraphs ?? 1;
    for (let i = 1; i <= paragraphCount; i++) {
      parts.push(`Lorem ipsum dolor sit amet, consectetur adipiscing elit.`);
      parts.push("");
    }

    // Add lists
    if (options.lists) {
      parts.push("- Item 1");
      parts.push("- Item 2");
      parts.push("- Item 3");
      parts.push("");
    }

    // Add code
    if (options.code) {
      parts.push("```typescript");
      parts.push("const example = 'test';");
      parts.push("console.log(example);");
      parts.push("```");
      parts.push("");
    }

    return parts.join("\n").trim();
  }

  /**
   * Generate test tags
   */
  static tags(count = 3): string[] {
    return Array.from({ length: count }, (_, i) => `tag-${i + 1}`);
  }

  /**
   * Generate entity with full BaseEntity fields
   */
  static entity(overrides: Partial<BaseEntity> = {}): BaseEntity {
    const now = new Date().toISOString();
    return {
      id: this.id(),
      entityType: "base",
      created: now,
      updated: now,
      title: "Test Entity",
      content: "Test content",
      tags: [],
      ...overrides,
    };
  }

  /**
   * Generate entity batch
   */
  static entityBatch(
    entityType: string,
    count: number,
    baseOverrides: Partial<BaseEntity> = {},
  ): BaseEntity[] {
    return Array.from({ length: count }, (_, i) =>
      this.entity({
        ...baseOverrides,
        entityType,
        title:
          baseOverrides.title ??
          `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${i + 1}`,
      }),
    );
  }

  /**
   * Generate random content
   */
  static randomContent(length: number): string {
    const words = [
      "lorem",
      "ipsum",
      "dolor",
      "sit",
      "amet",
      "consectetur",
      "adipiscing",
      "elit",
    ];
    const result: string[] = [];

    while (result.join(" ").length < length) {
      result.push(words[Math.floor(Math.random() * words.length)] ?? "lorem");
    }

    return result.join(" ").substring(0, length);
  }

  /**
   * Generate random date in range
   */
  static randomDate(start: Date, end: Date): string {
    const startTime = start.getTime();
    const endTime = end.getTime();
    const randomTime = startTime + Math.random() * (endTime - startTime);
    return new Date(randomTime).toISOString();
  }

  /**
   * Generate a date in the past
   */
  static pastDate(daysAgo = 7): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  }

  /**
   * Generate a date in the future
   */
  static futureDate(daysAhead = 7): string {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    return date.toISOString();
  }

  /**
   * Reset the counter
   */
  static reset(): void {
    this.counter = 0;
  }
}
