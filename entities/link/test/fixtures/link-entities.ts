/**
 * Test fixtures for link entities
 */

import type { LinkEntity } from "../../src";
import { createTestEntity } from "@brains/test-utils";

export const mockLinkContent = {
  simple: `---
status: draft
title: Test Article
url: https://example.com/test
description: Test description
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

Test summary`,

  withMultipleDescriptions: `---
status: draft
title: Test Article
url: https://example.com/test
description: Test description
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
): LinkEntity =>
  createTestEntity<LinkEntity>("link", {
    id: "link-1",
    content,
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
  return createTestEntity<LinkEntity>("link", {
    id: overrides.id ?? "test-link",
    content: overrides.content,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? { status: "draft", title: "Test Link" },
  });
}

export const mockAIResponse = {
  complete: {
    title: "Test Article",
    description: "A test article description",
    summary: "This is a test summary of the article content.",
  },
  minimal: {
    title: "Test Article",
    description: "Test description",
    summary: "Test summary",
  },
  missingFields: {
    title: "Test Article",
    // Missing required fields
  },
};
