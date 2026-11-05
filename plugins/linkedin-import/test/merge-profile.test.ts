import { describe, expect, it } from "bun:test";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { mergeProfileImport } from "../src/lib/merge-profile";

const imported = {
  name: "Ada Morgan",
  headline: "Advisor on resilient software",
  industry: "Climate Technology",
  location: "Rotterdam, Netherlands",
  website: "https://ada.example.com",
  story: "I build resilient software.",
};

function parse(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const parsed = parseMarkdownWithFrontmatter(
    content,
    z.record(z.string(), z.unknown()),
  );
  return { metadata: parsed.metadata, body: parsed.content.trim() };
}

function outcomes(content: string): Record<string, string> {
  return Object.fromEntries(
    mergeProfileImport(content, imported).fields.map((field) => [
      field.field,
      field.outcome,
    ]),
  );
}

describe("mergeProfileImport", () => {
  it("fills every absent field and the empty story", () => {
    const result = mergeProfileImport(
      "---\nemail: ada@example.com\n---\n",
      imported,
    );

    expect(result.changed).toBe(true);
    expect(parse(result.content)).toEqual({
      metadata: {
        email: "ada@example.com",
        name: "Ada Morgan",
        headline: "Advisor on resilient software",
        industry: "Climate Technology",
        location: "Rotterdam, Netherlands",
        website: "https://ada.example.com",
      },
      body: "I build resilient software.",
    });
    expect(new Set(result.fields.map((field) => field.outcome))).toEqual(
      new Set(["fill"]),
    );
  });

  it("keeps what the owner wrote and reports it as preserved", () => {
    const owned = generateMarkdownWithFrontmatter("My own story.", {
      name: "Ada M.",
      headline: "Builder",
      industry: "Software",
      location: "Amsterdam",
      website: "https://ada.dev",
    });

    const result = mergeProfileImport(owned, imported);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(owned);
    expect(result.fields).toContainEqual({
      field: "headline",
      current: "Builder",
      imported: "Advisor on resilient software",
      outcome: "preserve",
    });
    expect(outcomes(owned)["story"]).toBe("preserve");
  });

  it("reports values LinkedIn already matches as unchanged", () => {
    const same = generateMarkdownWithFrontmatter(
      "I build resilient software.",
      {
        name: "Ada Morgan",
        headline: "Advisor on resilient software",
      },
    );

    expect(outcomes(same)).toMatchObject({
      name: "unchanged",
      headline: "unchanged",
      story: "unchanged",
      industry: "fill",
    });
  });

  it("replaces the recipe seed's placeholders", () => {
    const seed = `---\nname: Your Name Here\nwebsite: https://example.com\nemail: hello@example.com\n---\n\nThis is where your story goes. How you got here.\n\n(Delete this and write your own. Brain won't judge.)\n`;

    const result = mergeProfileImport(seed, imported);

    expect(parse(result.content).metadata).toMatchObject({
      name: "Ada Morgan",
      website: "https://ada.example.com",
      email: "hello@example.com",
    });
    expect(parse(result.content).body).toBe("I build resilient software.");
  });

  it("replaces the starter profile's placeholders", () => {
    const starter = generateMarkdownWithFrontmatter(
      "This brain picked **Cosmic Otter** as its starter name. Replace this placeholder with the person identity the brain represents.",
      { name: "Anchor for Cosmic Otter" },
    );

    expect(outcomes(starter)).toMatchObject({ name: "fill", story: "fill" });
  });

  it("writes nothing when nothing is imported", () => {
    const content = "---\nname: Ada\n---\n";
    const result = mergeProfileImport(content, {});

    expect(result).toEqual({ content, changed: false, fields: [] });
  });
});
