/**
 * Shared test fixtures and helpers for directory-sync tests.
 *
 * Consolidates duplicated mock objects, adapters, and constants
 * used across multiple test files.
 */
import { mock } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import type { z } from "@brains/utils";
import type { IDirectorySync, ImportResult, ExportResult } from "../src/types";

// ---------------------------------------------------------------------------
// PNG test data
// ---------------------------------------------------------------------------

/** Base64-encoded 1x1 pixel PNG. */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** 1x1 pixel PNG as raw bytes. */
export const TINY_PNG_BYTES = Buffer.from(TINY_PNG_BASE64, "base64");

/** 1x1 pixel PNG as a data URL (used by image entity content). */
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

// ---------------------------------------------------------------------------
// Empty result factories
// ---------------------------------------------------------------------------

export function emptyImportResult(
  overrides: Partial<ImportResult> = {},
): ImportResult {
  return {
    imported: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    quarantinedFiles: [],
    errors: [],
    jobIds: [],
    ...overrides,
  };
}

export function emptyExportResult(
  overrides: Partial<ExportResult> = {},
): ExportResult {
  return {
    exported: 0,
    failed: 0,
    errors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MockEntityAdapter – minimal adapter for test harness registration
// ---------------------------------------------------------------------------

export class MockEntityAdapter implements EntityAdapter<BaseEntity> {
  public readonly entityType: string;
  public readonly schema = baseEntitySchema;

  constructor(entityType = "base") {
    this.entityType = entityType;
  }

  fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }

  toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  extractMetadata(_entity: BaseEntity): Record<string, unknown> {
    return {};
  }

  parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return schema.parse({});
  }

  generateFrontMatter(_entity: BaseEntity): string {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Mock IDirectorySync – used by job handler tests
// ---------------------------------------------------------------------------

export function createMockDirectorySync(
  overrides: Partial<IDirectorySync> = {},
): IDirectorySync {
  return {
    importEntitiesWithProgress: mock(() =>
      Promise.resolve(emptyImportResult()),
    ),
    exportEntitiesWithProgress: mock(() =>
      Promise.resolve(emptyExportResult()),
    ),
    getAllMarkdownFiles: mock(() => []),
    processEntityExport: mock(() => Promise.resolve({ success: true })),
    fileOps: {
      readEntity: mock(() => Promise.resolve({} as never)),
      parseEntityFromPath: mock(() => ({ entityType: "topic", id: "test" })),
    },
    ...overrides,
  };
}
