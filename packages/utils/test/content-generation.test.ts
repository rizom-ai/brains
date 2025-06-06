import { describe, expect, it, mock } from "bun:test";
import { generateWithTemplate } from "../src/content-generation";
import { z } from "zod";
import type { ContentTemplate, ContentGenerateOptions } from "@brains/types";

describe("generateWithTemplate", () => {
  const testSchema = z.object({
    title: z.string(),
    content: z.string(),
  });

  type TestContent = z.infer<typeof testSchema>;

  const testTemplate: ContentTemplate<TestContent> = {
    name: "test-template",
    description: "Test template",
    schema: testSchema,
    basePrompt: "Generate test content with title and content fields",
  };

  // Create a mock function that properly handles the generic type
  const mockGenerateContent = mock(
    async <T>(_options: ContentGenerateOptions<T>): Promise<T> => {
      // TypeScript needs the cast here because it can't infer that our test data
      // will match whatever T is passed in during the test
      return {
        title: "Generated Title",
        content: "Generated Content",
      } as unknown as T;
    }
  ) as unknown as <T>(options: ContentGenerateOptions<T>) => Promise<T>;

  it("should generate content using template with basic prompt", async () => {
    const result = await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
    });

    expect(result).toEqual({
      title: "Generated Title",
      content: "Generated Content",
    });
  });

  it("should combine template prompt with additional prompt", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      {
        prompt: "Make it formal",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields\n\nAdditional instructions: Make it formal",
    });
  });

  it("should pass context data when provided", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      {
        data: { key: "value" },
        style: "formal",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      context: {
        data: { key: "value" },
        style: "formal",
      },
    });
  });

  it("should pass examples when provided", async () => {
    const examples = [
      { title: "Example 1", content: "Content 1" },
      { title: "Example 2", content: "Content 2" },
    ];

    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      {
        examples,
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      context: {
        examples,
      },
    });
  });

  it("should pass persistence options when provided", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      undefined,
      {
        save: true,
        contentType: "test:content",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      save: true,
      contentType: "test:content",
    });
  });

  it("should handle all options together", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      {
        prompt: "Additional instructions",
        data: { key: "value" },
        examples: [{ title: "Example", content: "Content" }],
        style: "formal",
      },
      {
        save: true,
        contentType: "custom:type",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields\n\nAdditional instructions: Additional instructions",
      context: {
        data: { key: "value" },
        examples: [{ title: "Example", content: "Content" }],
        style: "formal",
      },
      save: true,
      contentType: "custom:type",
    });
  });

  it("should not include context if no context values are provided", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      {}, // Empty context
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
    });
  });

  it("should only include save option when explicitly set", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      undefined,
      {
        save: false,
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      save: false,
    });
  });

  it("should only include contentType when provided", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      undefined,
      {
        contentType: "specific:type",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "specific:type",
    });
  });
});