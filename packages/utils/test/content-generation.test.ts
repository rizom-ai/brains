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
    },
  ) as unknown as <T>(options: ContentGenerateOptions<T>) => Promise<T>;

  it("should generate content using template with basic prompt", async () => {
    const result = await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      "test:content",
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "test:content",
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
      "test:content",
      {
        prompt: "Make it formal",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt:
        "Generate test content with title and content fields\n\nAdditional instructions: Make it formal",
      contentType: "test:content",
    });
  });

  it("should pass context data when provided", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      "test:content",
      {
        data: { key: "value" },
        style: "formal",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "test:content",
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
      "test:content",
      {
        examples,
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "test:content",
      context: {
        examples,
      },
    });
  });

  it("should work without persistence options", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      "test:content",
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "test:content",
    });
  });

  it("should handle all options together", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      "custom:type",
      {
        prompt: "Additional instructions",
        data: { key: "value" },
        examples: [{ title: "Example", content: "Content" }],
        style: "formal",
      },
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt:
        "Generate test content with title and content fields\n\nAdditional instructions: Additional instructions",
      contentType: "custom:type",
      context: {
        data: { key: "value" },
        examples: [{ title: "Example", content: "Content" }],
        style: "formal",
      },
    });
  });

  it("should not include context if no context values are provided", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      "test:content",
      {}, // Empty context
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "test:content",
    });
  });


  it("should use provided contentType", async () => {
    await generateWithTemplate(
      mockGenerateContent,
      testTemplate,
      "specific:type",
    );

    expect(mockGenerateContent).toHaveBeenCalledWith({
      schema: testSchema,
      prompt: "Generate test content with title and content fields",
      contentType: "specific:type",
    });
  });
});
