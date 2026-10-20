import { describe, it, expect } from "bun:test";
import {
  slugify,
  truncateSlug,
  generateIdFromText,
  pluralize,
  formatLabel,
  displayTitleFrom,
  formatByteSize,
  pluralizeLabel,
  toDisplayName,
  normalizeTag,
  normalizeTags,
} from "../src/string-utils";

describe("string-utils", () => {
  describe("slugify", () => {
    it("should convert to lowercase", () => {
      expect(slugify("Hello World")).toBe("hello-world");
      expect(slugify("UPPERCASE")).toBe("uppercase");
      expect(slugify("MiXeD CaSe")).toBe("mixed-case");
    });

    it("should replace spaces with hyphens", () => {
      expect(slugify("multiple   spaces")).toBe("multiple-spaces");
      expect(slugify("tabs\tand\tspaces")).toBe("tabs-and-spaces");
      expect(slugify("new\nlines")).toBe("new-lines");
    });

    it("should remove special characters", () => {
      expect(slugify("Hello! World?")).toBe("hello-world");
      expect(slugify("email@example.com")).toBe("emailexamplecom");
      expect(slugify("price: $99.99")).toBe("price-9999");
      expect(slugify("C++ Programming")).toBe("c-programming");
    });

    it("should handle multiple hyphens and underscores", () => {
      expect(slugify("hello---world")).toBe("hello-world");
      expect(slugify("hello___world")).toBe("hello-world");
      expect(slugify("hello-_-world")).toBe("hello-world");
    });

    it("should trim leading and trailing spaces/hyphens", () => {
      expect(slugify("  hello world  ")).toBe("hello-world");
      expect(slugify("---hello-world---")).toBe("hello-world");
      expect(slugify("-hello world-")).toBe("hello-world");
    });

    it("should handle edge cases", () => {
      expect(slugify("")).toBe("");
      expect(slugify("   ")).toBe("");
      expect(slugify("---")).toBe("");
      expect(slugify("!!!")).toBe("");
      expect(slugify("123")).toBe("123");
      expect(slugify("123-456")).toBe("123-456");
    });

    it("transliterates letters instead of dropping them", () => {
      expect(slugify("Café")).toBe("cafe");
      expect(slugify("naïve")).toBe("naive");
      expect(slugify("décadence")).toBe("decadence");
      expect(slugify("emoji 😀 test")).toBe("emoji-test");
    });

    it("keeps letters and digits from every script", () => {
      expect(slugify("創作者商業模式")).toBe("創作者商業模式");
      expect(slugify("AI知識管理系統")).toBe("ai知識管理系統");
      expect(slugify("AI 知識管理")).toBe("ai-知識管理");
      expect(slugify("Привет мир")).toBe("привет-мир");
      expect(slugify("2026年 計畫")).toBe("2026年-計畫");
    });

    it("keeps the marks that belong to a word outside Latin script", () => {
      expect(slugify("がっこう")).toBe("がっこう");
      expect(slugify("한국어 공부")).toBe("한국어-공부");
      expect(slugify("हिन्दी")).toBe("हिन्दी");
    });

    it("folds compatibility forms and drops stray emoji selectors", () => {
      expect(slugify("ＡＩ　ツール")).toBe("ai-ツール");
      expect(slugify("I ❤️ tea")).toBe("i-tea");
      expect(slugify("1️⃣ step")).toBe("1-step");
    });

    it("writes German umlauts and ß as German does without them", () => {
      expect(slugify("Übermensch")).toBe("uebermensch");
      expect(slugify("Glück")).toBe("glueck");
      expect(slugify("Modernität")).toBe("modernitaet");
      expect(slugify("Größe")).toBe("groesse");
    });

    it("should preserve word boundaries", () => {
      expect(slugify("camelCase")).toBe("camelcase");
      expect(slugify("snake_case")).toBe("snake-case");
      expect(slugify("kebab-case")).toBe("kebab-case");
    });
  });

  describe("truncateSlug", () => {
    it("cuts whole characters, never half of one", () => {
      expect(truncateSlug("𠀀𠀁𠀂", 2)).toBe("𠀀𠀁");
      expect(truncateSlug("創作者商業模式", 3)).toBe("創作者");
    });

    it("leaves no trailing hyphen", () => {
      expect(truncateSlug("hello-world", 6)).toBe("hello");
      expect(truncateSlug("short", 10)).toBe("short");
    });
  });

  describe("generateIdFromText", () => {
    it("should generate ID from text", () => {
      expect(generateIdFromText("Hello World")).toBe("hello-world");
      expect(generateIdFromText("Machine Learning Basics")).toBe(
        "machine-learning-basics",
      );
    });

    it("should append suffix when provided", () => {
      expect(generateIdFromText("Hello World", "123")).toBe("hello-world-123");
      expect(generateIdFromText("Test", "abc")).toBe("test-abc");
    });

    it("derives a stable id from text that has no slug", () => {
      const id1 = generateIdFromText("!!!");
      expect(id1).toMatch(/^id-[a-z0-9]+$/);
      expect(generateIdFromText("!!!")).toBe(id1);
      expect(generateIdFromText("???")).not.toBe(id1);

      const id2 = generateIdFromText("", "suffix");
      expect(id2).toMatch(/^id-[a-z0-9]+-suffix$/);
    });

    // Topic and skill ids are re-derived from their titles on every run; an
    // id that changes between runs replaces the entity each time.
    it("derives the same id from the same non-Latin title on every call", () => {
      expect(generateIdFromText("創作者商業模式")).toBe("創作者商業模式");
      expect(generateIdFromText("創作者商業模式")).toBe(
        generateIdFromText("創作者商業模式"),
      );
    });

    it("should handle special characters in text", () => {
      expect(generateIdFromText("AI & Machine Learning")).toBe(
        "ai-machine-learning",
      );
      expect(generateIdFromText("Q&A: Best Practices")).toBe(
        "qa-best-practices",
      );
      expect(generateIdFromText("C++ vs. Java")).toBe("c-vs-java");
    });

    it("should generate unique IDs for same text with different suffixes", () => {
      const id1 = generateIdFromText("Test Topic", "1");
      const id2 = generateIdFromText("Test Topic", "2");
      expect(id1).not.toBe(id2);
      expect(id1).toBe("test-topic-1");
      expect(id2).toBe("test-topic-2");
    });

    it("should handle very long text", () => {
      const longTitle = "This is a very long title ".repeat(10);
      const id = generateIdFromText(longTitle);
      expect(id).toMatch(/^this-is-a-very-long-title/);
      expect(id).not.toContain("  ");
      expect(id).not.toStartWith("-");
      expect(id).not.toEndWith("-");
    });
  });

  describe("pluralize", () => {
    it("should add -s to regular words", () => {
      expect(pluralize("post")).toBe("posts");
      expect(pluralize("link")).toBe("links");
      expect(pluralize("topic")).toBe("topics");
    });

    it("should change -y to -ies", () => {
      expect(pluralize("category")).toBe("categories");
      expect(pluralize("summary")).toBe("summaries");
    });

    it("should add -es to words ending in -s, -x, -ch", () => {
      expect(pluralize("box")).toBe("boxes");
      expect(pluralize("watch")).toBe("watches");
      expect(pluralize("bus")).toBe("buses");
    });

    it("should handle invariant words that stay the same", () => {
      expect(pluralize("series")).toBe("series");
      expect(pluralize("species")).toBe("species");
      expect(pluralize("sheep")).toBe("sheep");
      expect(pluralize("deer")).toBe("deer");
      expect(pluralize("fish")).toBe("fish");
    });

    it("should handle invariant words case-insensitively", () => {
      expect(pluralize("Series")).toBe("Series");
      expect(pluralize("SERIES")).toBe("SERIES");
    });
  });

  describe("toDisplayName", () => {
    it("should title-case and pluralize single words", () => {
      expect(toDisplayName("post")).toBe("Posts");
      expect(toDisplayName("link")).toBe("Links");
      expect(toDisplayName("deck")).toBe("Decks");
    });

    it("should handle hyphenated entity types", () => {
      expect(toDisplayName("social-post")).toBe("Social Posts");
      expect(toDisplayName("site-info")).toBe("Site Info");
      expect(toDisplayName("site-content")).toBe("Site Content");
      expect(toDisplayName("faq")).toBe("FAQs");
    });

    it("should handle invariant words", () => {
      expect(toDisplayName("series")).toBe("Series");
    });

    it("should only pluralize the last word", () => {
      expect(toDisplayName("anchor-profile")).toBe("Anchor Profiles");
      expect(toDisplayName("brain-character")).toBe("Brain Characters");
    });
  });

  describe("formatLabel", () => {
    it("title-cases identifiers", () => {
      expect(formatLabel("social-post")).toBe("Social Post");
      expect(formatLabel("publishedAt")).toBe("Published At");
      expect(formatLabel("series_name")).toBe("Series Name");
    });

    it("keeps acronyms and brand names in their usual form", () => {
      expect(formatLabel("faq")).toBe("FAQ");
      expect(formatLabel("ogImage")).toBe("OG Image");
      expect(formatLabel("canonicalUrl")).toBe("Canonical URL");
      expect(formatLabel("atprotoUri")).toBe("AT Protocol URI");
      expect(formatLabel("cta")).toBe("CTA");
      expect(formatLabel("conversation-memory-ai-response")).toBe(
        "Conversation Memory AI Response",
      );
      expect(formatLabel("social-media-linkedin")).toBe(
        "Social Media LinkedIn",
      );
    });
  });

  describe("displayTitleFrom", () => {
    it("prefers a title, then a name, then a question", () => {
      expect(displayTitleFrom({ title: "A post", name: "post" })).toBe(
        "A post",
      );
      expect(displayTitleFrom({ name: "Design resilient systems" })).toBe(
        "Design resilient systems",
      );
      expect(displayTitleFrom({ question: "Which posts are published?" })).toBe(
        "Which posts are published?",
      );
    });

    it("has no title when none of them is readable text", () => {
      expect(displayTitleFrom({ title: "  ", name: 3 })).toBeUndefined();
      expect(displayTitleFrom({})).toBeUndefined();
    });
  });

  describe("pluralizeLabel", () => {
    it("pluralizes a display label, keeping mass nouns and plurals", () => {
      expect(pluralizeLabel("Social Post")).toBe("Social Posts");
      expect(pluralizeLabel("FAQ")).toBe("FAQs");
      expect(pluralizeLabel("Ask Content")).toBe("Ask Content");
      expect(pluralizeLabel("Site Info")).toBe("Site Info");
      expect(pluralizeLabel("Series")).toBe("Series");
    });
  });

  describe("formatByteSize", () => {
    it("reads sizes in bytes, kilobytes and megabytes", () => {
      expect(formatByteSize(0)).toBe("0 bytes");
      expect(formatByteSize(1)).toBe("1 byte");
      expect(formatByteSize(999)).toBe("999 bytes");
      expect(formatByteSize(1_500)).toBe("1.5 KB");
      expect(formatByteSize(4_000_000)).toBe("4 MB");
      expect(formatByteSize(12_345_678)).toBe("12.3 MB");
    });
  });

  describe("normalizeTag", () => {
    it("should trim, lowercase, and hyphenate spaces and underscores", () => {
      expect(normalizeTag("  Academic Research  ")).toBe("academic-research");
      expect(normalizeTag("data_analysis")).toBe("data-analysis");
      expect(normalizeTag("Machine \t Learning")).toBe("machine-learning");
    });

    it("should keep other punctuation as written", () => {
      expect(normalizeTag("C++")).toBe("c++");
      expect(normalizeTag("ai/ml")).toBe("ai/ml");
    });
  });

  describe("normalizeTags", () => {
    it("should dedupe after normalizing, keeping first-seen order", () => {
      expect(
        normalizeTags([" Research ", "research", "RESEARCH", "data analysis"]),
      ).toEqual(["research", "data-analysis"]);
    });

    it("should drop tags that normalize to an empty string", () => {
      expect(normalizeTags(["", "   ", "design"])).toEqual(["design"]);
    });
  });
});
