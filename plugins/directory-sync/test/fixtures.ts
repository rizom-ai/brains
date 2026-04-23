/**
 * Shared test fixtures and helpers for directory-sync tests.
 *
 * Consolidates duplicated mock objects, adapters, and constants
 * used across multiple test files.
 */
import { mock } from "bun:test";
import type { BaseEntity } from "@brains/plugins/test";
import { baseEntitySchema, BaseEntityAdapter } from "@brains/plugins/test";
import { z } from "@brains/utils";
import type {
  IDirectorySync,
  IGitSync,
  ImportResult,
  ExportResult,
} from "../src/types";
import type { BatchResult } from "../src/lib/batch-operations";

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

export class MockEntityAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType = "base") {
    super({
      entityType,
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }

  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }
}

// ---------------------------------------------------------------------------
// Mock IDirectorySync – used by job handler tests
// ---------------------------------------------------------------------------

export function createMockDirectorySync(
  overrides: Partial<IDirectorySync> = {},
): IDirectorySync {
  const base: IDirectorySync = {
    initialize: mock(async () => {}),
    initializeDirectory: mock(async () => {}),
    setJobQueueCallback: mock(() => {}),
    sync: mock(async () => ({
      export: emptyExportResult(),
      import: emptyImportResult(),
      duration: 0,
    })),
    processEntityExport: mock(async () => ({ success: true })),
    exportEntities: mock(async () => emptyExportResult()),
    importEntitiesWithProgress: mock(async () => emptyImportResult()),
    exportEntitiesWithProgress: mock(async () => emptyExportResult()),
    importEntities: mock(async () => emptyImportResult()),
    removeOrphanedEntities: mock(async () => ({ deleted: 0, errors: [] })),
    fileOps: {
      readEntity: mock(async () => ({}) as never),
      parseEntityFromPath: mock(() => ({ entityType: "topic", id: "test" })),
    },
    shouldDeleteOnFileRemoval: true,
    getAllMarkdownFiles: mock(async () => []),
    ensureDirectoryStructure: mock(async () => {}),
    getStatus: mock(async () => ({
      syncPath: "/tmp/test",
      exists: true,
      watching: false,
      files: [],
      stats: { totalFiles: 0, byEntityType: {} },
    })),
    queueSyncBatch: mock(async (): Promise<BatchResult | null> => null),
    startWatching: mock(async () => {}),
    stopWatching: mock(() => {}),
    setWatchCallback: mock(() => {}),
  };
  return Object.assign(base, overrides);
}

export function createMockGitSync(overrides: Partial<IGitSync> = {}): IGitSync {
  const base: IGitSync = {
    withLock: <T>(fn: () => Promise<T>): Promise<T> => fn(),
    initialize: mock(async () => {}),
    hasRemote: () => true,
    getStatus: mock(async () => ({
      isRepo: true,
      hasChanges: false,
      ahead: 0,
      behind: 0,
      branch: "main",
      files: [],
    })),
    hasLocalChanges: mock(async () => false),
    commit: mock(async () => {}),
    push: mock(async () => {}),
    pull: mock(async () => ({ files: [] })),
    log: mock(async () => []),
    show: mock(async () => ""),
    cleanup: () => {},
  };
  return Object.assign(base, overrides);
}
