import { describe, it, expect } from "bun:test";
import { TestDataGenerator } from "../src/test-data";

describe("TestDataGenerator", () => {
  it("should generate note with defaults", () => {
    const note = TestDataGenerator.note();

    expect(note.title).toBe("Test Note");
    expect(note.content).toBe("This is test content");
    expect(note.tags).toEqual([]);
  });

  it("should generate note with custom values", () => {
    const custom = TestDataGenerator.note({
      title: "Custom Title",
      content: "Custom content",
      tags: ["test", "custom"],
    });

    expect(custom.title).toBe("Custom Title");
    expect(custom.content).toBe("Custom content");
    expect(custom.tags).toEqual(["test", "custom"]);
  });

  it("should generate multiple notes", () => {
    const notes = TestDataGenerator.notes(3);

    expect(notes).toHaveLength(3);
    expect(notes[0]?.title).toBe("Test Note 1");
    expect(notes[1]?.title).toBe("Test Note 2");
    expect(notes[2]?.title).toBe("Test Note 3");
  });

  it("should generate multiple notes with custom base", () => {
    const notes = TestDataGenerator.notes(2, { tags: ["shared"] });

    expect(notes).toHaveLength(2);
    expect(notes[0]?.tags).toEqual(["shared"]);
    expect(notes[1]?.tags).toEqual(["shared"]);
  });

  it("should generate article with markdown", () => {
    const article = TestDataGenerator.article({
      title: "Test Article",
      sections: ["Introduction", "Main Content", "Conclusion"],
    });

    expect(article.title).toBe("Test Article");
    expect(article.content ?? "").toContain("# Test Article");
    expect(article.content ?? "").toContain("## Introduction");
    expect(article.content ?? "").toContain("## Main Content");
    expect(article.content ?? "").toContain("## Conclusion");
  });

  it("should generate markdown content", () => {
    const markdown = TestDataGenerator.markdown({
      headers: ["Header 1", "Header 2"],
      paragraphs: 2,
      lists: true,
      code: true,
    });

    expect(markdown).toContain("# Header 1");
    expect(markdown).toContain("# Header 2");
    expect(markdown).toContain("Lorem ipsum");
    expect(markdown).toContain("- Item");
    expect(markdown).toContain("```");
  });

  it("should generate tags", () => {
    const tags = TestDataGenerator.tags(5);

    expect(tags).toHaveLength(5);
    tags.forEach((tag) => {
      expect(tag).toMatch(/^tag-\d+$/);
    });
  });

  it("should generate entity with id", () => {
    const entity = TestDataGenerator.entity({
      entityType: "note",
      title: "Test Entity",
    });

    expect(entity.id).toBeDefined();
    expect(entity.id).toMatch(/^test-\d+-[a-f0-9]+$/);
    expect(entity.entityType).toBe("note");
    expect(entity.title).toBe("Test Entity");
    expect(typeof entity.created).toBe("string");
    expect(typeof entity.updated).toBe("string");
  });

  it("should generate entity batch", () => {
    const entities = TestDataGenerator.entityBatch("article", 3, {
      tags: ["batch"],
    });

    expect(entities).toHaveLength(3);
    entities.forEach((entity, index) => {
      expect(entity.entityType).toBe("article");
      expect(entity.title).toBe(`Article ${index + 1}`);
      expect(entity.tags).toEqual(["batch"]);
    });
  });

  it("should generate random content", () => {
    const content1 = TestDataGenerator.randomContent(100);
    const content2 = TestDataGenerator.randomContent(100);

    expect(content1).toHaveLength(100);
    expect(content2).toHaveLength(100);
    // Content should be different (though there's a tiny chance they could be the same)
    expect(content1).not.toBe(content2);
  });

  it("should generate date range", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    const dateStr = TestDataGenerator.randomDate(start, end);
    const date = new Date(dateStr);

    expect(date.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(date.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});
