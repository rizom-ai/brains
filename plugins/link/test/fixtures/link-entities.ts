/**
 * Test fixtures for link entities
 */

import type { LinkEntity } from "../../src";
import { computeContentHash } from "@brains/utils";

export const mockLinkContent = {
  simple: `# Test Article

## URL

https://example.com/test

## Description

Test description

## Summary

Test summary

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

## Keywords

- keyword1
- keyword2

## Domain

example.com

## Captured

2025-01-30T10:00:00.000Z`,
};

export const mockLinkEntity = (
  content: string = mockLinkContent.simple,
): LinkEntity => ({
  id: "link-1",
  entityType: "link" as const,
  content,
  contentHash: computeContentHash(content),
  metadata: {},
  created: "2025-01-30T10:00:00.000Z",
  updated: "2025-01-30T10:00:00.000Z",
});

/**
 * Create a mock LinkEntity with custom overrides
 */
export function createMockLinkEntity(
  overrides: Partial<Omit<LinkEntity, "contentHash">> & { content: string },
): LinkEntity {
  const content = overrides.content;
  return {
    id: overrides.id ?? "test-link",
    entityType: "link",
    content,
    contentHash: computeContentHash(content),
    created: overrides.created ?? "2025-01-30T10:00:00.000Z",
    updated: overrides.updated ?? "2025-01-30T10:00:00.000Z",
    metadata: overrides.metadata ?? {},
  };
}

export const mockAIResponse = {
  complete: {
    title: "Test Article",
    description: "A test article description",
    summary: "This is a test summary of the article content.",
    keywords: ["test", "article", "example"],
  },
  minimal: {
    title: "Test Article",
    description: "Test description",
    summary: "Test summary",
    keywords: ["test"],
  },
  missingFields: {
    title: "Test Article",
    // Missing required fields
  },
};
