/**
 * Test fixtures for link entities
 */

export const mockLinkContent = {
  simple: `# Test Article

## URL

https://example.com/test

## Description

Test description

## Summary

Test summary

## Content

Test content

## Keywords

- test

## Domain

example.com

## Captured

2025-01-30T10:00:00.000Z`,

  withMultipleTags: `# Test Article

## URL

https://example.com/test

## Description

Test description

## Summary

Test summary

## Content

Test content

## Keywords

- test
- example

## Domain

example.com

## Captured

2025-01-30T10:00:00.000Z`,

  article1: `# Article 1

## URL

https://example.com/article1

## Description

First article

## Summary

Summary of first article

## Content

Content here

## Keywords

- keyword1
- keyword2

## Domain

example.com

## Captured

2025-01-30T10:00:00.000Z`,
};

export const mockLinkEntity = (content: string = mockLinkContent.simple) => ({
  id: "link-1",
  entityType: "link" as const,
  content,
  metadata: {},
  created: "2025-01-30T10:00:00.000Z",
  updated: "2025-01-30T10:00:00.000Z",
});

export const mockAIResponse = {
  complete: {
    title: "Test Article",
    description: "A test article description",
    summary: "This is a test summary of the article content.",
    content:
      "# Test Article\n\nThis is the main article content with some details.",
    keywords: ["test", "article", "example"],
  },
  minimal: {
    title: "Test Article",
    description: "Test description",
    summary: "Test summary",
    content: "Test content",
    keywords: ["test"],
  },
  missingFields: {
    title: "Test Article",
    // Missing required fields
  },
};
