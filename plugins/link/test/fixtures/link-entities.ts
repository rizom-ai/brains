/**
 * Test fixtures for link entities
 */

import type { LinkEntity } from "../../src";
import { computeContentHash } from "@brains/utils";

export const mockLinkContent = {
  simple: `---
status: draft
title: Test Article
url: https://example.com/test
description: Test description
keywords:
  - test
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

Test summary`,

  withMultipleTags: `---
status: draft
title: Test Article
url: https://example.com/test
description: Test description
keywords:
  - test
  - example
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

Test summary`,

  published: `---
status: published
title: Published Article
url: https://example.com/published
description: A published article
keywords:
  - published
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "mcp:stdio"
  label: MCP
---

Summary of published article`,

  fromMatrix: `---
status: draft
title: Matrix Article
url: https://example.com/matrix
description: Article from Matrix
keywords:
  - matrix
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "matrix:!abc123:rizom.ai"
  label: "#engineering"
---

Summary from Matrix channel`,

  article1: `---
status: draft
title: Article 1
url: https://example.com/article1
description: First article
keywords:
  - keyword1
  - keyword2
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

Summary of first article`,
};

export const mockLinkEntity = (
  content: string = mockLinkContent.simple,
): LinkEntity => ({
  id: "link-1",
  entityType: "link" as const,
  content,
  contentHash: computeContentHash(content),
  metadata: { status: "draft", title: "Test Article" },
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
    metadata: overrides.metadata ?? { status: "draft" },
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
