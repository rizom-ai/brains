import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteContentAdapter } from "../../src/site-content-adapter";
import { z } from "zod";
import type { ContentTypeRegistry } from "@brains/types";
import { Logger } from "@brains/utils";

describe("SiteContentAdapter Validation", () => {
  let adapter: SiteContentAdapter;
  let mockRegistry: Pick<ContentTypeRegistry, "get">;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create mock logger that doesn't output during tests
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      child: mock(() => mockLogger),
    } as unknown as Logger;

    adapter = new SiteContentAdapter(mockLogger);

    // Create mock registry
    mockRegistry = {
      get: mock((contentType: string) => {
        if (contentType === "webserver:landing:hero") {
          return z.object({
            headline: z.string(),
            subheadline: z.string(),
            ctaText: z.string(),
            ctaLink: z.string(),
          });
        }
        return null;
      }),
    };
  });

  it("should validate content when schema is found", () => {
    adapter.setContentTypeRegistry(mockRegistry);

    const markdown = `---
page: landing
section: hero
---
headline: "Welcome to our site"
subheadline: "The best solution for your needs"
ctaText: "Get Started"
ctaLink: "/signup"
`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.page).toBe("landing");
    expect(result.section).toBe("hero");
    expect(result.data).toEqual({
      headline: "Welcome to our site",
      subheadline: "The best solution for your needs",
      ctaText: "Get Started",
      ctaLink: "/signup",
    });

    // Verify registry was called with correct content type
    expect(mockRegistry.get).toHaveBeenCalledWith("webserver:landing:hero");
  });

  it("should log error but continue when validation fails", () => {
    adapter.setContentTypeRegistry(mockRegistry);

    const markdown = `---
page: landing
section: hero
---
headline: "Welcome to our site"
# Missing required fields: subheadline, ctaText, ctaLink
`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.page).toBe("landing");
    expect(result.section).toBe("hero");
    expect(result.data).toEqual({
      headline: "Welcome to our site",
    });

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("should work without registry set", () => {
    // Don't set registry
    const markdown = `---
page: landing
section: hero
---
headline: "Welcome to our site"
invalidField: "This would fail validation"
`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.page).toBe("landing");
    expect(result.section).toBe("hero");
    expect(result.data).toEqual({
      headline: "Welcome to our site",
      invalidField: "This would fail validation",
    });
  });

  it("should handle no schema found for content type", () => {
    adapter.setContentTypeRegistry(mockRegistry);

    const markdown = `---
page: about
section: team
---
title: "Our Team"
description: "Meet the people behind the product"
`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.page).toBe("about");
    expect(result.section).toBe("team");
    expect(result.data).toEqual({
      title: "Our Team",
      description: "Meet the people behind the product",
    });

    // Verify registry was called
    expect(mockRegistry.get).toHaveBeenCalledWith("webserver:about:team");
    // Verify debug log for no schema found
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it("should handle invalid YAML gracefully", () => {
    adapter.setContentTypeRegistry(mockRegistry);

    const markdown = `---
page: landing
section: hero
---
{ invalid: yaml content
`;

    const result = adapter.fromMarkdown(markdown);

    expect(result.page).toBe("landing");
    expect(result.section).toBe("hero");
    // Should treat invalid YAML as plain text
    expect(result.data).toEqual({
      content: "{ invalid: yaml content",
    });

    // Verify warning was logged
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
