/**
 * Regression test for series cover image preservation
 *
 * This test verifies that coverImageId in frontmatter is preserved through:
 * 1. fromMarkdown (import from file)
 * 2. toMarkdown (export to file)
 * 3. The full round-trip simulating directory sync
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { SeriesAdapter } from "../src/adapters/series-adapter";
import type { Series } from "../src/schemas/series";
import { createTestEntity } from "@brains/test-utils";

const SERIES_FILE_WITH_COVER = `---
coverImageId: series-ecosystem-architecture-cover
name: Ecosystem Architecture
slug: ecosystem-architecture
---
# Ecosystem Architecture
`;

describe("Series coverImageId round-trip", () => {
  let adapter: SeriesAdapter;

  beforeEach(() => {
    adapter = new SeriesAdapter();
  });

  it("fromMarkdown should preserve coverImageId in content", () => {
    const parsed = adapter.fromMarkdown(SERIES_FILE_WITH_COVER);

    // Content should be the full markdown including frontmatter
    expect(parsed.content).toBe(SERIES_FILE_WITH_COVER);
    expect(parsed.content).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
  });

  it("toMarkdown should preserve coverImageId from content frontmatter", () => {
    // Simulate entity as it would exist after fromMarkdown
    const parsed = adapter.fromMarkdown(SERIES_FILE_WITH_COVER);
    if (!parsed.content || !parsed.metadata) throw new Error("Parse failed");

    const entity: Series = createTestEntity<Series>("series", {
      id: "series-ecosystem-architecture",
      content: parsed.content, // This should have frontmatter with coverImageId
      metadata: parsed.metadata,
    });

    const output = adapter.toMarkdown(entity);

    // Output should contain coverImageId
    expect(output).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
  });

  it("full round-trip: file -> fromMarkdown -> entity -> toMarkdown -> file", () => {
    // Step 1: Import from "file" (simulate directory sync import)
    const parsed = adapter.fromMarkdown(SERIES_FILE_WITH_COVER);
    if (!parsed.content || !parsed.metadata) throw new Error("Parse failed");

    // Step 2: Create entity as it would be stored
    const entity: Series = createTestEntity<Series>("series", {
      id: "series-ecosystem-architecture",
      content: parsed.content,
      metadata: parsed.metadata,
    });

    // Step 3: Export back to "file" (simulate directory sync export)
    const outputMarkdown = adapter.toMarkdown(entity);

    // Step 4: Verify coverImageId is preserved
    expect(outputMarkdown).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
    expect(outputMarkdown).toContain("name: Ecosystem Architecture");
    expect(outputMarkdown).toContain("slug: ecosystem-architecture");
  });

  it("simulates prepareEntityForStorage flow", () => {
    // This simulates what happens in entityService.updateEntity -> prepareEntityForStorage

    // Step 1: File content from disk
    const fileContent = SERIES_FILE_WITH_COVER;

    // Step 2: fromMarkdown called during import
    const parsed = adapter.fromMarkdown(fileContent);
    if (!parsed.content || !parsed.metadata) throw new Error("Parse failed");

    // Step 3: Entity created/updated with parsed content
    const entity: Series = createTestEntity<Series>("series", {
      id: "series-ecosystem-architecture",
      content: parsed.content,
      metadata: parsed.metadata,
    });

    // Step 4: prepareEntityForStorage calls toMarkdown
    // This markdown is what gets stored in DB as content
    const storedMarkdown = adapter.toMarkdown(entity);

    // Step 5: Later, when exporting, toMarkdown is called again on entity fetched from DB
    // The entity from DB will have content = storedMarkdown
    const entityFromDB: Series = {
      ...entity,
      content: storedMarkdown,
    };

    const exportedMarkdown = adapter.toMarkdown(entityFromDB);

    // Both should preserve coverImageId
    expect(storedMarkdown).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
    expect(exportedMarkdown).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
  });

  it("simulates convertToEntity flow (DB fetch with fromMarkdown call)", () => {
    // This simulates what convertToEntity does when fetching from DB

    // Step 1: Content stored in DB (output of toMarkdown from previous import)
    const parsed = adapter.fromMarkdown(SERIES_FILE_WITH_COVER);
    if (!parsed.content || !parsed.metadata) throw new Error("Parse failed");
    const entity: Series = createTestEntity<Series>("series", {
      id: "series-ecosystem-architecture",
      content: parsed.content,
      metadata: parsed.metadata,
    });
    const dbContent = adapter.toMarkdown(entity);

    console.log("DB content:", dbContent);

    // Step 2: convertToEntity calls fromMarkdown on DB content
    const parsedFromDB = adapter.fromMarkdown(dbContent);

    console.log("Parsed from DB content:", parsedFromDB.content);

    // Step 3: Entity is constructed with ...parsedFromDB overwriting content
    const entityFromDB: Series = createTestEntity<Series>("series", {
      id: "series-ecosystem-architecture",
      content: dbContent, // This gets overwritten by ...parsedFromDB
      metadata: {
        name: "Ecosystem Architecture",
        slug: "ecosystem-architecture",
      },
      ...parsedFromDB, // This overwrites content!
    });

    console.log("Entity from DB content:", entityFromDB.content);

    // Step 4: writeEntity calls toMarkdown on this entity
    const exportedMarkdown = adapter.toMarkdown(entityFromDB);

    console.log("Exported markdown:", exportedMarkdown);

    // Verify coverImageId is preserved through the entire flow
    expect(dbContent).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
    expect(entityFromDB.content).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
    expect(exportedMarkdown).toContain(
      "coverImageId: series-ecosystem-architecture-cover",
    );
  });
});
